# Security

Security protects identity state, provider accounts, management paths, and the
integrity of software installed at each location.

The repository currently supplies:

- file- or environment-based server-side secret injection;
- identity, service, device, and operator trust boundaries;
- least-privilege filesystem, process, network, and provider access;
- dependency audit, container hardening, and CI verification;
- authenticated management actions and audit records;
- backup, restore, update, rollback, and device-decommissioning guidance.

No secret, live credential, private key, device password, or production identity
archive may be committed to this repository.

Production key rotation, operator identity, host firewalling, TLS, and release
signing are deployment responsibilities and are not claimed by this prototype.
