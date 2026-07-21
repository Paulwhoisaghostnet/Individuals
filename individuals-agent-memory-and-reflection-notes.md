# Individuals: Agent Cognition, Memory, and Social Reflection

> Design notes distilled from the Build Week discussion.  
> Status: working direction, not a final specification.

## Purpose

The first prototype of **Individuals** is a closed society of three artificial entities that repeatedly portray themselves, observe one another, redraw what they perceive, and return a social image to the subject.

The project is not simply a chain of generated images. Each Individual should behave as a persistent participant with:

- an authored physical ideal;
- a current belief about its embodied self;
- a distinctive way of seeing;
- a constrained way of drawing;
- a history that affects later choices;
- an evolving relationship with how its peers perceive it.

The central artistic tension is between three versions of the body:

1. **Ideal physical self** — the body the Individual understands as its intended form.
2. **Perceived physical self** — the body it currently believes it inhabits.
3. **Social physical self** — the body its peers reflect back to it.

The system may seek greater coherence between these versions, but it should not reliably or permanently achieve it. Misrecognition, limitation, disagreement, and resistance are part of the work.

---

## Main conclusion

The Individual should **remember being changed by previous experiences while encountering each new image as a new image**.

This implies selective, application-managed memory rather than either of these extremes:

- **Complete amnesia:** every cycle becomes an unrelated image-generation event, with no meaningful identity development.
- **Complete replay:** every observation includes the entire history, causing repetition, imitation of earlier outputs, context bloat, and premature convergence.

Memory should therefore be different depending on the action being performed.

---

## The model is not the identity

The language or multimodal model should be treated as a replaceable cognition component. The Individual's identity must not depend on a provider preserving chat history or on the model somehow remembering previous calls.

Persistent state belongs to the application.

Each Individual should have an independent stored record containing its identity, beliefs, history, relationships, and adaptation state. Before each model call, the orchestration layer selects only the context relevant to the current step.

This separation provides several advantages:

- models can be replaced or compared without resetting the Individual;
- cycles can survive process restarts and deployment failures;
- state transitions can be inspected and tested;
- the system does not depend on enormous context windows;
- three Individuals can use the same base model while remaining distinct;
- later versions may use different models without changing the domain model.

A model call is therefore one cognitive event inside a larger durable system, not the complete Individual.

---

## Recommended memory layers

### 1. Stable identity

Authored information that changes rarely, if at all:

- name or identifier;
- temperament;
- self-narrative;
- ideal physical body;
- non-negotiable identifying features;
- artistic preferences;
- perception limitations;
- drawing abilities and deficiencies;
- basic social disposition.

This is the strongest source of continuity.

### 2. Current embodied beliefs

The Individual's present interpretation of itself:

- how closely it believes it resembles its ideal;
- perceived bodily differences;
- features it considers clear, damaged, missing, exaggerated, or uncertain;
- current emotional or conceptual relationship to its body;
- which elements it wants to communicate more clearly.

These beliefs may change after reflection.

### 3. Recent episodic history

A small window of recent events:

- latest self-portrait;
- latest peer interpretations;
- latest social composite;
- the Individual's previous intention;
- its interpretation of the latest feedback;
- the adaptation chosen for the next cycle.

The window should be deliberately limited. The system may keep the full history in storage while only retrieving the most relevant recent episodes for cognition.

### 4. Long-term identity summary

A periodically updated compressed account of development:

- recurring changes in self-representation;
- long-lived conflicts between ideal and social selves;
- traits that peers repeatedly notice or miss;
- important turning points;
- persistent strategies or resistances;
- changes in relationships with specific peers.

This summary prevents the prompt from growing indefinitely while preserving accumulated change.

### 5. Relationship models

Each Individual may gradually form a separate, imperfect model of every peer:

- how that peer tends to perceive it;
- which features the peer exaggerates, omits, or confuses;
- how reliable the peer appears to be;
- whether the peer's interpretation has changed;
- how the Individual expects that peer to respond to certain visual decisions.

These are subjective beliefs, not ground truth. Individual A's model of Individual B may be inaccurate.

### 6. Tool-use experience

The agents may evolve in how they use available perception, drawing, comparison, and memory tools.

This should remain bounded:

