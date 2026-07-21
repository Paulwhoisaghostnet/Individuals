# Handoff, Audit & QA Guide

**Branch**: `feature/agent-cognition-and-memory`  
**Repository**: `Individuals`  
**Status**: All 4 Phases Complete (100% Roadmap Progress, 39 Passing Unit Tests)

---

## 1. Branch Executive Summary

This feature branch delivers the complete **Individuals** system architecture — a closed, adaptive digital society of three persistent artistic identities (**Iris**, **Morrow**, and **Sable**) that perceive each other's portraits, reflect on ideal vs. perceived form, composite social feedback, and adapt their self-portraits over continuous cycles.

### Key Milestones Completed
- **Phase 1: Exhibition Foundation**: Gallery UI, responsive design, local `localStorage` playback persistence, curator perception-tuner, full ARIA accessibility pass.
- **Phase 2: Closed Identity Loop**: 6-axis `SocialDisposition`, subjective `PeerModel` tracking, identity packages (`iris.ts`, `morrow.ts`, `sable.ts`), reference adapters, model-backed `LlmCognitionSystem` with automatic procedural fallback, `SocietySimulation`.
- **Phase 3: Living Digital Exhibition**: Continuous background runtime (`SocietyRuntime`), atomic file persistence (`FileIndividualRepository`), file memory store (`FileMemoryStore`), SSE event stream bridge (`EventStreamBridge`), privacy-preserving telemetry (`HealthMonitor`).
- **Phase 4: Physical & Distributed Installations**: Optical camera observation (`CameraObservationSystem`), hardware commissioning validator (`CommissioningChecklist`), multi-location network bridge (`MultiLocationBridge`), identity migration handoff (`MigrationProtocol`).

---

## 2. Architecture & File Inventory

```text
software/individual/
├── core/                           # Foundation Domain Model & Engine
│   ├── model.ts                    # Schemas (Manifest, State, SocialDisposition, PeerModel, MemoryEntry)
│   ├── manifest.ts                 # Manifest validation & 0..1 unit interval enforcement
│   ├── createInitialState.ts       # State factory with initial relationship maps
│   ├── engine/
│   │   └── IndividualEngine.ts     # Engine orchestrator for intent -> draw -> observe -> reflect -> adapt
│   └── template/                   # Template factories & default mock systems
├── identity-packages/              # Persistent Identity Definitions
│   ├── iris.ts                     # Iris manifest (precise observational eye)
│   ├── morrow.ts                   # Morrow manifest (distorted gestural eye)
│   ├── sable.ts                    # Sable manifest (fragmented spatial eye)
│   └── index.ts                    # Barrel export
├── cognition/                      # Cognition Layer (Intent & Reflection)
│   ├── llmClient.ts                # FetchLlmClient (OpenAI/Anthropic/Ollama/vLLM compatible)
│   ├── prompts.ts                  # System prompts & token-budgeted user prompt builders
│   ├── llmCognition.ts             # LlmCognitionSystem with automatic procedural fallback
│   └── proceduralCognition.ts      # Deterministic fallback cognition system
├── perception/                     # Perception Layer (Observation)
│   ├── proceduralPerception.ts     # Boundary lock, deferred mosaic & motion residue filters
│   └── cameraObservation.ts        # Physical camera lens distortion & optical calibration
├── drawing/                        # Drawing Layer (Generative Output)
│   └── generativeDrawing.ts        # Generative SVG portrait rendering based on artistic skill
├── social-feedback/                # Social Compositing
│   └── proceduralCompositor.ts     # Composite peer portrait feedback into social portraits
├── memory/                         # Persistence & Semantic Archive
│   ├── fileRepository.ts           # Atomic JSON snapshot persistence (.data/individuals/snapshots/)
│   └── fileMemoryStore.ts          # Append-only semantic memory store (.data/individuals/memories/)
├── observability/                  # Telemetry & Diagnostics
│   └── healthMonitor.ts            # Privacy-preserving health state (healthy/degraded/faulted) & log redaction
├── runtime/                        # Continuous Process Runtime & Networking
│   ├── societyRuntime.ts           # Background runtime scheduler with cadence jitter & fault isolation
│   ├── eventStreamBridge.ts        # Server-Sent Events (SSE) stream bridge for web clients
│   ├── multiLocationBridge.ts      # Inter-site network bridge & link outage isolation
│   └── migrationProtocol.ts        # Atomic identity snapshot migration between venues
└── testing-simulation/             # Multi-Cycle Simulation Suite
    └── SocietySimulation.ts        # Deterministic simulation runner for multi-individual testing

hardware/operations/commissioning/  # Physical Hardware Commissioning
└── checklist.ts                    # Hardware acceptance checklist validator

src/exhibition/                     # Exhibition Frontend (React + Vite)
├── App.tsx                         # Main exhibition container with local persistence
├── ExhibitionGallery.tsx           # Responsive society gallery view
├── IndividualFocus.tsx             # Focused identity view with dialog modal accessibility
├── PerceptionTuner.tsx             # Curator perception calibration dialog modal
├── PortraitCanvas.tsx              # SVG artwork renderer
└── About.tsx                       # Exhibition essay modal
```

