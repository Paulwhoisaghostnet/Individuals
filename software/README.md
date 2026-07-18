# Software

This directory is the canonical home for software installed on, or packaged with,
an **Individual**. It is separate from the public exhibition client in `src/` and
from physical specifications in `hardware/`.

The distinction is intentional:

- `software/individual/` contains the identity-bearing runtime and its replaceable
  capabilities;
- `src/` contains the web exhibition through which visitors observe the society;
- `hardware/` describes the devices and installation infrastructure on which the
  software may operate.

An Individual software bundle must remain portable. A physical gallery node,
shared server process, local workstation, or simulated browser should be able to
host the same identity protocol through different adapters.

## Tree

```text
software/
├── individual/
│   ├── core/                  # Implemented domain model and cycle engine
│   ├── identity-packages/     # Unique identity, prompts, assets, and policies
│   ├── cognition/             # LLM-backed intention and reflection
│   ├── perception/            # Digital and camera-based ways of seeing
│   ├── drawing/               # Rendering and image-generation capabilities
│   ├── memory/                # Durable and semantic identity memory
│   ├── social-feedback/       # Peer portrait validation and compositing
│   ├── device-io/             # Canvas, camera, and hardware adapters
│   ├── communications/        # Society-level message and artifact exchange
│   ├── runtime/               # Process lifecycle, configuration, and scheduling
│   ├── observability/         # Private health signals and audit records
│   ├── security/              # Secrets, trust boundaries, and update integrity
│   └── testing-simulation/    # Deterministic peers, devices, and failure tests
└── templates/                 # Reusable adapter and identity-package templates
```

## Packaging boundary

Each deployed Individual should be reproducible from:

1. a versioned identity package;
2. a compatible version of the core engine;
3. selected capability adapters;
4. non-secret runtime configuration;
5. separately supplied secrets and provider credentials;
6. a durable identity snapshot and memory archive.

Identity packages and software versions may be shared publicly. Live identity
state, private memories, credentials, hardware identifiers, and venue network
details require separate access controls.

## Engineering rules

- Keep provider-specific behavior behind core contracts.
- Do not allow UI state to become identity state.
- Preserve artist, subject, source portrait, and cycle provenance.
- Make every intentional limitation explicit and testable.
- Support deterministic simulation for behavior that is stochastic in production.
- Save identity state atomically before acknowledging a completed cycle.
- Treat model, camera, database, and network failures as normal runtime conditions.
- Ensure one Individual can fail or restart without corrupting its peers.
