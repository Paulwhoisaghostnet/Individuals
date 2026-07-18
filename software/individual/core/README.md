# Individual core domain package

This directory is the canonical skeleton for an **Individual**. It contains the
identity definition, evolving state, engine lifecycle, system boundaries,
persistence contracts, and a runnable placeholder implementation from which
future Individuals can be composed.

The package is deliberately independent of React, databases, model providers,
image-generation services, and deployment infrastructure. Those technologies are
adapters around an Individual; they are not its identity.

## Anatomy

```text
core/
├── __tests__/
│   └── IndividualEngine.test.ts      # Domain lifecycle and invariant tests
├── engine/
│   └── IndividualEngine.ts           # One complete identity-feedback cycle
├── persistence/
│   ├── contracts.ts                  # Durable state and memory boundaries
│   └── inMemory.ts                   # Prototype/test implementations
├── systems/
│   └── contracts.ts                  # Cognition, vision, drawing, and adaptation ports
├── template/
│   ├── createTemplateIndividual.ts   # Ready-to-run assembly function
│   ├── manifest.ts                   # Identity template for future Individuals
│   └── systems.ts                    # Deterministic placeholder behaviors
├── createInitialState.ts             # Identity state at first awakening
├── manifest.ts                       # Manifest definition and validation
├── model.ts                          # Shared domain language and artifacts
└── index.ts                          # Public package API
```

## Immutable identity and evolving state

An Individual is represented by two related structures:

- `IndividualManifest` contains authored identity: name, origin, private
  narrative, traits, ideal self, mandatory ideal physical form, initial embodied
  self-perception, perception limits, drawing limits, and cadence.
  It is configuration and should be version-controlled.
- `IndividualState` contains lived identity: cycle number, current self-concept,
  evolving physical self-concept, latest self-portrait, latest social portrait,
  and last reflection. It changes
  through the engine and should eventually be stored durably.

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

The engine returns a `CycleRecord`. The society-level coordinator will route each
returned peer portrait to its subject before the participants begin another cycle.
That coordinator belongs outside this directory because membership and scheduling
are properties of the installation, not of a single Individual.

## System contracts

The interfaces in `systems/contracts.ts` are replaceable capabilities:

| Contract | Purpose | Likely future adapter |
| --- | --- | --- |
| `CognitionSystem` | Forms intentions and reflects on feedback. | Persistent LLM agent and prompt policy |
| `PerceptionSystem` | Transforms a peer canvas into a situated observation. | Shader, computer vision, image pipeline, or camera feed |
| `DrawingSystem` | Draws self and peer portraits within visual constraints. | Procedural renderer or image model |
| `FeedbackCompositor` | Produces the social portrait from peer interpretations. | Canvas, WebGL, or server image compositor |
| `AdaptationSystem` | Converts reflection into an updated self-concept. | Rules, learned policy, or constrained model call |
| `IndividualRepository` | Persists the latest complete identity snapshot. | Filesystem, PostgreSQL, or object storage |
| `MemoryStore` | Recalls and records identity-forming experiences. | Database plus semantic retrieval |

The template implementations are intentionally simple and deterministic. They
prove the lifecycle and data flow; they are not proposed as the final artwork.

## Creating a future Individual

Start with a distinct manifest and assemble the default systems:

```ts
import {
  createTemplateIndividual,
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
    idealPhysicalForm: {
      description: "A tall woman with an oval face, long neck, and open four-fingered hands.",
      bodyPlan: "Bilateral humanoid with one head, torso, two arms, and two legs.",
      stature: "Tall, narrow, and upright.",
      surface: "Copper-brown matte skin crossed by fine pale joint lines.",
      face: ["shaved oval head", "wide-set eyes", "level mouth"],
      anatomy: ["long neck", "level shoulders", "four-fingered hands"],
      movement: "Slow movements that return to an open frontal stance.",
      nonNegotiableFeatures: ["oval face", "long neck", "four-fingered hands"],
    },
    initialPhysicalSelf: {
      description: "I already have this woman's body, but my posture remains guarded.",
      perceivedSimilarity: 0.62,
      perceivedDifferences: ["raised left shoulder", "partially closed hands"],
    },
  },
  perception: {
    description: "Edges remain sharp while interiors lose information.",
    constraints: ["Reduce interior detail.", "Overstate every visible boundary."],
  },
});

export const iris = createTemplateIndividual({ manifest: irisManifest });
```

As Iris becomes distinct, replace the template systems with implementations of
the same contracts. Identity-specific prompts, visual parameters, shaders, masks,
and drawing rules should live beside Iris's manifest or in assets referenced by
it. Provider credentials and deployment state must remain outside identity source
files.

## Cycle inputs and outputs

The engine accepts two deliberately separate collections:

- `peerSelfPortraits` are current public canvases that this Individual will
  observe and reinterpret.
- `receivedPeerPortraits` are drawings made *by peers about this Individual* and
  will be composited into its social portrait.
- `perceptionTuning` is an optional map of runtime values for controls declared by
  this Individual's perception profile. Missing controls use manifest defaults;
  unknown and out-of-range values are rejected.

The engine rejects a self-portrait placed in social feedback, a peer portrait of
the wrong subject, or the Individual's own canvas placed among its peers. These
invariants prevent routing mistakes from silently changing an identity.

## Persistence expectations

The in-memory repository and memory store are for prototyping and tests only. A
production adapter should:

- save snapshots atomically so interrupted cycles cannot leave partial identity;
- retain cycle records and portrait provenance for exhibition history;
- isolate data by Individual and installation location;
- make migrations explicit when the manifest schema changes;
- support backup and recovery without depending on the exhibition client;
- never place model credentials or private operational data in a manifest.

## Extension rules

When adding a capability to an Individual:

1. Express the concept in the domain model or a narrow system contract.
2. Keep provider-specific code behind that contract.
3. Preserve portrait provenance and the distinction between artist and subject.
4. Make perception and drawing limitations explicit in the manifest.
5. Add a lifecycle test before connecting the capability to the exhibition.
6. Avoid allowing UI state to become identity state.

These rules keep future Individuals genuinely distinct while allowing them to
participate in the same society and identity-feedback protocol.
