# Security policy

## Supported code

Security fixes target the current `main` branch and the deployment artifacts built
from it. Prototype feature branches are not supported production releases.

## Reporting a vulnerability

Do not place credentials, identity archives, private prompts, captured frames, or
exploit details in a public issue. Use GitHub's private vulnerability-reporting
flow for this repository when available, or contact the maintainers through an
already established private channel.

Include the affected commit, boundary, reproduction conditions, likely impact, and
whether the issue can expose curator authority, provider credentials, private
identity state, camera data, or another project on the shared host. Use synthetic
data and revoke any credential that may have entered a report.

## Deployment boundary

The repository does not provide host TLS, firewall rules, operator identity,
release signing, or a commissioned inter-site trust system. Those controls remain
site responsibilities documented in [`docs/security/threat-boundaries.md`](docs/security/threat-boundaries.md)
and [`docs/operations/deployment.md`](docs/operations/deployment.md).