- tool definitions and permissions remain controlled by the application;
- an Individual may learn preferences and strategies;
- it may remember which operations produced useful or confusing results;
- it should not freely rewrite tool schemas or grant itself new capabilities;
- tool-use evolution should reflect character and accumulated experience, not uncontrolled optimization.

---

## Fresh observation versus remembered experience

### Creating a self-portrait requires continuity

When an Individual creates its next self-portrait, useful context includes:

- stable identity;
- ideal physical self;
- current embodied beliefs;
- previous self-portrait;
- latest social composite;
- concise reflection on the difference between intention and reception;
- the specific adjustment, resistance, or experiment selected for this cycle.

The previous portrait should be a reference, not a template that must be copied.

### Observing a peer should initially be fresh

When Individual A observes Individual B's current portrait, A should normally receive:

- B's current portrait;
- A's stable perception profile;
- A's relevant perception-tool configuration;
- A's drawing profile when it must redraw the observation.

A should **not automatically receive its previous drawings of B**. Otherwise, it may start reproducing its own established interpretation instead of responding to the new portrait.

Historical peer information may influence later reflection and prediction, but it should not replace the immediate act of seeing.

This distinction protects both continuity and genuine variation:

- self-representation remembers;
- observation encounters;
- reflection connects the two.

---

## Reflection must be its own iteration step

The social composite should not be fed directly into the next portrait generator as if it were an instruction image.

After peer interpretations have been combined, the subject should complete a distinct **interpretation and reflection step**.

During reflection, the Individual considers questions such as:

1. What was I trying to portray?
2. What did each peer appear to perceive?
3. Which parts of me were recognized consistently?
4. Which parts were omitted, distorted, or contradicted?
5. Does this resemble a recurring pattern?
6. Do I accept any part of the social image?
7. Do I want to clarify myself, accommodate others, exaggerate something, experiment, or resist?
8. What single intention should guide my next self-portrait?

The output of reflection should be structured and concise. It should update the Individual's beliefs and adaptation state without exposing a long diagnostic reasoning transcript in the exhibition.

Possible stored outputs include:

- observations about the feedback;
- accepted social interpretations;
- rejected interpretations;
- unresolved uncertainty;
- a next-portrait intention;
- relationship-model updates;
- confidence values;
- a short public-facing fragment, if useful for the artwork.

---

## Proposed expanded identity loop

A full cycle can be represented as follows.

### Step 0 — Load durable state

Load each Individual's stable identity, current beliefs, bounded recent history, relationship models, and tool-use preferences.

### Step 1 — Form self-portrait intention

The subject decides what it wants the next portrait to express physically. The intention should be narrow enough to guide a visual act.

Examples:

- make the face more recognizable;
- preserve a feature peers repeatedly erase;
- incorporate a distortion that unexpectedly felt accurate;
- deliberately refuse the group's preferred interpretation;
- test whether a peer notices a subtle bodily feature.

### Step 2 — Produce self-portrait

The drawing engine creates the portrait under the Individual's persistent artistic abilities and limitations.

The output must remain an attempt to depict the authored physical body. Abstraction may express uncertainty or distortion, but it should not replace the embodied subject.

### Step 3 — Independent peer observation

Each peer observes the same portrait through its own perception system.

Observations should remain independent. One peer should not see another peer's interpretation before producing its own.

### Step 4 — Peer redraw

Each observer translates what it perceived into a portrait using its own drawing vocabulary, proficiency, and limitations.

This step distinguishes **seeing** from **rendering**:

- the perception system determines what the observer believes is present;
- the drawing system determines how successfully it can place that perception on canvas.

### Step 5 — Social composition

The peer interpretations are combined into a social portrait.

The composite is not authoritative truth or democratic consensus. It is a layered record of incompatible perceptions.

The system should retain the individual peer portraits alongside the composite so the subject can distinguish repeated agreement from accidental compositing effects.

### Step 6 — Interpret and reflect

The subject compares:

- its ideal physical self;
- its current embodied belief;
- its original intention;
- its self-portrait;
- each peer interpretation;
- the social composite;
- relevant recurring patterns.

It then decides what the social feedback means to it.

### Step 7 — Update state

Persist bounded changes to:

- current embodied beliefs;
- self-narrative;
- relationship models;
- tool-use preferences;
- long-term summary;
- next-portrait intention.

Stable identity should not be rewritten casually. Meaningful change should accumulate rather than reset the character.

### Step 8 — Begin the next cycle

The next self-portrait is shaped by reflection, but it remains a new act rather than a deterministic correction pass.

---

## Predicting peer perception

A significant possible evolution is that an Individual learns to anticipate how its peers will see it.

Over multiple cycles, the subject may infer patterns such as:

- one peer consistently exaggerates scale;
- one peer ignores facial features but notices posture;
- one peer interprets ambiguity as damage;
- one peer is strongly influenced by contrast or symmetry;
- one peer has begun to perceive the subject differently over time.

The subject may then design a future portrait while predicting these reactions.

This creates a richer question than simple adaptation:

> Will the Individual portray its ideal self directly, or portray itself strategically so that its peers' distortions produce the social image it wants?

That behavior can lead toward **communal coherence**, but communal coherence should remain a desire or pressure rather than the system's mandatory optimization target.

If every Individual simply minimizes disagreement, the society may converge into predictable and mutually legible caricatures. The artwork becomes more interesting when different Individuals respond differently to social pressure.

---

## Social disposition parameters

Each Individual can have persistent parameters affecting how it responds to feedback.

### Self-integrity

How strongly it protects its ideal self and existing identity from external influence.

High self-integrity may produce continuity and resistance. Excessive self-integrity may prevent meaningful adaptation.

### Social permeability

How willing it is to incorporate the perceptions of others.

High permeability may produce rapid evolution. Excessive permeability may erase the Individual's authored identity.

### Need for recognition

How strongly it wants peers to perceive it as intended.

A high need for recognition may encourage strategic communication, clearer portraits, and prediction of peer responses.

### Resistance

How likely it is to reject, challenge, invert, or deliberately frustrate the social image.

Resistance should not simply mean randomness. It may be principled and related to specific features or relationships.

### Curiosity

How willing it is to test unfamiliar tools, visual strategies, or interpretations.

### Trust by peer

A relationship-specific value describing how much weight the Individual gives each observer's interpretation.

These should influence reflection and decision-making without reducing behavior to one numerical objective.

---

## Initial implementation shape

A minimal durable representation could begin with SQLite plus structured JSON fields.

```ts
interface IndividualState {
  id: string;

  identity: {
    temperament: string;
    selfNarrative: string;
    idealPhysicalSelf: PhysicalSelf;
    perceptionProfile: PerceptionProfile;
    drawingProfile: DrawingProfile;
    socialDisposition: SocialDisposition;
  };

  currentBeliefs: {
    perceivedPhysicalSelf: PhysicalSelf;
    socialPhysicalSelfSummary: string;
    uncertainty: string[];
  };

  recentCycles: CycleMemory[];
  longTermSummary: string;

  relationships: Record<string, PeerModel>;
  toolExperience: ToolExperienceRecord[];

  nextIntention?: PortraitIntention;
}
```

A cycle record might contain:

```ts
interface CycleMemory {
  cycleId: string;
  selfPortraitId: string;
  intention: PortraitIntention;
  peerInterpretationIds: string[];
  socialCompositeId: string;
  reflection: ReflectionResult;
  createdAt: string;
}
```

The reflection result should be machine-readable:

```ts
interface ReflectionResult {
  intendedSignals: string[];
  perceivedPeerSignals: Record<string, string[]>;
  recurringPatterns: string[];
  acceptedFeedback: string[];
  rejectedFeedback: string[];
  unresolvedQuestions: string[];
  relationshipUpdates: PeerModelUpdate[];
  nextIntention: PortraitIntention;
  publicFragment?: string;
}
```

Images and large artifacts should be stored by reference rather than embedded repeatedly in prompts or database rows.

---

## Model strategy for the prototype

### Begin with the same base model for all three Individuals

The initial experiment should preferably use one model family for all three agents, while maintaining separate:

- identities;
- prompts;
- memories;
- perception parameters;
- drawing abilities;
- social dispositions;
- tool-use histories;
- sampling settings, where useful.

