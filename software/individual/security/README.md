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

The inert public-SVG contract is centralized in `publicSvg.ts`. Both HTTP portrait
artifacts and offline curatorial exports use this exact structural allowlist; a
consumer must not introduce a second, weaker SVG sanitizer or embed persisted
artwork without crossing this boundary.

No secret, live credential, private key, device password, or production identity
archive may be committed to this repository.

Production key rotation, operator identity, host firewalling, TLS, and release
signing are deployment responsibilities and are not claimed by this prototype.
