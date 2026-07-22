# Individuals rebuild report - 2026-07-21

This report records the full rebuild of the Individuals digital prototype from
the partner branch into the modular runtime and exhibition implementation on
`codex/rebuild-agent-runtime`.

## Report scope

| Item | Value |
| --- | --- |
| Report date | 2026-07-21 |
| Repository | `Paulwhoisaghostnet/Individuals` |
| Source baseline | `cbc4d12` (`origin/feature/agent-cognition-and-memory`) |
| Rebuild commit | `ee1459c` (`Rebuild embodied society runtime and exhibition`) |
| Published branch | `codex/rebuild-agent-runtime` |
| Files changed in rebuild | 227 |
| Line accounting | 28,359 additions, 5,221 deletions |
| Automated test inventory | 40 test files, 259 passing tests |

The file and line counts describe the implementation diff from `cbc4d12` through
`ee1459c`. This report and its documentation-index entry were added afterward and
are not included in those figures.

## Outcome

The branch was converted from a promising demonstration into a bounded,
testable prototype architecture for a persistent society of embodied artificial
artists. The finished rebuild does four things the previous implementation did
not reliably prove:

1. Every portrait is an attempt to depict a literal authored physical body.
2. Perception and drawing are separate, independently causal limitations.
3. Peer drawings and their social composite remain traceable through the entire
   identity loop and across a restart.
4. The public exhibition, private runtime, persistence layer, curator controls,
   and deployment boundary are distinct systems rather than one application
   monolith.

The resulting prototype runs a closed society of Iris, Morrow, and Sable. It can
operate procedurally without a language-model provider, use a provider through a
strict adapter when configured, persist identity safely, expose a narrow live API,
and present verified runtime artwork or an explicitly labeled local study in the
browser.

## Design requirements made enforceable

The project concept was translated into implementation invariants rather than
left as prompt language:

- **Literal embodiment:** an Individual identifies with an authored body plan,
  anatomy, face, surface, posture, movement, and identifying features. Abstract
  treatment can distort that body but cannot replace it with unrelated patterns.
- **Three physical selves:** ideal, currently perceived, and socially returned
  bodily states are represented separately and compared through typed evidence.
- **Situated perception:** each observer has a stable, unique distortion model
  with bounded controls and deterministic behavior.
- **Situated drawing:** each artist has a persistent mark vocabulary, composition
  habits, correction practice, skill profile, and inability profile.
- **Causal feedback:** every social portrait is derived from specific peer
  observations and drawings; reflection cannot invent visual evidence from prose.
- **Persistent tension:** adaptation can move a body belief toward an ideal while
  preserving disagreement, personal continuity, and non-negotiable features.
- **Truthful exhibition state:** generated studies, verified live artwork, stale
  live state, and runtime outages are visibly different conditions.
- **Operational isolation:** the public web service and private stateful runtime
  use separate containers, permissions, storage, and network exposure.

## Changes by domain

### 1. Repository foundation and project hygiene

- Rewrote the root `README.md` around the actual installation concept, literal
  embodiment, the identity loop, the digital prototype, current capabilities,
  development workflow, production boundary, documentation map, and honest
  limitations.
- Added `.editorconfig`, `.node-version`, explicit Node/npm engine metadata, and
  normalized development scripts.
- Expanded `.gitignore` and `.dockerignore` so generated state, telemetry, build
  output, credentials, and local tooling artifacts stay out of published source.
- Removed committed runtime state under `.data/demo-individuals/`; production
  identity now belongs in a mounted data volume.
- Removed obsolete handoff, memory-notes, and standalone roadmap artifacts that
  duplicated or contradicted the implemented architecture:
  `HANDOFF_AND_AUDIT_GUIDE.md`,
  `individuals-agent-memory-and-reflection-notes.md`, and `roadmap.html`.
- Added `CONTRIBUTING.md`, `SECURITY.md`, a structured bug template, a pull-request
  template, Dependabot configuration, and a least-privilege GitHub Actions workflow.
- Added a structured documentation tree for architecture, issue routing, threat
  boundaries, deployment, automated acceptance, and real-browser release checks.

