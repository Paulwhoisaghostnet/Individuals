# Project documentation

- [`architecture/system.md`](architecture/system.md) — domain boundaries, causal
  loop, invariants, runtime split, and multi-location direction.
- [`architecture/issue-routing.md`](architecture/issue-routing.md) — where defects
  belong and what evidence to collect.
- [`security/threat-boundaries.md`](security/threat-boundaries.md) — public/private
  data, curator authority, storage, providers, browser, and camera boundaries.
- [`operations/deployment.md`](operations/deployment.md) — isolated Compose setup,
  secrets, health, backup, upgrade, and rollback.
- [`testing/acceptance.md`](testing/acceptance.md) — automated and release-gated
  acceptance criteria for the prototype.
- [`testing/browser-release.md`](testing/browser-release.md) — required real-browser
  checks that unit tests and DOM serialization cannot prove.
- [`../SECURITY.md`](../SECURITY.md) — supported code, private vulnerability
  reporting, and deployment responsibility.

Documentation distinguishes implemented prototype behavior from commissioning
requirements and future adapter contracts. Update the relevant page in the same
change as any deployment or wire-contract modification.
