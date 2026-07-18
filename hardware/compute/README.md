# Compute requirements

Compute is divided between hardware belonging to one Individual and infrastructure
shared by an installation. This boundary preserves identity isolation while
allowing common scheduling, storage, networking, and monitoring.

Initial requirements:

- **COM-001:** Every Individual must have an addressable execution boundary.
- **COM-002:** Loss of one Individual's compute must not stop healthy peers.
- **COM-003:** Identity state must survive an orderly restart and recover from an
  interrupted cycle without partial state.
- **COM-004:** Rendering and perception workloads must meet the eventual exhibition
  cadence at the selected canvas resolution.
- **COM-005:** Compute must operate within the enclosure's thermal and acoustic
  limits.
- **COM-006:** Accelerators must be justified by measured local workloads; remote
  inference remains a valid prototype option.

See `individual-node/` and `installation-host/` for the two compute scopes.

