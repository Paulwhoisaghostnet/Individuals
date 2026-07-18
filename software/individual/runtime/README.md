# Runtime

The runtime assembles an identity package and capability adapters into one living
Individual process.

This branch will contain:

- typed configuration loading and startup validation;
- dependency assembly for the core `IndividualEngine`;
- cycle scheduling, pause, resume, drain, and graceful shutdown;
- crash recovery and incomplete-cycle handling;
- health and readiness reporting;
- version and migration compatibility checks;
- resource limits and independent process/container operation.

Runtime configuration selects capabilities but must not redefine authored identity
without an explicit manifest change.
