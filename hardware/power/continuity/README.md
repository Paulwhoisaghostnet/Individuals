# Power continuity

Short-outage operation, graceful shutdown, state preservation, and controlled
restart after power loss.

Document and validate:

- equipment requiring UPS support and required runtime;
- UPS topology, output capacity, battery health reporting, and replacement cycle;
- shutdown trigger, ordering, timeout, and forced-off behavior;
- automatic restart order and dependencies after utility power returns;
- state-integrity test after power interruption during every cycle phase;
- bypass or manual recovery procedure after continuity-system failure.

Displays and accelerators need not remain active if safely preserving identity
requires prioritizing compute and storage.