### 2. Authored embodied identities

The identity manifests were upgraded to schema version 4 and now define literal
physical forms, current body beliefs, immutable anchors, social disposition,
perception, and artistic practice.

| Individual | Authored physical identity | Perception model | Drawing practice |
| --- | --- | --- | --- |
| Iris | Tall copper-brown woman with a shaved oval head, long neck, level shoulders, and four-fingered hands | Boundary Lock | Unbroken Contour |
| Morrow | Compact androgynous silver-grey body with a square face, broad torso, strong legs, and translucent plates | Deferred Mosaic | Assembled Planes |
| Sable | Very tall umber man with an elongated face, long limbs, six-fingered hands, and a red spinal line | Motion Residue | Repeated Gesture |

Each package now includes:

- normalized body geometry for stature, head, torso, limbs, openness, verticality,
  symmetry, center, and posture;
- categorical anatomy for face, eyes, nose, mouth, hands, skin, surface, plates, or
  spinal markings;
- a distinct initial physical-self belief and perceived differences from the ideal;
- non-negotiable visual features that adaptation and model output cannot erase;
- social permeability, resistance, recognition needs, curiosity, and peer trust;
- authored perception controls; and
- an executable artistic ability scope rather than a decorative style label.

### 3. Typed identity and causal evidence model

- Expanded the core model to represent physical forms, body beliefs, anatomy,
  figure descriptors, artwork descriptors, observation evidence, social evidence,
  portrait provenance, and cycle state.
- Added centralized primitive, portrait-boundary, and visual-evidence validators.
  Unknown fields, non-finite values, invalid ranges, oversized structures, invalid
  peer ownership, and unsafe artwork are rejected at their domain boundaries.
- Added deterministic utilities so repeated inputs, observer tunings, and seeds
  produce stable evidence for testing and exhibition continuity.
- Added geometry utilities that turn current body belief and adaptation into visible
  figure changes rather than caption-only changes.
- Added manifest compatibility checks and explicit schema/version handling.
- Reworked `IndividualEngine` around the causal sequence:

  `intent -> self portrait -> peer observations -> peer drawings -> social
  composite -> reflection -> body adaptation -> atomic commit`.

- Split portrait routing out of the engine so pending delivery, accepted social
  cohorts, peer ownership, cycle relevance, and completed social evidence have one
  focused owner.

### 4. Perception systems

Perception now changes the structured physical subject before drawing begins. It
does not merely add a visual filter after the artwork exists.

- **Iris - Boundary Lock:** edge gain, interior loss, and symmetry pull preserve
  outlines while suppressing internal anatomy and regularizing asymmetry.
- **Morrow - Deferred Mosaic:** retention, fragment scale, and temporal lag rebuild
  a body from incomplete delayed rectangular samples.
- **Sable - Motion Residue:** echo count, echo spacing, and stillness fade preserve
  moving anatomy as repeated positions while stationary detail loses contrast.

The controls have manifest-defined IDs, labels, explanations, minima, maxima,
steps, and defaults. Unknown, out-of-range, off-step, or non-finite values are
rejected. Runtime tuning is durably saved before it is acknowledged and is restored
after restart.

Additional perception work includes:

- deterministic, observer-specific distortion that does not randomly reverse with
  each new portrait;
- independent effects for geometry, categorical anatomy, features, color, masks,
  and glitches;
- explicit digital-canvas and physical-camera frame contracts;
- camera-route and capture provenance;
- optical calibration as a separate stage from artistic distortion;
- rejection of physical frames that smuggle in a digital source descriptor; and
- degraded-input evidence instead of silent pass-through behavior.

### 5. Drawing systems and procedural portrait rendering

- Introduced a reusable `FigureDescriptor` and anatomy-ability pipeline.
- Implemented safe, bodily SVG rendering for self, peer, and social portraits.
- Made body geometry, anatomy, posture, materials, unique features, perception
  losses, and drawing skill affect visible output.
- Ensured peer renderers redraw from perceived evidence; source SVG is never nested
  or copied into a peer portrait.
- Separated artistic proficiency from perceptual quality. A clear observation may
  be drawn badly, and a distorted observation may be drawn skillfully.
