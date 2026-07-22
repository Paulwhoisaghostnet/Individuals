# Security and privacy boundaries

The exhibition is public; identity internals and curator authority are not.

## Public data

The public projection may contain display identity, cycle/status information,
bounded perception tuning values, public reflection fragments, and current portrait
artifacts. It must be constructed field by field and versioned. Internal snapshots,
long-term memory, relationship trust, private narrative, prompts, filesystem paths,
provider responses, stack traces, and credentials are never serialized to it.

## Curator controls

Mutation routes require an explicit bearer token, strict JSON content type, bounded
payload validation, an allowed origin, and rate limiting. The browser accepts the
token only through the curator panel and holds it in component memory for that
session. It is not placed in build variables, global configuration, URLs,
`localStorage`, telemetry, or error messages.

The trusted host TLS proxy applies per-client public-read, mutation, connection, and
stream limits using the actual network connection address. It replaces the one
canonical forwarding pair (`X-Forwarded-For` and `X-Forwarded-Proto`) and removes
alternate identity, host, port, and scheme aliases. The Docker web proxy preserves
that pair without appending its gateway or substituting its plain-HTTP scheme, then
clears the aliases again. Neither it nor the private runtime uses forwarded metadata
for authorization or rate-limit identity. Their bounded limits are higher
installation-wide backstops; the required edge configuration prevents one hostile
address from consuming them.

The public exhibition remains useful without curator authority. Read routes and
the event stream do not require the control token.

## Stored state

Runtime state is written beneath the configured data directory with restricted
permissions. Loads are schema-validated. Corrupt or incompatible records are
quarantined with a sanitized reason instead of being silently treated as a new
identity. A recoverable journal protects the snapshot/memory commit boundary.

`.data/` is ignored by both Git and container build contexts. Production uses a
dedicated volume and must be backed up independently of application images.

## Offline curatorial exports

The retained portrait timeline is an explicit offline boundary, not a public API
route. It accepts only fully validated snapshots and the shared inert public-SVG
subset, embeds no live markup or remote resources, and writes atomically with
owner-only permissions outside snapshot, memory, journal, and quarantine paths.

Private memory is neither read nor exported by default. Crossing that boundary
requires the CLI's exact acknowledgement phrase and produces a prominently marked
sensitive document. Local processing and restrictive permissions do not make that
portable file public-safe; copying, uploading, or distributing it remains an
explicit curator responsibility.

## External providers

Provider base URLs and keys are server-only configuration. Calls are bounded by
timeouts, concurrency, cadence, and budgets. Output is parsed as untrusted data and
validated before it can influence state. Failure records expose category and timing,
not request content or secrets; deterministic procedural systems preserve the loop
during an outage.

## Browser and reverse proxy

The web service applies a restrictive content security policy, disables embedding,
declines browser camera/microphone access, limits request bodies, and proxies only
the API path to the internal runtime. SSE buffering is disabled. The runtime is not
published directly by the production composition. Per-client controls live at the
host TLS edge because the container proxy sees only a trusted proxy hop.

## Physical cameras

Physical cameras are intended to observe peer canvases, not visitors. A future
installation must prove framing, masking, retention, signage, and access controls
for its site before enabling capture. A camera adapter cannot be considered
commissioned from configuration alone; it requires captured-frame evidence.
