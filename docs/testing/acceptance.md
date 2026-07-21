# Prototype acceptance criteria

The prototype is accepted by causal evidence, not by route or class existence.

## Identity and image loop

- Changing current bodily belief or portrait intent changes figure geometry while
  the authored body plan and non-negotiable features remain recognizable.
- Given the same source portrait and tuning, an observer returns the same perceived
  evidence. Different observer models return materially different evidence.
- Changing one bounded perception control changes only the model effects it owns.
- A peer portrait is newly rendered from perceived evidence through that peer's
  artistic ability. Source SVG markup is never nested or copied into the result.
- Ability scores visibly change proportion, anatomy, mark control, detail, or spatial
  coherence independently of perception.
- A social portrait identifies each contributing peer drawing and carries measured
  self/social deltas and peer disagreement.
- Reflection receives that structured evidence. A changed material delta changes the
  next bodily adjustment; a caption-only change does not masquerade as evidence.
- Repeated cycles retain identity and tension. Perceived similarity cannot reach a
  mechanically perfect terminal value.

## Provider boundary

- Missing credentials, timeout, rate limit, invalid JSON, invalid schema, and an
  oversized response all enter procedural fallback without stopping a cycle.
- Observability receives operation, Individual, cycle, category, and retryability—
  never a prompt, provider body, API key, private narrative, or raw exception.
- Provider output cannot introduce unbounded arrays/strings, unknown peers,
  relationship mutations, non-finite numbers, or executable artwork.

## Durability and scheduling

- A genuinely missing state file creates initial identity. Invalid or incompatible
  state creates a durable per-Individual quarantine marker before being moved;
  repeated loads, ordinary saves, and restarted runtimes remain blocked rather
  than silently creating a new identity. Only a validated administrative
  replacement matching the installed manifest clears that marker.
- Invalid active memory creates the same durable per-Individual block; a missing
  file with matching legacy evidence is never interpreted as an empty history.
  Recall and writes resume only after a validated administrative replacement.
- Failure before, during, and after snapshot/memory writes is recoverable and
  idempotent. A completed cycle cannot retain memory without its matching snapshot
  after recovery, or vice versa.
- Memory, telemetry, artifacts, subscribers, request bodies, and event queues have
  tested count and byte bounds.
- Per-Individual cycles do not overlap. Global concurrency, spacing, rate, timeout,
  and provider-budget policies deny work predictably and expose sanitized events.
- Curator perception tuning is validated against its manifest, durably saved before
  acknowledgement, and restored after restart.
- Graceful stop drains within a bound; interrupted work is recovered from the
  persistence journal on the next start.

## Public API and exhibition

- The public snapshot is constructed from an allowlist and contains no private
  narrative, prompt, memory, relationship/trust state, provider response, path,
  stack trace, or raw SVG.
- Public portrait references resolve only to bounded, generated, same-origin
  artifacts with safe headers and opaque IDs.
- Pause, resume, and perception routes require correct bearer authorization, exact
  allowed origin, JSON content type, schema-valid bounded bodies, and rate budget.
- SSE publishes versioned snapshots and heartbeat events, cleans up disconnected
  clients, applies backpressure/connection bounds, and supports poll recovery.
- The browser rejects unknown or malformed fields, stale regressions, out-of-range
  tuning, non-same-origin artwork, and oversized payloads while retaining its last
  verified state.
- Live self, peer, and social images come from runtime artifacts. Any procedural
  substitute is explicitly labeled as a local study.
- Curator credentials exist only in component memory and disappear when the panel
  closes or the page reloads.
- Before a release candidate is accepted, keyboard navigation, dialog focus
  containment, reduced motion, narrow viewports, image failure, runtime outage,
  and late reconnection are verified in a real browser using the release checklist.

## Physical and multi-location boundaries

- A physical frame without explicit machine interpretation cannot borrow a digital
  portrait descriptor and claim successful camera observation.
- Commissioning cannot pass without route, privacy, safety, power, thermal, and
  calibration evidence.
- The protocol core is versioned, bounded, idempotent, sequence-aware,
  acknowledged after application, and retained for bounded retry through outages.
- Before an inter-site transport is commissioned, tests prove mutual
  authentication, encryption, site authorization, key rotation, and rejection of
  unauthenticated envelopes.
- A content digest is not described as authentication. Migration trust is supplied
  by a verifier or an explicit out-of-band procedure.

## Required commands

```sh
npm ci
npm run check
npm audit --audit-level=high
docker build --tag individuals-web:test .
docker build --file Dockerfile.runtime --tag individuals-runtime:test .
```

Browser and live API tests should run against a temporary data directory and a
random available port. Test state must never be written to the repository's
production `.data/` path.

`npm run check` is the automated contract gate; it does not claim to exercise a
browser layout or accessibility tree. The separate, required browser release pass
is documented in [`browser-release.md`](browser-release.md). Record its result in
the pull request or release notes rather than committing screenshots and temporary
runtime state.
