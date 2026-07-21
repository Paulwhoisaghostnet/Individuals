import { createInitialState } from "../createInitialState";
import { defineIndividualManifest } from "../manifest";
import { assertPersistedManifestCompatible } from "../manifestCompatibility";
import type {
  CycleInput,
  CycleRecord,
  IndividualManifest,
  IndividualSnapshot,
  MemoryEntry,
} from "../model";
import type {
  CycleCommitter,
  IndividualRepository,
  MemoryStore,
} from "../persistence/contracts";
import type {
  AdaptationSystem,
  Clock,
  CognitionSystem,
  CycleProgressSink,
  DrawingSystem,
  FeedbackCompositor,
  IdGenerator,
  PerceptionSystem,
  RelationshipAdaptationSystem,
} from "../systems/contracts";
import {
  MAX_SELF_PORTRAIT_HISTORY,
  PortraitRoutingBoundary,
} from "./portraitRouting";

export interface IndividualEngineDependencies {
  readonly cognition: CognitionSystem;
  readonly perception: PerceptionSystem;
  readonly drawing: DrawingSystem;
  readonly feedback: FeedbackCompositor;
  readonly adaptation: AdaptationSystem;
  readonly relationships: RelationshipAdaptationSystem;
  readonly repository: IndividualRepository;
  readonly memory: MemoryStore;
  /** Preferred atomic commit boundary; legacy adapters may omit it. */
  readonly committer?: CycleCommitter;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Explicit society registry; trust and learned relationships are not routing authority. */
  readonly allowedPeerIds: readonly string[];
  /** Ephemeral progress only; transient phases are not persisted as identity state. */
  readonly progress?: CycleProgressSink;
}

export class IndividualEngine {
  readonly manifest: IndividualManifest;
  private readonly portraitRoutes: PortraitRoutingBoundary;

  constructor(
    manifest: IndividualManifest,
    private readonly dependencies: IndividualEngineDependencies,
  ) {
    this.manifest = defineIndividualManifest(manifest);
    this.portraitRoutes = new PortraitRoutingBoundary(
      this.manifest.id,
      dependencies.allowedPeerIds,
      this.manifest.identity.idealPhysicalForm.visualSpecification?.figure,
    );
  }

  async getSnapshot(signal?: AbortSignal): Promise<IndividualSnapshot> {
    signal?.throwIfAborted();
    const existing = await this.dependencies.repository.load(
      this.manifest.id,
      signal,
      this.manifest,
    );
    signal?.throwIfAborted();
    if (existing) {
      assertPersistedManifestCompatible(this.manifest, existing.manifest);
    }
    return existing ?? {
      manifest: this.manifest,
      state: createInitialState(this.manifest, this.dependencies.clock.now()),
    };
  }

