# Security

Security protects identity state, provider accounts, management paths, and the
integrity of software installed at each location.

This branch will contain:

- secret injection and rotation interfaces;
- identity, service, device, and operator trust boundaries;
- least-privilege filesystem, process, network, and provider access;
- dependency, container, and release-artifact verification;
- authenticated management actions and audit records;
- secure backup, restore, update, rollback, and device decommissioning.

No secret, live credential, private key, device password, or production identity
archive may be committed to this repository.
