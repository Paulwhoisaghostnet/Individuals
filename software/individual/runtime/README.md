# Runtime

The runtime assembles an identity package and capability adapters into one living
Individual process.

The prototype implements:

- typed configuration loading and startup validation;
- dependency assembly for the core `IndividualEngine`;
- cycle scheduling, pause, resume, drain, and graceful shutdown;
- serialized cycle admission, including a durable UTC-day provider-call budget;
- crash recovery and incomplete-cycle handling;
- health and readiness reporting;
- state/protocol version and migration compatibility checks;
- resource limits and independent process/container operation.

Runtime configuration selects capabilities but must not redefine authored identity
without an explicit manifest change.

Society membership is an explicit allowlist derived from the active manifests; it
is separate from learned peer trust. Curator pause state is intentionally local to
the running process and clears on restart, while perception tuning and cycle
budgets are durable. A pause prevents future scheduled admissions but does not
cancel an identity cycle already in flight.

The prototype admits 1–17 Individuals per runtime. This is the exact whole-society
bound implied by the current 16-peer causal cohort; larger installations must use
the future bounded-cohort protocol rather than silently dropping peers.

Pending peer drawings are process-local routes tied to the subject's current self
canvas. When a subject commits a social composite, the exact ordered drawings it
consumed are stored atomically beside that composite and are the only peer drawings
published with it. Restart restores that completed causal bundle but does not replay
it as pending feedback. Undelivered pending drawings are intentionally not durable;
durable delivery would require a separate per-artist outgoing protocol.

Every manual or scheduled cycle has one end-to-end deadline covering
initialization, policy admission, provider work, and durable persistence. Timeout
aborts cooperative adapters and releases society-wide capacity, but the affected
Individual remains fenced from another cycle until the abandoned operation
actually settles. This preserves single-writer identity state without letting one
uncooperative capability freeze the rest of the exhibition.

Startup, public state projection, and perception tuning each use one hard runtime
operation deadline rather than resetting a timer at every adapter boundary.
Timed-out tuning releases the public consistency lease, but its durable
serialization fence remains attached to the real save: a later curator write
cannot overtake a non-cooperative store, and a late save cannot mutate live tuning
state. State-change revisions are deferred and coalesced until the outermost
mutation lease releases, so an SSE subscriber can never be prompted to read a
known partial projection.

Durable cycle admission inherits the memory and transaction byte budgets.
Archive/quarantine residue is pruned only within its dedicated retention class;
active identity state is never sacrificed to make room. If a new journal cannot
fit, that Individual faults before publication. If pre-existing active journals
exceed the installation aggregate, startup/recovery fails closed for operator
review instead of guessing which transaction to discard.

Inter-site work has a separate containment boundary from identity-cycle work.
`InterSiteDeadlineRunner` bounds each transport delivery and inbound application,
passes an `AbortSignal` to cooperative adapters, and releases the serialized bridge
state boundary even when an adapter never settles. Accepted protocol and persisted
state values are detached and frozen before the bridge retains or shares them, so
external mutation cannot alter sequence, ownership, or retry decisions.

The runtime is not an HTTP server. Its `publicProjection` module owns the exact,
provider-independent DTO allowlist and current-cycle evidence wording. The narrow
`server/` adapter owns request parsing, authorization, SVG artifact materialization,
and SSE transport.
