# Power requirements

Power design must account for continuous exhibition operation, safe distribution,
recoverable shutdown, startup sequencing, and venue-specific electrical rules.

Initial requirements:

- **PWR-001:** Connected and peak loads must be calculated before installation.
- **PWR-002:** Every circuit, supply, converter, and cable must be rated for its
  expected load and installation environment.
- **PWR-003:** One device failure must not create an unsafe condition or damage peer
  equipment.
- **PWR-004:** Compute and storage must receive enough continuity for graceful state
  preservation during short outages.
- **PWR-005:** Recovery after a longer outage must follow a documented startup order.
- **PWR-006:** Isolation, grounding, protection, and inspection must follow venue and
  local electrical requirements.

See `distribution/` and `continuity/`. Final electrical design and installation
must be reviewed by qualified venue personnel or an appropriately licensed
professional.