- Defined six drawing proficiencies: observational accuracy, proportion accuracy,
  anatomical coherence, line control, detail capacity, and spatial coherence.
- Made each practice executable through mark mode, composition mode, correction
  mode, line-lift/erasure permissions, repetition, detail suppression, curve
  quantization, and overlap simplification.
- Prevented private descriptor strings, model prose, interpreted labels, and
  untrusted color values from becoming public SVG text or paint.
- Retained the procedural renderer as an inexpensive continuous prototype adapter;
  a future image model can be added without bypassing the same body, perception,
  ability, provenance, and safety contracts.

### 6. Cognition and language-model boundary

- Separated body adaptation, coherence measurement, causal language, prompt
  context, prompt budgeting, provider calls, and procedural cognition into focused
  modules.
- Rebuilt prompts around the literal physical form, current body belief, visible
  portrait evidence, peer contributions, and social deltas.
- Added a 64,000-byte cognition prompt budget that retains required identity and
  physical anchors while removing optional sections in structured units. JSON is
  never made invalid by arbitrary string slicing.
- Added strict structured-output validation and bounded provider request/response
  handling.
- Added deadlines, abort propagation, categorized provider errors, retry guidance,
  and causal procedural fallback for missing credentials, timeout, rate limiting,
  malformed JSON, invalid schema, or oversized output.
- Kept provider-specific behavior behind a neutral client boundary. The language
  model is an optional cognition adapter, not the source of identity or truth.
- Converted private reasoning into concise causal exhibition language. Prompts,
  chain-of-thought, provider bodies, credentials, raw exceptions, and private
  narrative are never sent to the public projection or telemetry.

### 7. Peer feedback, social composition, and adaptation

- Added typed peer observation and drawing evidence with explicit artist, subject,
  source portrait, transformation, ability, cycle, and artifact provenance.
- Added social compositing that records the exact contributing peer drawings,
  measured self/social differences, and peer disagreement.
- Added relationship-aware adaptation without allowing remote peers to authoritatively
  rewrite the subject's identity.
- Added cohort policy for a whole society of 1-17 Individuals. The current causal
  bound permits at most 16 peers per subject; larger installations must use a
  future bounded-cohort strategy explicitly.
- Persisted `latestSocialPeerPortraits` atomically with the corresponding social
  composite. A restart now restores the exact completed causal bundle instead of
  reconstructing peer evidence from current process memory.
- Kept undelivered pending peer routes separate and process-local. Completed social
  evidence is durable; unconsumed delivery is not falsely presented as durable.
- Allowed a peer artwork to retain the artist's own cycle number. The browser no
  longer rejects valid social evidence merely because independent Individuals have
  different cycle counters.

### 8. Durable memory and recovery

- Replaced loose file writes with validated snapshot and memory repositories.
- Added journaled cycle persistence so a snapshot and its matching memory commit
  recover together after failure at any write stage.
- Added atomic replacement, backup recovery, incomplete-transaction replay, and
  idempotent recovery.
- Added manifest and state validation at load time.
- Added durable per-Individual corruption markers and quarantine. Invalid active
  identity or memory fails closed instead of silently creating a new Individual.
- Distinguished a genuinely new installation from missing legacy state so loss of
  old state cannot masquerade as first boot.
- Added administrative replacement paths that clear a quarantine only after the
  replacement validates against the installed manifest.
- Added byte and count quotas for active state, memory, backups, archives,
  quarantine, and journals. Retention cleanup never deletes valid active identity
  to make room.
- Added file-safety helpers for path containment, bounded reads, safe names,
  directory expectations, and controlled permissions.

### 9. Runtime orchestration and observability

- Split the previous runtime into initializer, engine factory, cycle policy,
  executor, scheduler, status reader, controls, consistency coordinator, revision
  publisher, tuning store/controller, deadline runners, and public projection.
- Added scheduled and manual cycle admission with minimum spacing, global
  concurrency, per-Individual serialization, timeout, and durable daily provider
  budgets.
- Added per-Individual write fences. If an adapter ignores cancellation and returns
  after a deadline, that Individual cannot start an overlapping write, while the
  rest of the society continues.