  async runCycle(input: CycleInput): Promise<CycleRecord> {
    const {
      cognition,
      perception,
      drawing,
      feedback,
      adaptation,
      relationships,
      memory,
      repository,
    } = this.dependencies;
    const signal = input.signal;
    signal?.throwIfAborted();
    const snapshot = await this.getSnapshot(signal);
    signal?.throwIfAborted();

    if (snapshot.state.status === "paused") {
      throw new Error(`Individual "${this.manifest.id}" is paused.`);
    }

    this.portraitRoutes.assertPeerSelfPortraits(input.peerSelfPortraits);
    const feedbackSourcePortrait = this.portraitRoutes.resolveFeedbackSource(
      snapshot.state,
      input.receivedPeerPortraits,
    );
    const perceptionTuning = this.resolvePerceptionTuning(input.perceptionTuning);

    const cycle = snapshot.state.cycle + 1;
    const startedAt = this.dependencies.clock.now();
    try {
      await this.reportProgress(cycle, "reflecting");
      signal?.throwIfAborted();
      const memories = await memory.recall(
        { individualId: this.manifest.id, limit: 24 },
        signal,
      );
      signal?.throwIfAborted();
      const intent = await cognition.formIntent({
        manifest: this.manifest,
        state: snapshot.state,
        memories,
        cycle,
        signal,
      });
      signal?.throwIfAborted();

      await this.reportProgress(cycle, "drawing");
      signal?.throwIfAborted();
      const selfPortrait = await drawing.drawSelf({
        manifest: this.manifest,
        state: snapshot.state,
        intent,
        cycle,
        createdAt: startedAt,
        signal,
      });
      signal?.throwIfAborted();
      this.portraitRoutes.assertSelfPortraitOutput(selfPortrait, cycle);

      await this.reportProgress(cycle, "observing");
      signal?.throwIfAborted();
      const observations = await Promise.all(
        input.peerSelfPortraits.map((portrait) =>
          perception.observe({
            manifest: this.manifest,
            state: snapshot.state,
            portrait,
            cycle,
            tuning: perceptionTuning,
            signal,
          }),
        ),
      );
      signal?.throwIfAborted();
      this.portraitRoutes.assertObservationOutputs(observations, input.peerSelfPortraits, {
        modelId: this.manifest.perception.modelId,
        tuning: perceptionTuning,
      });

      await this.reportProgress(cycle, "drawing");
      signal?.throwIfAborted();
      const peerPortraits = await Promise.all(
        observations.map((observation) =>
          drawing.drawPeer({
            manifest: this.manifest,
            state: snapshot.state,
            intent,
            observation,
            cycle,
            createdAt: startedAt,
            signal,
          }),
        ),
      );
      signal?.throwIfAborted();
      this.portraitRoutes.assertPeerPortraitOutputs(peerPortraits, observations, cycle);

      await this.reportProgress(cycle, "reflecting");
      signal?.throwIfAborted();
      const socialPortrait = await feedback.compose({
        manifest: this.manifest,
        state: snapshot.state,
        portraits: input.receivedPeerPortraits,
        sourceSelfPortrait: feedbackSourcePortrait,
        cycle,
        createdAt: startedAt,
        signal,
      });
      signal?.throwIfAborted();
      this.portraitRoutes.assertSocialPortraitOutput(
        socialPortrait,
        input.receivedPeerPortraits,
        feedbackSourcePortrait,
        cycle,
      );

      const reflection = await cognition.reflect({
        manifest: this.manifest,
        state: snapshot.state,
        intent,
        selfPortrait,
        socialPortrait,
        socialEvidence: socialPortrait?.socialEvidence,
        cycle,
        signal,
      });
      signal?.throwIfAborted();

      const selfConcept = await adaptation.adapt({
        manifest: this.manifest,
        state: snapshot.state,
        reflection,
        selfPortrait,
        socialPortrait,
        cycle,
        signal,
      });
      signal?.throwIfAborted();

      const completedAt = this.dependencies.clock.now();
      const nextRelationships = await relationships.adapt({
        manifest: this.manifest,
        state: snapshot.state,
        evidence: socialPortrait?.socialEvidence,
        cycle,
        signal,
      });
      signal?.throwIfAborted();

      const selfPortraitHistory = [
        ...(snapshot.state.selfPortraitHistory ?? []),
        ...(snapshot.state.currentSelfPortrait ? [snapshot.state.currentSelfPortrait] : []),
      ]
        .filter(
          (portrait, index, all) =>
            all.findIndex((candidate) => candidate.id === portrait.id) === index,
        )
        .slice(-MAX_SELF_PORTRAIT_HISTORY);

      const nextState = {
        ...snapshot.state,
        status: "idle" as const,
        cycle,
        selfConcept,
        relationships: nextRelationships,
        currentSelfPortrait: selfPortrait,
        selfPortraitHistory,
        // A social portrait is evidence for this cycle, not a timeless identity
        // attribute. Retaining it would both misstate a feedback-free cycle and
        // eventually outlive its source in the bounded self-portrait history.
        latestSocialPortrait: socialPortrait,
        // Keep the exact received drawings in the same durable commit as the
        // composite. Contribution metadata cannot reproduce their artwork after
        // a restart, and the runtime's pending cohort may already have advanced.
        latestSocialPeerPortraits: socialPortrait
          ? [...input.receivedPeerPortraits]
          : undefined,
        lastReflection: reflection,
        updatedAt: completedAt,
      };
      const nextSnapshot = { manifest: this.manifest, state: nextState };
      const reflectionMemory: MemoryEntry = {
        id: this.dependencies.ids.create([this.manifest.id, cycle, "reflection"]),
        individualId: this.manifest.id,
        cycle,
        kind: "reflection",
        content: reflection.memory,
        createdAt: completedAt,
        relatedIndividualIds: input.peerSelfPortraits.map((portrait) => portrait.artistId),
      };

      if (this.dependencies.committer) {
        signal?.throwIfAborted();
        await this.dependencies.committer.commit({
          snapshot: nextSnapshot,
          memories: [reflectionMemory],
          signal,
        });
      } else {
        // Compatibility path for in-memory/template adapters. Durable runtimes
        // should always supply a CycleCommitter.
        signal?.throwIfAborted();
        await memory.remember([reflectionMemory], signal);
        signal?.throwIfAborted();
        await repository.save(nextSnapshot, signal);
      }

      return {
        individualId: this.manifest.id,
        cycle,
        startedAt,
        completedAt,
        intent,
        selfPortrait,
        peerPortraits,
        socialPortrait,
        reflection,
        state: nextState,
      };
    } finally {
      await this.reportProgress(cycle, "idle");
    }
  }

  private async reportProgress(
    cycle: number,
    phase: "idle" | "observing" | "drawing" | "reflecting",
  ): Promise<void> {
    try {
      await this.dependencies.progress?.report({
        individualId: this.manifest.id,
        cycle,
        phase,
      });
    } catch {
      // A telemetry/display sink cannot be allowed to alter the identity cycle.
    }
  }

  private resolvePerceptionTuning(
    overrides: CycleInput["perceptionTuning"],
  ): Readonly<Record<string, number>> {
    const controls = new Map(this.manifest.perception.controls.map((control) => [control.id, control]));
    const tuning: Record<string, number> = Object.fromEntries(
      this.manifest.perception.controls.map((control) => [control.id, control.defaultValue]),
    );

    for (const [id, value] of Object.entries(overrides ?? {})) {
      const control = controls.get(id);
      if (!control) {
        throw new Error(`Unknown perception control "${id}" for "${this.manifest.id}".`);
      }
      if (!Number.isFinite(value) || value < control.min || value > control.max) {
        throw new Error(
          `Perception control "${id}" for "${this.manifest.id}" must be between ${control.min} and ${control.max}.`,
        );
      }
      tuning[id] = value;
    }

    return tuning;
  }
}
