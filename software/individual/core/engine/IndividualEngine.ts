import { createInitialState } from "../createInitialState";
import { defineIndividualManifest } from "../manifest";
import type {
  CycleInput,
  CycleRecord,
  IndividualManifest,
  IndividualSnapshot,
  MemoryEntry,
} from "../model";
import type { IndividualRepository, MemoryStore } from "../persistence/contracts";
import type {
  AdaptationSystem,
  Clock,
  CognitionSystem,
  DrawingSystem,
  FeedbackCompositor,
  IdGenerator,
  PerceptionSystem,
} from "../systems/contracts";

export interface IndividualEngineDependencies {
  readonly cognition: CognitionSystem;
  readonly perception: PerceptionSystem;
  readonly drawing: DrawingSystem;
  readonly feedback: FeedbackCompositor;
  readonly adaptation: AdaptationSystem;
  readonly repository: IndividualRepository;
  readonly memory: MemoryStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class IndividualEngine {
  readonly manifest: IndividualManifest;

  constructor(
    manifest: IndividualManifest,
    private readonly dependencies: IndividualEngineDependencies,
  ) {
    this.manifest = defineIndividualManifest(manifest);
  }

  async getSnapshot(): Promise<IndividualSnapshot> {
    const existing = await this.dependencies.repository.load(this.manifest.id);
    return existing ?? {
      manifest: this.manifest,
      state: createInitialState(this.manifest, this.dependencies.clock.now()),
    };
  }

  async runCycle(input: CycleInput): Promise<CycleRecord> {
    const { cognition, perception, drawing, feedback, adaptation, memory, repository } =
      this.dependencies;
    const snapshot = await this.getSnapshot();

    if (snapshot.state.status === "paused") {
      throw new Error(`Individual "${this.manifest.id}" is paused.`);
    }

    this.assertPeerPortraits(input.peerSelfPortraits);
    this.assertReceivedPortraits(input.receivedPeerPortraits);

    const cycle = snapshot.state.cycle + 1;
    const startedAt = this.dependencies.clock.now();
    const memories = await memory.recall({ individualId: this.manifest.id, limit: 24 });
    const intent = await cognition.formIntent({
      manifest: this.manifest,
      state: snapshot.state,
      memories,
      cycle,
    });

    const selfPortrait = await drawing.drawSelf({
      manifest: this.manifest,
      state: snapshot.state,
      intent,
      cycle,
      createdAt: startedAt,
    });

    const peerPortraits = await Promise.all(
      input.peerSelfPortraits.map(async (portrait) => {
        const observation = await perception.observe({
          manifest: this.manifest,
          state: snapshot.state,
          portrait,
          cycle,
        });

        return drawing.drawPeer({
          manifest: this.manifest,
          state: snapshot.state,
          intent,
          observation,
          cycle,
          createdAt: startedAt,
        });
      }),
    );

    const socialPortrait = await feedback.compose({
      manifest: this.manifest,
      state: snapshot.state,
      portraits: input.receivedPeerPortraits,
      cycle,
      createdAt: startedAt,
    });

    const reflection = await cognition.reflect({
      manifest: this.manifest,
      state: snapshot.state,
      intent,
      selfPortrait,
      socialPortrait,
      cycle,
    });

    const selfConcept = await adaptation.adapt({
      manifest: this.manifest,
      state: snapshot.state,
      reflection,
      selfPortrait,
      socialPortrait,
      cycle,
    });

    const completedAt = this.dependencies.clock.now();
    const nextState = {
      ...snapshot.state,
      status: "idle" as const,
      cycle,
      selfConcept,
      currentSelfPortrait: selfPortrait,
      latestSocialPortrait: socialPortrait ?? snapshot.state.latestSocialPortrait,
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

    await memory.remember([reflectionMemory]);
    await repository.save(nextSnapshot);

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
  }

  private assertPeerPortraits(portraits: CycleInput["peerSelfPortraits"]): void {
    for (const portrait of portraits) {
      if (portrait.role !== "self") {
        throw new Error(`Peer canvas "${portrait.id}" must be a self-portrait.`);
      }
      if (portrait.subjectId === this.manifest.id) {
        throw new Error("An Individual cannot be included among its own peer canvases.");
      }
    }
  }

  private assertReceivedPortraits(portraits: CycleInput["receivedPeerPortraits"]): void {
    for (const portrait of portraits) {
      if (portrait.role !== "peer" || portrait.subjectId !== this.manifest.id) {
        throw new Error(
          `Received portrait "${portrait.id}" must be a peer portrait of "${this.manifest.id}".`,
        );
      }
    }
  }
}