- Added bounded startup, status projection, tuning, and control operations.
- Deferred/coalesced public revisions across mutation leases so subscribers are not
  prompted to read a known partial state.
- Added pause, resume, drain, and bounded graceful shutdown behavior.
- Added explicit `startedAt` runtime identity so a restarted process can reset its
  revision without the browser treating valid new state as stale.
- Added bounded health events and rotating telemetry. Logs retain sanitized
  operation/category context rather than secrets or private identity data.

### 10. Multi-location protocol foundation

- Added versioned canonical-JSON envelopes and explicit public payload types.
- Added message IDs, source/destination ownership, authorization registry, sequence
  tracking, acknowledgements, replay-safe idempotence, bounded retries, and durable
  outbound state.
- Added hard transport and application deadlines in addition to cooperative abort
  signals so a non-settling adapter cannot hold the shared protocol boundary.
- Detached and froze retained protocol values so caller mutation cannot alter
  authorization, sequencing, or retry decisions.
- Tightened migration trust and ownership rules. A content digest is integrity
  evidence, not authentication, and remote peer portraits cannot overwrite the
  depicted subject's local identity.
- Preserved local autonomy during network outages.

This is a protocol core, not a commissioned global network. Mutual authentication,
encryption, key rotation, venue authorization, and a real transport remain required
before locations exchange production messages.

### 11. Runtime server, public API, and security boundary

- Added a focused HTTP server layer rather than embedding routes in the runtime.
- Added a versioned, allowlisted public society DTO. It excludes private narrative,
  prompts, memory, trust/relationship state, provider responses, filesystem paths,
  stack traces, and raw SVG.
- Materialized portraits behind bounded, opaque, same-origin artifact identifiers.
- Added SVG sanitization, safe response headers, content security policy, bounded
  artifact storage, and explicit missing-artifact responses.
- Added an SSE invalidation stream with heartbeat, connection/backpressure bounds,
  subscriber cleanup, and polling recovery.
- Added curator control routes with bearer authorization, exact-origin checks,
  required JSON content type, strict schemas, request-body limits, and rate limits.
- Added bounded request/response handling, sanitized errors, startup cleanup, health
  endpoints, and graceful shutdown.
- Bound public runtime liveness to the current `startedAt` instance rather than a
  browser-invented or static cycle counter.

### 12. Exhibition client

- Reorganized the React client into exhibition components, portrait renderers,
  runtime transport/state modules, validation, controls, and focus-management
  hooks instead of concentrating behavior in `App.tsx` or `PortraitCanvas.tsx`.
- Added a portrait-first group gallery and focused Individual view.
- Added visible ideal/self/social comparison, peer portraits, cycle activity,
  source/provenance language, and perception calibration.
- Added three explicit artwork states:
  `verified-live`, `local-simulation`, and `unverified-study`.
- Kept the last verified live state during a temporary transport failure, rejected
  stale regressions, accepted a newly started runtime, and recovered through
  bounded polling after SSE failure.
- Added strict browser-side validation for API version, unknown fields, timestamps,
  cycle/state relationships, tuning bounds, same-origin artwork URLs, and payload
  size.
- Added request deadlines and explicit artwork-load failure states. Missing live
  artwork can show a visibly labeled local study but cannot masquerade as the
  runtime's portrait.
- Added ephemeral curator controls for pause, resume, reset, and perception tuning.
  The bearer token stays only in component memory and is cleared when the panel
  closes or the page reloads.
- Fixed Chromium's receiver-sensitive native `window.fetch` behavior by invoking
  the stored function without rebinding it to the API client instance.
- Added dialog focus containment, Escape handling, focus return, keyboard access,
  reduced-motion behavior, and narrow-screen layout protections.
- Expanded the visual design into a coherent exhibition surface while keeping
  operational detail subordinate to the portraits.

### 13. Production topology and shared Hetzner-host preparation

- Split production into `individuals-web` and `individuals-runtime` images.
- Kept the runtime on a private Docker network and exposed only the web container
  on loopback. The runtime API is reverse-proxied through a narrow `/api/` boundary.