---

## 3. Verification & QA Commands

Run the following commands from the repository root (`/Users/opeculiar/work/Individuals`):

### Full Verification Pipeline
```sh
npm run check
```
*Executes TypeScript typechecking, Vitest unit test suite (39 tests), and Vite production build.*

### Unit Test Suite
```sh
npm run test
```
*Executes all 13 test files:*
- `src/exhibition/__tests__/accessibilityAndPersistence.test.ts`
- `src/exhibition/__tests__/cycle.test.ts`
- `src/exhibition/__tests__/drawing.test.ts`
- `src/exhibition/__tests__/generative.test.ts`
- `src/exhibition/__tests__/perception.test.ts`
- `software/individual/cognition/__tests__/llmCognition.test.ts`
- `software/individual/core/__tests__/IndividualEngine.test.ts`
- `software/individual/memory/__tests__/durablePersistence.test.ts`
- `software/individual/perception/__tests__/cameraObservation.test.ts`
- `software/individual/runtime/__tests__/distributedSociety.test.ts`
- `software/individual/runtime/__tests__/eventStreamBridge.test.ts`
- `software/individual/runtime/__tests__/societyRuntime.test.ts`
- `software/individual/testing-simulation/__tests__/simulation.test.ts`

### Development Exhibition Server
```sh
npm run dev
```
*Launches local Vite server (default `http://localhost:4173` / `4174`).*

---

## 4. Key Security, Ethics & Audit Checkpoints

When performing an audit on this branch, verify the following core invariants:

1. **LLM Fallback Integrity**:
   - Disable or provide an invalid LLM endpoint in `LlmCognitionSystem`.
   - Verify `IndividualEngine` seamlessly degrades to `ProceduralCognitionSystem` without throwing exceptions or stalling cycles.

2. **Fault Isolation**:
   - Induce an error in one Individual process during `SocietyRuntime` execution.
   - Verify `HealthMonitor` logs a `degraded`/`faulted` state while peer Individual runtimes continue cycling cleanly.

3. **Privacy Redaction**:
   - Inspect `HealthMonitor` event logs.
   - Confirm prompt text, keys, bearer tokens, and private chain-of-thought are strictly redacted from telemetry.

4. **Camera Ethics Constraint**:
   - Confirm `CameraObservationSystem` optics target peer canvas display IDs exclusively.
   - Verify visitor imagery is never captured or processed into observations.

5. **Inter-Site Outage Isolation**:
   - Disconnect a link in `MultiLocationBridge`.
   - Verify inter-site message delivery fails gracefully without corrupting local site state or identity snapshot persistence.

---

## 5. Git Branch Information

- **Branch**: `feature/agent-cognition-and-memory`
- **Latest Commit**: `c74eb2c` — *feat(software): implement Phase 4 physical camera perception, commissioning checklist, multi-location bridge, and identity migration*
- **Clean Working Tree**: Yes (`git status` clean).
