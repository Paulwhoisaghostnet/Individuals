# Communications

Communications moves portraits and cycle events between Individuals while
preserving identity and installation boundaries.

This branch will contain:

- versioned message and artifact-envelope schemas;
- peer discovery and society membership inputs;
- portrait publication, receipt acknowledgement, and deduplication;
- local transport and optional inter-location transport adapters;
- authentication, ordering, retry, timeout, and store-and-forward behavior;
- compatibility tests between software versions and locations.

An Individual must continue in a meaningful degraded mode when peers or remote
locations are unavailable.
