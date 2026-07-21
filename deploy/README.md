# Deployment assets

- `nginx.conf` serves the exhibition from an unprivileged, read-only container,
  applies browser security headers, and proxies only the runtime API and health
  routes.
- `host-nginx/` contains context-correct includes for public-read, curator-control,
  and SSE limits at the trusted host TLS edge, where the real connection address
  is available. Its README documents the exact shared-host assembly.
- `host-nginx.example.conf` is a standalone CI syntax-test harness for those
  fragments, not a production replacement configuration.
- `secrets/` is a read-only host mount for runtime credentials; secret contents are
  ignored by Git and Docker builds.
- [`../docs/operations/deployment.md`](../docs/operations/deployment.md) is the
  production runbook.

Install the host includes at their documented `http` and HTTPS `server` contexts.
Point only the chosen Individuals hostname at the loopback port configured by
`INDIVIDUALS_PORT`; the host continues to route every other project independently.