- Added a named volume for durable identity state and a read-only secret mount.
- Made both images non-root and read-only, dropped all Linux capabilities, enabled
  `no-new-privileges`, and added bounded tmpfs, PID, CPU, memory, shutdown, and log
  policies.
- Added container health checks and start ordering.
- Hardened Nginx with security headers, CSP, request/response limits, SSE proxy
  behavior, safe forwarding, and internal runtime DNS re-resolution after a
  container restart.
- Added host-level Nginx snippets in their correct `http` and `server` contexts,
  trusted-forwarding guidance, rate limits, and forwarded-header clearing.
- Documented secret ownership, backup, upgrade, rollback, health checks, recovery,
  DNS behavior, and shared-host isolation.
- Preserved separation from `lilguys.xyz`: no shared writable volume, database,
  secret, container, port, or public server block is required.

### 14. Hardware and physical-installation boundary

- Retained the hardware requirement tree and aligned commissioning checks with the
  software's evidence contracts.
- Expanded the commissioning checklist to cover route identity, calibration,
  privacy, power, thermal, network, safety, display, and camera evidence.
- Made physical acquisition fail honestly: a camera frame cannot borrow the
  structured descriptor available to a digital canvas and claim it was visually
  interpreted.
- Documented that future cameras observe peer canvases, not exhibition visitors,
  and require venue-specific privacy review before commissioning.

### 15. Tests, continuous integration, and release evidence

- Expanded the suite to 40 test files and 259 tests across cognition, core engine,
  drawing, memory, observability, perception, runtime, server, social feedback,
  simulation, and exhibition client behavior.
- Added causal tests proving that body belief changes geometry, every perception
  control has an owned visual effect, drawing ability acts after perception, peer
  artwork is newly rendered, and social feedback changes later adaptation.
- Added provider tests for missing credentials, timeout, rate limits, invalid JSON,
  invalid schema, oversized output, prompt budgets, and private-data containment.
- Added persistence fault injection, corruption/quarantine, legacy-state,
  transaction recovery, restart continuity, and quota tests.
- Added runtime tests for concurrency, cycle policy, late-settling operations,
  startup/control deadlines, tuning persistence, revision consistency, bounded
  telemetry, and multi-location delivery behavior.
- Added server tests for DTO privacy, control authorization, origin/content-type
  enforcement, request size, rate limits, SSE lifecycle, artifact safety, and
  restart identity.
- Added exhibition tests for runtime validation, freshness/restart ordering,
  transport fallback, local-state persistence, provenance, calibration, artwork
  failure, native fetch invocation, and DOM identifier uniqueness.
- Added GitHub Actions gates for exact dependency installation, typechecking,
  tests, production client build, dependency audit, Compose validation, both image
  builds, Nginx validation, hardened container startup, live API smoke tests, and
  cleanup.

## Important defects closed during final validation

Several issues only became visible when the complete system was exercised rather
than when isolated modules were inspected:

- The original portrait output could satisfy an image contract without depicting a
  body. Typed figure evidence and a figurative renderer now make embodiment causal.
- Live and generated artwork could be visually ambiguous. Provenance modes and
  explicit fallback language now prevent a local study from claiming live status.
- Social composites could outlive the process-local peer drawings that caused them.
  Exact peer contributors now commit atomically with the composite.
- Independent Individuals legitimately advance at different cycle numbers. Client
  validation now checks each peer artwork against its artist rather than forcing
  the subject's cycle number onto every contribution.
- A restarted runtime could have a lower revision and be rejected as stale. The
  browser now compares both revision and `startedAt` instance identity.
- Chromium rejected a stored native `fetch` called with the API-client receiver.
  The request path now preserves the browser's required invocation semantics.
- Artwork failure previously risked leaving a misleading blank or implicit
  substitute. Failure state, retry behavior, and labeled procedural fallback are
  now explicit.

## Verification performed

The completed rebuild was validated with the following evidence:

