# Production deployment

The production composition is isolated from other projects on the host. Only the
web service publishes a port, and it binds to loopback; the runtime, data volume,
network, health stream, and secrets belong to the `individuals` Compose project.

Use Docker Compose 2.24.0 or newer. The composition uses the `env_file.required`
field introduced in that release so a missing optional `.env` is handled
deliberately rather than by a version-dependent parser failure.

## Prepare configuration

```sh
cp .env.example .env
```

Set `INDIVIDUALS_ALLOWED_ORIGINS` to the exact public HTTPS origin used by the
browser. Keep `INDIVIDUALS_PORT` distinct from every other loopback service on the
host. The trusted host-level reverse proxy must terminate TLS, forward only the
Individuals hostname to that port, overwrite client-supplied forwarding metadata,
and enforce client-address limits before traffic reaches Docker. Install the
context-correct files documented in
[`deploy/host-nginx/README.md`](../../deploy/host-nginx/README.md): the limit zones
belong once in the shared `http` context and the routes belong only in the
Individuals HTTPS server. Run `nginx -t` before every reload.

The only trusted forwarding pair is a single `X-Forwarded-For` value derived from
the edge connection and `X-Forwarded-Proto` derived from the edge request scheme.
The edge removes `Forwarded`, `X-Real-IP`, forwarded host/port/server, and scheme
aliases. The inner proxy preserves the canonical pair instead of appending the
Docker gateway or replacing public HTTPS with its own HTTP hop; it removes the
aliases again. Runtime authorization and rate limiting never depend on forwarding
headers.

The edge allows ordinary traffic at 20 requests/second with a 200-request burst
and 32 concurrent requests per client address, curator mutations at 60/minute with
a burst of 30, and at most 16 long-lived SSE streams per address. The inner web
container sees the host/Docker gateway for every viewer, so its 100 requests/second,
256 concurrent requests, 10 controls/second, and 64-stream ceilings are deliberately
higher installation-wide backstops—not per-client controls. Nginx refreshes the
runtime service address through Docker DNS after container recreation.

A process already running on the host can reach the loopback web port without
crossing the public edge's per-client policy. Treat host accounts and services as
part of the trusted operations boundary; the inner installation-wide ceilings
still contain this path. Use host firewall/user isolation if untrusted local
workloads are ever introduced.

Curator controls are disabled when no token is configured. The runtime is a
non-root container, so first create a dedicated host group whose numeric GID
matches `INDIVIDUALS_SECRET_GID` (the example uses `991`). Grant that group
read-only traversal of the secret directory; do not make secrets world-readable.
For example, as a host administrator:

```sh
sudo groupadd --system --gid 991 individuals-secrets
sudo chgrp individuals-secrets deploy/secrets
sudo chmod 0750 deploy/secrets
umask 027
openssl rand -base64 48 > deploy/secrets/curator-token
chgrp individuals-secrets deploy/secrets/curator-token
chmod 0640 deploy/secrets/curator-token
```

If GID `991` is already assigned, choose a dedicated existing or new group and set
the same numeric value in `.env`. `groupadd` is a one-time operation; an
already-existing group is not an error condition for later deployments.

Then add this to `.env`:

```dotenv
INDIVIDUALS_CURATOR_TOKEN_FILE=/run/secrets/curator-token
```

Model-backed cognition is optional. Put a provider key in
`deploy/secrets/llm-api-key`, set `LLM_API_KEY_FILE=/run/secrets/llm-api-key`, and
configure the provider base URL and model ID. Apply the same group and `0640`
permissions to that file. With no key, cognition uses the procedural evidence path
and the installation remains operational.

## Build and start

```sh
docker compose -f compose.production.yml config --quiet
docker compose -f compose.production.yml up -d --build --remove-orphans
```

The web service runs as an unprivileged process on its internal port, with a
read-only root filesystem, no Linux capabilities, and a small no-execute temporary
filesystem. It waits for runtime health before starting. Verify liveness,
readiness, and the versioned public projection through the loopback port:

```sh
curl -fsS http://127.0.0.1:4174/healthz
curl -fsS http://127.0.0.1:4174/readyz
curl -fsS http://127.0.0.1:4174/api/v1/society
```

From outside the host, verify the public HTTPS edge separately: more than 16 streams
from distinct client addresses must remain possible, while a seventeenth concurrent
stream from one address is rejected. Confirm that a forged `X-Forwarded-For`,
`Forwarded`, `X-Real-IP`, `X-Forwarded-Host`, or `X-Forwarded-Port` value neither
changes the edge's rate-limit identity nor survives as a competing identity header.
Do not claim per-client protection from a loopback-only smoke test.

