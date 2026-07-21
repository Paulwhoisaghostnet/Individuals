import { ProceduralCognitionSystem } from "../../cognition/proceduralCognition";
import { EvidenceBodyAdaptationSystem } from "../../cognition/bodyAdaptation";
import { IndividualEngine } from "../../core/engine/IndividualEngine";
import type { IndividualManifest } from "../../core/model";
import type {
  CycleCommitter,
  IndividualRepository,
  MemoryStore,
} from "../../core/persistence/contracts";
import { InMemoryIndividualRepository, InMemoryMemoryStore } from "../../core/persistence/inMemory";
import type {
  CognitionSystem,
  CycleProgressSink,
  FeedbackCompositor,
  PerceptionSystem,
  RelationshipAdaptationSystem,
} from "../../core/systems/contracts";
import { createTemplateManifest } from "../../core/template/manifest";
import { StableIdGenerator, SystemClock } from "../../core/systemUtilities";
import { GenerativeDrawingSystem } from "../../drawing/generativeDrawing";
import { ProceduralPerceptionSystem } from "../../perception/proceduralPerception";
import { DeterministicRelationshipAdaptationSystem } from "../../social-feedback/relationshipAdaptation";
import { ProceduralFeedbackCompositor } from "../../social-feedback/proceduralCompositor";

export interface CreateTemplateIndividualOptions {
  readonly manifest?: IndividualManifest;
  readonly repository?: IndividualRepository;
  readonly memory?: MemoryStore;
  readonly cognition?: CognitionSystem;
  readonly perception?: PerceptionSystem;
  readonly feedback?: FeedbackCompositor;
  readonly committer?: CycleCommitter;
  readonly progress?: CycleProgressSink;
  readonly relationships?: RelationshipAdaptationSystem;
  readonly allowedPeerIds?: readonly string[];
}

/** Cross-domain assembly for tests and simulation; intentionally outside core. */
export const createTemplateIndividual = (
  options: CreateTemplateIndividualOptions = {},
): IndividualEngine => {
  const ids = new StableIdGenerator();
  const manifest = options.manifest ?? createTemplateManifest();
  return new IndividualEngine(manifest, {
    cognition: options.cognition ?? new ProceduralCognitionSystem(),
    perception: options.perception ?? new ProceduralPerceptionSystem(),
    drawing: new GenerativeDrawingSystem(ids),
    feedback: options.feedback ?? new ProceduralFeedbackCompositor(ids),
    adaptation: new EvidenceBodyAdaptationSystem(),
    relationships:
      options.relationships ?? new DeterministicRelationshipAdaptationSystem(),
    repository: options.repository ?? new InMemoryIndividualRepository(),
    memory: options.memory ?? new InMemoryMemoryStore(),
    committer: options.committer,
    progress: options.progress,
    clock: new SystemClock(),
    ids,
    allowedPeerIds: options.allowedPeerIds ?? ["peer-a"],
  });
};