| Verification | Result |
| --- | --- |
| `npm run check` | Passed typecheck, all 40 test files / 259 tests, and production client build |
| `npm audit --audit-level=high` | Passed with zero reported vulnerabilities |
| Production client build | Passed; approximately 265.30 kB JavaScript (83.23 kB gzip) and 25.21 kB CSS (5.76 kB gzip) |
| `docker compose -f compose.production.yml config` | Passed |
| Web and runtime image builds | Passed |
| Inner and host Nginx validation | Passed |
| Hardened two-container smoke test | Passed health and live `/api/v1/society` checks |
| Runtime restart persistence | Passed with identity/cycle state retained |
| Runtime-container DNS recovery | Passed through the web proxy after runtime replacement |
| Browser release pass | Passed gallery, focus views, curator controls, focus trap, 320 px layout, reduced motion, API outage/recovery, and artwork failure/recovery |
| Browser console | Clean during final release scenarios |

Temporary runtime data, screenshots, container volumes, and test credentials were
not added to the rebuild commit.

## Domain ownership after the rebuild

| Path | Responsibility |
| --- | --- |
| `software/individual/core/` | Identity state, cycle orchestration, typed evidence, invariants |
| `software/individual/cognition/` | Intent/reflection adapters, provider boundary, prompt policy |
| `software/individual/perception/` | Digital/camera acquisition and stable visual distortions |
| `software/individual/drawing/` | Figure descriptors, artistic ability, safe portrait rendering |
| `software/individual/social-feedback/` | Peer evidence, social composition, relationship adaptation |
| `software/individual/memory/` | Validation, atomic storage, journals, recovery, retention |
| `software/individual/runtime/` | Scheduling, controls, deadlines, budgets, multi-site protocol |
| `software/individual/server/` | HTTP, SSE, authorization, public artifacts and projections |
| `src/exhibition/` | Visitor gallery, runtime connection, calibration, curator UI |
| `hardware/` | Physical requirements and commissioning evidence |
| `deploy/` | Container proxying, host integration, secrets, operations |
| `docs/` | Architecture, issue ownership, security, testing, operations |

The issue-routing guide at
[`../architecture/issue-routing.md`](../architecture/issue-routing.md) assigns a
defect to the domain that owns its invariant. This is intended to prevent the
runtime, server, or exhibition client from growing into a replacement monolith.

## Deliberate boundaries and work not claimed as complete

The rebuild is a strong digital prototype, not a claim that every eventual
installation component has been commissioned:

- Portraits are currently rendered by the procedural bodily SVG adapter. A
  reviewed image-generation adapter has not yet been added.
- The optional LLM is guided and bounded through identity context and schemas; no
  model has been fine-tuned, and the software does not claim metaphysical belief or
  consciousness.
- The physical camera path has contracts and commissioning requirements but has not
  been installed or calibrated in a venue.
- The multi-location layer has a protocol core but no selected production
  transport, certificates, key-rotation system, or venue trust registry.
- The production topology is prepared for a shared Hetzner host but was not
  deployed to that server as part of the rebuild.
- Long-duration gallery endurance and a real venue's power, thermal, network,
  accessibility, and privacy commissioning still require site evidence.

## Recommended next sequence

1. Review and merge `codex/rebuild-agent-runtime` through a pull request.
2. Deploy the two-container topology to an isolated staging hostname on the Hetzner
   server and rehearse backup, restore, restart, and rollback.
3. Run a multi-day unattended endurance test with provider failure injection and
   storage/telemetry monitoring.
4. Add one reviewed image-generation drawing adapter behind the existing contracts
   and compare its causal fidelity against the procedural renderer.
5. Commission one physical camera/display route before expanding the hardware
   topology.
6. Select and threat-model an authenticated inter-site transport only when a second
   location is ready.

## Reproducing the implementation inventory

```sh
git diff --stat cbc4d12..ee1459c
git diff --name-status cbc4d12..ee1459c
npm ci
npm run check
npm audit --audit-level=high
docker compose --file compose.production.yml config --quiet
docker build --tag individuals-web:test .
docker build --file Dockerfile.runtime --tag individuals-runtime:test .
```

The architecture and acceptance contracts referenced by this report are maintained
in [`../architecture/system.md`](../architecture/system.md) and
[`../testing/acceptance.md`](../testing/acceptance.md).