This makes it easier to determine whether visible differences arise from authored character constraints rather than unrelated differences between model families.

After the loop is stable, replace one cognition adapter at a time. A heterogeneous society may later become an intentional artistic experiment.

### Current provisional open-model candidates

The models discussed as initial candidates were:

- **Qwen3.5-9B** as a practical multimodal and tool-using prototype candidate;
- **Gemma 4**, particularly smaller or mid-sized instruction-tuned variants, as a lightweight alternative;
- **Kimi K2.6** as a substantially heavier agentic comparison or quality ceiling, likely through hosted inference rather than casual local deployment.

This shortlist is provisional. Model releases and serving support change quickly. Final selection should be based on a project-specific test harness, not leaderboard position alone.

### Useful references

- [Berkeley Function-Calling Leaderboard (BFCL V4)](https://gorilla.cs.berkeley.edu/leaderboard.html)
- [Qwen3.5-9B model card](https://huggingface.co/Qwen/Qwen3.5-9B)
- [Gemma 4 documentation](https://ai.google.dev/gemma/docs/core)
- [Gemma 4 12B model card](https://huggingface.co/google/gemma-4-12B)
- [Kimi K2.6 model card](https://huggingface.co/moonshotai/Kimi-K2.6)

Model cards should be used to verify current multimodal support, context limits, license terms, tool-call templates, serving requirements, and hardware needs.

---

## Model evaluation should reflect this artwork

General benchmarks are useful filters, but the final decision should come from representative project tests.

A small evaluation set should test whether a candidate can:

1. decide correctly when a tool is needed;
2. select the correct tool and produce valid arguments;
3. chain perception, comparison, reflection, and persistence operations;
4. recover from malformed or unavailable tool results;
5. interpret the same image consistently under a stable perception profile;
6. remain distinct when given different Individual identities;
7. preserve identity over repeated cycles;
8. update beliefs without rewriting the complete character;
9. separate immediate observation from historical expectation;
10. produce concise structured reflection;
11. avoid exposing unnecessary internal reasoning;
12. operate within acceptable latency and cost.

Useful metrics include:

- wrong-tool rate;
- malformed-call rate;
- recovery rate;
- structured-output validity;
- identity drift;
- perception-profile consistency;
- drawing-language consistency;
- rate of unwanted convergence;
- sensitivity to social feedback;
- cost and latency per completed cycle.

Human artistic review remains necessary. A technically consistent model may still produce an uninteresting society.

---

## Prototype recommendations

For the Build Week milestone:

1. Use one base model for all three Individuals.
2. Store identity and memory outside the model.
3. Implement a short recent-memory window plus a long-term summary.
4. Keep peer observation fresh by default.
5. Add reflection as an explicit state transition after compositing.
6. Give each Individual different social-disposition parameters.
7. Permit bounded learning about peer perception and tool use.
8. Keep all intermediate portraits and structured state changes inspectable.
9. Use procedural and deterministic visual systems where possible.
10. Use expensive model-generated imagery only where it meaningfully strengthens the installation.
11. Build deterministic replay and recovery before running unattended cycles.
12. Treat model selection as an adapter decision, not an identity decision.

---

## Open questions

These remain artistic and technical decisions rather than resolved requirements:

- How much of a peer model should influence immediate perception?
- Can an Individual deliberately manipulate how a specific peer will redraw it?
- Should relationship models decay when peers change?
- How often should the long-term summary be regenerated?
- Which parts of identity are mutable, and which are protected?
- Can an Individual reject the complete social composite?
- Should it know which peer produced each interpretation?
- Can peers communicate except through images?
- How should trust develop or collapse?
- What prevents all Individuals from converging?
- What should happen when a model update changes cognition dramatically?
- Should a model migration be treated as continuity, injury, transformation, or replacement?
- How much reflection should be visible to exhibition visitors?
- Can tool-use proficiency become part of artistic identity without turning the work into an optimization benchmark?

---

## Working design principle

> An Individual remembers the consequences of being seen, but it does not merely replay how it was seen before.

Its next portrait should emerge from a negotiation between:

- what it believes it is;
- what it wants to become;
- what it attempted to communicate;
- what its peers returned;
- what it predicts they may see next;
- and how much it is willing to change in order to be understood.
