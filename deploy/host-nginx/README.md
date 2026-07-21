# Shared-host Nginx integration

These files are context-specific includes for the trusted TLS proxy on the
Hetzner host. They are deliberately separate because Nginx accepts shared-memory
rate-limit zones only in `http {}`, while routing belongs in one `server {}`.

Install all three files at `/etc/nginx/individuals/`, then include them as shown:

```nginx
http {
  # Include once, regardless of how many virtual hosts the machine serves.
  include /etc/nginx/individuals/http-limits.conf;

  server {
    listen 443 ssl;
    server_name individuals.example.org;

    # Existing certificate and TLS policy remain host-owned.
    include /etc/nginx/individuals/server-locations.conf;
  }
}
```

`server-locations.conf` owns `/` for this hostname and sends it only to the
loopback web port `127.0.0.1:4174`. Change that port in both the include and
`INDIVIDUALS_PORT` if the shared host already uses it. Do not include these
locations in another project's virtual host.

The edge derives its limiting key from `$binary_remote_addr`, replaces
`X-Forwarded-For` with the single connection address, sets
`X-Forwarded-Proto` from `$scheme`, and removes alternate forwarding aliases.
Do not enable `real_ip` processing from arbitrary sources or change the limit
keys to a request header. If a CDN or load balancer is later placed in front,
declare only its documented address ranges as trusted before enabling the
corresponding real-IP module.

Validate the whole shared host configuration before a graceful reload:

```sh
sudo nginx -t
sudo nginx -s reload
```

[`../host-nginx.example.conf`](../host-nginx.example.conf) is a standalone,
non-TLS assembly harness used by CI to syntax-check these exact fragments. It is
not a replacement for the host's existing Nginx configuration.
