import { IndividualEngine } from "../core/engine/IndividualEngine";
import type { CycleRecord, IndividualManifest, Portrait } from "../core/model";
import type { IndividualRepository, MemoryStore } from "../core/persistence/contracts";
import { InMemoryIndividualRepository, InMemoryMemoryStore } from "../core/persistence/inMemory";
import { StableIdGenerator, SystemClock } from "../core/systemUtilities";
import { EvidenceBodyAdaptationSystem } from "../cognition/bodyAdaptation";
import { identityPackages } from "../identity-packages";
import { ProceduralCognitionSystem } from "../cognition/proceduralCognition";
import { ProceduralPerceptionSystem } from "../perception/proceduralPerception";
import { GenerativeDrawingSystem } from "../drawing/generativeDrawing";
import { ProceduralFeedbackCompositor } from "../social-feedback/proceduralCompositor";
import { DeterministicRelationshipAdaptationSystem } from "../social-feedback/relationshipAdaptation";

export interface SocietyStepResult {
  readonly cycle: number;
  readonly records: Readonly<Record<string, CycleRecord>>;
  readonly selfPortraits: readonly Portrait[];
  readonly peerPortraits: readonly Portrait[];
  readonly socialPortraits: readonly Portrait[];
}

export class SocietySimulation {
  private readonly engines = new Map<string, IndividualEngine>();
  private readonly repository: IndividualRepository;
  private readonly memory: MemoryStore;
  private currentCycle = 0;
  private latestSelfPortraits: Portrait[] = [];
  private latestPeerPortraitsBySubject = new Map<string, Portrait[]>();

  constructor(
    manifests: readonly IndividualManifest[] = identityPackages,
    repository?: IndividualRepository,
    memory?: MemoryStore,
  ) {
    this.repository = repository ?? new InMemoryIndividualRepository();
    this.memory = memory ?? new InMemoryMemoryStore();

    const ids = new StableIdGenerator();
    const clock = new SystemClock();

    for (const manifest of manifests) {
      const engine = new IndividualEngine(manifest, {
        cognition: new ProceduralCognitionSystem(),
        perception: new ProceduralPerceptionSystem(),
        drawing: new GenerativeDrawingSystem(ids),
        feedback: new ProceduralFeedbackCompositor(ids),
        adaptation: new EvidenceBodyAdaptationSystem(),
        relationships: new DeterministicRelationshipAdaptationSystem(),
        repository: this.repository,
        memory: this.memory,
        clock,
        ids,
        allowedPeerIds: manifests
          .filter((candidate) => candidate.id !== manifest.id)
          .map((candidate) => candidate.id),
      });
      this.engines.set(manifest.id, engine);
    }
  }

  async step(): Promise<SocietyStepResult> {
    this.currentCycle += 1;
    const cycleRecords: Record<string, CycleRecord> = {};
    const newSelfPortraits: Portrait[] = [];
    const newPeerPortraits: Portrait[] = [];
    const newSocialPortraits: Portrait[] = [];

    // Run cycle for each Individual
    for (const [id, engine] of this.engines.entries()) {
      // Peers are all other Individuals
      const peerSelfPortraits = this.latestSelfPortraits.filter(
        (portrait) => portrait.subjectId !== id,
      );

      // Received peer portraits drawn by peers of this Individual
      const receivedPeerPortraits = this.latestPeerPortraitsBySubject.get(id) ?? [];

      const record = await engine.runCycle({
        peerSelfPortraits,
        receivedPeerPortraits,
      });

      cycleRecords[id] = record;
      newSelfPortraits.push(record.selfPortrait);
      newPeerPortraits.push(...record.peerPortraits);
      if (record.socialPortrait) {
        newSocialPortraits.push(record.socialPortrait);
      }
    }

    // Update latest peer portraits grouped by subject for next cycle's feedback
    const newPeerMap = new Map<string, Portrait[]>();
    for (const portrait of newPeerPortraits) {
      const list = newPeerMap.get(portrait.subjectId) ?? [];
      list.push(portrait);
      newPeerMap.set(portrait.subjectId, list);
    }

    this.latestSelfPortraits = newSelfPortraits;
    this.latestPeerPortraitsBySubject = newPeerMap;

    return {
      cycle: this.currentCycle,
      records: cycleRecords,
      selfPortraits: newSelfPortraits,
      peerPortraits: newPeerPortraits,
      socialPortraits: newSocialPortraits,
    };
  }

  async run(cycleCount: number): Promise<readonly SocietyStepResult[]> {
    const results: SocietyStepResult[] = [];
    for (let index = 0; index < cycleCount; index += 1) {
      const stepResult = await this.step();
      results.push(stepResult);
    }
    return results;
  }
}