`/healthz` is process liveness; Docker records its result and uses it to gate the
web service's initial dependency start. The Engine's `restart: unless-stopped`
policy reacts to process exit, not to an `unhealthy` status by itself. `/readyz` is
traffic readiness and requires a running society with at least one non-faulted
Individual. Provider fallback degrades cognition telemetry but does not make the
exhibition unready or cause the process to exit. If automatic remediation for an
unhealthy-but-running container is required, configure and test an external
supervisor explicitly rather than assuming Docker restart policy provides it.

Do not publish runtime port `4175` on the host and do not route arbitrary URL
prefixes to it.

The Compose file applies CPU, memory, process, and log ceilings to both services so
Individuals cannot consume the entire host shared with `lilguys.xyz`. Treat the
defaults as safe starting limits, then tune them from measured cycle and image
workloads while retaining a hard ceiling.

The application also enforces disk budgets inside the data volume. At the current
17-Individual maximum, active memory, one backup, and per-Individual archives are
bounded to roughly 340 MiB. Active journals are capped at 64 MiB installation-wide;
abandoned journals, transaction-journal quarantine, and rotatable active-memory
evidence are each capped at 32 MiB. Durable snapshot and active-memory quarantine
markers are not pruning candidates. Snapshot corruption evidence is retained until
an operator exports or removes it after reviewed recovery and is outside this
allowance. These limits do not replace host free-space alerts or a filesystem/volume
quota. Alert before the volume reaches 80%, because snapshots, portrait artifacts,
tuning, telemetry, backups, markers, and temporary atomic writes require headroom
outside the memory/journal allowance.

## Routine operations

```sh
docker compose -f compose.production.yml ps
docker compose -f compose.production.yml logs --tail=200 individuals-runtime
docker compose -f compose.production.yml restart individuals-web
docker compose -f compose.production.yml exec individuals-runtime npm run export:timeline
docker compose -f compose.production.yml cp individuals-runtime:/var/lib/individuals/exports/timeline.html ./individuals-timeline.html
```

The timeline command exports only validated retained portraits by default. Private
memory is not read. Review the explicit acknowledgement and handling rules in
[`software/individual/timeline/README.md`](../../software/individual/timeline/README.md)
before using its private-memory option.

Runtime telemetry and container logs are bounded. A provider fallback is a degraded
cognition event, not a reason to recycle the process. Repeated cycle faults,
persistence quarantine, or an unhealthy container require investigation before
resuming curator-controlled cycles. Restarting a process without addressing a
durable fault does not clear its quarantine marker.

## State and backup

The `individuals-data` named volume contains snapshots, memory, tuning, transaction
journals, quarantined records, and telemetry. It is independent of container images
and must be included in host backups.

For a consistent manual backup, pause public maintenance at the host proxy, stop the
runtime cleanly, archive the volume with the host's approved backup tooling, then
start the composition again. Do not copy live files by hand while a cycle commit is
in progress. Test restoration into a separate Compose project before treating a
backup as valid.

Corrupt records are moved into a `.quarantine` directory and surfaced as startup or
health failures. Snapshot and active-memory quarantine markers remain authoritative
across load, save, and restart and are never automatically deleted: inspect the
sanitized error, retain a forensic copy, and use the explicit replacement/recovery
path or a reviewed migration. Snapshot evidence is retained until operator review.
Older active-memory evidence artifacts and transaction-journal quarantine are
rotatable forensic retention classes; their oldest eligible files rotate at the
documented count and byte ceilings. Export eligible evidence before resuming the
runtime if an investigation requires longer retention. Never remove a marker merely
to make startup succeed.

Quota exhaustion has two routes. Eligible archives, older active-memory evidence,
and transaction-journal quarantine are pruned oldest-first. Active memory,
snapshots, their quarantine markers, snapshot corruption evidence, and committing
journals are never pruned automatically: a write fails with
`PERSISTENCE_QUOTA_EXCEEDED`, or startup fails closed when the pre-existing active
journal set is already over budget. Free space or export retained evidence, then
restart; do not delete an active journal or authoritative marker by hand.

## Upgrade and rollback

Before an upgrade:

1. Run `npm run check` and build both production images.
2. Capture and verify a state-volume backup.
3. Review schema and public API changes.
4. Deploy, then confirm health, public projection, SSE updates, and one full cycle.

Application rollback and state rollback are separate decisions. Do not run an older
image against a newer state schema unless its migration documentation explicitly
allows it.
