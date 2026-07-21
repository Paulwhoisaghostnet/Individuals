# Individual core domain package

This directory is the canonical domain model for an **Individual**. It contains the
identity definition, evolving state, engine lifecycle, system boundaries, and
persistence contracts used by both the procedural prototype and future adapters.

The package is deliberately independent of React, databases, model providers,
image-generation services, and deployment infrastructure. Those technologies are
adapters around an Individual; they are not its identity.

## Anatomy

```text
core/
├── __tests__/
│   └── IndividualEngine.test.ts      # Domain lifecycle and invariant tests
├── engine/
│   ├── IndividualEngine.ts           # Identity-feedback orchestration only
│   └── portraitRouting.ts            # Membership, cohort, and lineage boundary
├── persistence/
│   ├── contracts.ts                  # Durable state and memory boundaries
│   └── inMemory.ts                   # Prototype/test implementations
├── systems/
│   └── contracts.ts                  # Cognition, vision, drawing, and adaptation ports
├── template/
│   └── manifest.ts                   # Identity template for future Individuals
├── validation/
│   ├── portraitBoundary.ts           # Bounded portrait envelopes
│   ├── primitives.ts                 # Neutral closed-schema validation tools
│   └── visualEvidence.ts             # Descriptor and evidence contracts
├── createInitialState.ts             # Identity state at first awakening
├── deterministic.ts                  # Stable non-security noise primitives
├── figureGeometry.ts                 # Neutral embodied geometry and signed changes
├── manifest.ts                       # Manifest definition and validation
├── manifestCompatibility.ts          # Persisted/installed identity guard
├── model.ts                          # Shared domain language and artifacts
├── opticalCalibration.ts             # Canonical, verifiable camera calibration
├── socialEvidence.ts                 # Canonical social consensus and verifier
├── systemUtilities.ts                # Clock and deterministic ID utilities
└── index.ts                          # Public package API
```

## Immutable identity and evolving state

An Individual is represented by two related structures:

- `IndividualManifest` contains authored identity: name, origin, private
  narrative, traits, ideal self, mandatory ideal physical form, initial embodied
  self-perception, perception limits, artistic ability scope, and cadence.
  It is configuration and should be version-controlled.
- `IndividualState` contains lived identity: cycle number, current self-concept,
  evolving physical self-concept, latest self-portrait, current-cycle social
  portrait (cleared when no feedback returns), and last reflection. It changes
  through the engine and is stored durably by the runtime adapter.

The separation is important. A deployment can recover changing state without
rewriting the authored source of the Individual, while deliberate curatorial
changes to its manifest remain reviewable.

## Engine lifecycle

`IndividualEngine.runCycle()` performs one orchestration pass:

1. Load the Individual's last durable snapshot, or create its initial state.
2. Recall relevant memories.
3. Ask cognition to form an intention for the next self-portrait.
4. Draw the self-portrait.
5. Observe each peer self-portrait through the Individual's perception system.
6. Draw an interpretation of every observed peer.
7. Composite peer drawings received about this Individual into a social portrait.
8. Reflect on the difference between intention, self-portrait, and social portrait.
9. Adapt the self-concept, record a memory, and persist the next snapshot.

Every awaited capability receives the cycle's optional abort signal. The engine
checks that signal after each capability and immediately before the atomic commit,
so a result that arrives after a runtime deadline cannot become identity state.

The engine returns a `CycleRecord`. The society-level coordinator will route each
returned peer portrait to its subject before the participants begin another cycle.
That coordinator belongs outside this directory because membership and scheduling
are properties of the installation, not of a single Individual.

## System contracts

The interfaces in `systems/contracts.ts` are replaceable capabilities:

| Contract | Purpose | Current prototype adapter |
| --- | --- | --- |
| `CognitionSystem` | Forms intentions and reflects on evidence. | Procedural cognition or bounded provider adapter |
| `PerceptionSystem` | Transforms a peer canvas into a situated observation. | Stable identity-specific perception model |
| `DrawingSystem` | Draws self and peer portraits within visual constraints. | Safe procedural embodied renderer |
| `FeedbackCompositor` | Produces the social portrait from peer interpretations. | Layered procedural compositor |
| `AdaptationSystem` | Converts reflection into an updated self-concept. | Evidence-driven bounded adaptation |
| `IndividualRepository` | Persists the latest complete identity snapshot. | Journaled filesystem repository |
| `MemoryStore` | Recalls and records identity-forming experiences. | Bounded journaled filesystem memory |

Cross-domain assembly intentionally lives outside core. The production runtime
and `testing-simulation/support/` compose concrete cognition, perception,
drawing, feedback, and adaptation adapters around these contracts.

## Creating a future Individual

Start with a distinct manifest. A runtime or simulation assembly layer supplies
the concrete systems and the explicit society membership registry:

```ts
import {
  createTemplateManifest,
  defineIndividualManifest,
} from "./software/individual/core";

const foundation = createTemplateManifest({
  id: "iris",
  displayName: "Iris",
});

const irisManifest = defineIndividualManifest({
  ...foundation,
  statement: "I preserve edges because I am afraid of becoming atmosphere.",
  identity: {
    ...foundation.identity,
    privateNarrative: "I recognize myself by the boundaries I can keep.",
    idealSelf: {
      narrative: "A form that can remain distinct without becoming closed.",
      values: ["continuity", "porosity", "precision"],
      visualAnchors: ["hard edges", "a permeable center", "repeated contours"],
    },
    // Override the complete authored visualSpecification and initial bodyBelief
    // together; prose alone never changes executable anatomy.
    idealPhysicalForm: foundation.identity.idealPhysicalForm,
    initialPhysicalSelf: foundation.identity.initialPhysicalSelf,
  },
  perception: {
    description: "Edges remain sharp while interiors lose information.",
    constraints: ["Reduce interior detail.", "Overstate every visible boundary."],
  },
});
```

Identity-specific prompts, visual parameters, masks, and drawing rules live beside
each authored manifest or in versioned assets it references. Provider credentials
and deployment state remain outside identity source files.

## Cycle inputs and outputs

The engine accepts two deliberately separate collections:

- `peerSelfPortraits` are current public canvases that this Individual will
  observe and reinterpret.
- `receivedPeerPortraits` are drawings made *by peers about this Individual* and
  will be composited into its social portrait.
- `perceptionTuning` is an optional map of runtime values for controls declared by
  this Individual's perception profile. Missing controls use manifest defaults;
  unknown and out-of-range values are rejected.

The engine is also constructed with `allowedPeerIds`, an explicit society
membership registry supplied by the installation runtime. Authored trust and
learned relationship state influence interpretation, but never grant routing
authority.

The engine rejects a self-portrait placed in social feedback, a peer portrait of
the wrong subject, or the Individual's own canvas placed among its peers. These
invariants prevent routing mistakes from silently changing an identity.

## Persistence expectations

The in-memory repository and memory store are test fixtures. The journaled runtime
adapter:

- saves snapshots atomically so interrupted cycles cannot leave half-committed
  snapshot and memory state;
- retains bounded memories, snapshot backups, and current portrait provenance;
- isolates data by Individual and deployment data directory;
- rejects incompatible schemas and quarantines corrupt records;
- supports explicit backup recovery without depending on the exhibition client;
- never places model credentials or private operational data in a manifest.

The prototype does not yet provide a complete queryable archive of every
`CycleRecord` or portrait image. That history requires a separate bounded artifact
archive rather than indefinite growth in the latest identity snapshot.

## Extension rules

When adding a capability to an Individual:

1. Express the concept in the domain model or a narrow system contract.
2. Keep provider-specific code behind that contract.
3. Preserve portrait provenance and the distinction between artist and subject.
4. Make perception and the complete artistic ability scope explicit in the manifest.
5. Add a lifecycle test before connecting the capability to the exhibition.
6. Avoid allowing UI state to become identity state.

These rules keep future Individuals genuinely distinct while allowing them to
participate in the same society and identity-feedback protocol.
