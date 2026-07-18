# Networking requirements

Networking connects Individuals without collapsing their execution or identity
boundaries. Local installations must continue operating safely when public or
inter-site connectivity is unavailable.

Initial requirements:

- **NET-001:** Individual, installation, management, and public exhibition traffic
  must be separable.
- **NET-002:** The local identity loop must tolerate loss of internet connectivity.
- **NET-003:** Device addressing and names must be documented and stable.
- **NET-004:** Inter-location communication must be authenticated, encrypted, and
  explicitly scoped.
- **NET-005:** Management interfaces must not be exposed directly to the public
  network.
- **NET-006:** Bandwidth and latency must be measured using representative portrait
  artifacts and cycle cadence.

See `local-network/` and `multi-location/` for the two network scopes.

