# Communications

Communications moves portraits and cycle events between Individuals while
preserving identity and installation boundaries.

The prototype defines:

- versioned message and artifact-envelope schemas;
- peer discovery and society membership inputs;
- portrait publication, receipt acknowledgement, and deduplication;
- an explicit transport port for a future authenticated inter-location adapter;
- sequence-aware delivery, bounded retry, acknowledgement, dead-letter, and
  store-and-forward behavior;
- bridge-owned deadlines for every outbound delivery and inbound application,
  with cooperative cancellation signals and containment of adapters that ignore
  cancellation;
- exclusive Individual ownership per registered site and role-aware claim
  authorization at both send and receive boundaries;
- detached, recursively immutable envelope/state graphs after validation, so a
  caller, transport, applier, or custom store cannot rewrite accepted messages
  through a retained object reference;
- compatibility tests between software versions and locations.

An Individual must continue in a meaningful degraded mode when peers or remote
locations are unavailable.

No production network transport is selected yet. The protocol cannot make an
unauthenticated transport trustworthy; venue identity, encryption, key rotation,
and remote authorization belong to the deployment adapter and commissioning plan.
Delivery is at least once: an inbound applier must be idempotent by message ID
because a process can fail after applying a message but before persisting its inbox
marker. The same rule applies when an applier ignores its abort signal: the bridge
returns at the configured application deadline without acknowledging or advancing
the inbound sequence, but a late adapter-side effect may still finish and therefore
must be safe to repeat.

Outbound transport timeouts are persisted as the sanitized `transport_timeout`
retry category. A timed-out adapter cannot retain the bridge operation queue; the
pending envelope remains durable and later messages retain monotonically allocated
sequences. The bridge defaults to a 15-second delivery deadline and a 10-second
application deadline, each configurable up to five minutes. A production transport
should still apply stricter phase-specific connection/TLS/body deadlines and honor
the supplied `AbortSignal` for prompt resource cleanup.

Identity signals and self/social portraits belong to the source site; a peer
portrait is routed from a source-owned artist directly to a destination-owned
subject.
