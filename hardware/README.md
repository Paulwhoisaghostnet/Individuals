# Hardware

This directory is the canonical home for the physical requirements of
**Individuals**. It separates installation hardware from application source and
provides a consistent place to record requirements, candidate components,
validation evidence, and site-specific decisions.

The project is currently a digital prototype. Everything here is therefore a
requirements framework, not an approved bill of materials. Product selections
should be made only after the artistic behavior, gallery conditions, installation
scale, and maintenance model are known.

## Requirement tree

```text
hardware/
├── compute/
│   ├── individual-node/       # Compute local to one Individual
│   └── installation-host/     # Shared on-site orchestration and storage
├── visual-output/
│   ├── canvas-display/        # The public canvas of an Individual
│   └── calibration/           # Color, geometry, and brightness consistency
├── vision/
│   ├── cameras/               # Eyes trained on peer canvases
│   ├── optics/                # Lens, field-of-view, and working-distance choices
│   └── calibration/           # Geometric and color calibration
├── networking/
│   ├── local-network/         # Reliable communication within one installation
│   └── multi-location/        # Controlled links between global installations
├── power/
│   ├── distribution/          # Circuits, conversion, protection, and load planning
│   └── continuity/            # Graceful shutdown and short outage handling
├── physical-integration/
│   ├── enclosures/            # Protective housings and service access
│   ├── mounting-cabling/      # Safe placement and cable management
│   └── thermal/               # Passive and active heat management
├── site-environment/
│   ├── lighting/              # Gallery light and controlled illumination
│   └── safety-accessibility/  # Visitor, installer, and venue constraints
├── operations/
│   ├── commissioning/         # Pre-opening setup and acceptance tests
│   ├── monitoring/            # Hardware health and failure reporting
│   └── spares/                # Replaceable parts and recovery inventory
└── templates/                 # Reusable requirement and evaluation documents
```

## System levels

Hardware decisions should identify the level at which they apply:

| Level | Meaning | Examples |
| --- | --- | --- |
| Individual | Repeated once for every Individual. | Canvas, camera set, local compute, enclosure |
| Installation | Shared by all Individuals at one venue. | Network, installation host, UPS, monitoring |
| Global | Shared protocol or service across locations. | Secure inter-site connectivity, time reference |
| Service stock | Not normally active but required for recovery. | Spare camera, display, power supply, cables |

## Documentation standard

Every proposed component should be traceable to a requirement. Use the documents
in `templates/` to record:

1. the artistic or operational need;
2. measurable acceptance criteria;
3. environmental and safety constraints;
4. candidate components and tradeoffs;
5. test results and evidence;
6. approval status and responsible owner;
7. replacement and end-of-life considerations.

Do not commit credentials, private venue information, device passwords, serial
numbers, or network secrets. Site-specific sensitive records belong in the
installation's secure operations system.

## Guiding constraints

- Cameras observe peer canvases, not visitors.
- Each Individual must remain visually and computationally distinct.
- Shared infrastructure must not create a single point of identity loss.
- Hardware should recover gracefully after power or network interruption.
- Components should be serviceable without dismantling the full installation.
- Cabling, heat, noise, and status indicators should not compromise the artwork.
- Global locations may use different hardware while preserving compatible inputs,
  outputs, timing, and identity state.

