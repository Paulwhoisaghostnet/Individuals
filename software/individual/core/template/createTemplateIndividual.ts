import { IndividualEngine } from "../engine/IndividualEngine";
import type { IndividualManifest } from "../model";
import type { IndividualRepository, MemoryStore } from "../persistence/contracts";
import type { CognitionSystem } from "../systems/contracts";
import { InMemoryIndividualRepository, InMemoryMemoryStore } from "../persistence/inMemory";
import { createTemplateManifest } from "./manifest";
import {
  StableIdGenerator,
  SystemClock,
  TemplateAdaptationSystem,
  TemplateCognitionSystem,
  TemplateDrawingSystem,
  TemplateFeedbackCompositor,
  TemplatePerceptionSystem,
} from "./systems";

export interface CreateTemplateIndividualOptions {
  readonly manifest?: IndividualManifest;
  readonly repository?: IndividualRepository;
  readonly memory?: MemoryStore;
  readonly cognition?: CognitionSystem;
}

export const createTemplateIndividual = (
  options: CreateTemplateIndividualOptions = {},
): IndividualEngine => {
  const ids = new StableIdGenerator();

  return new IndividualEngine(options.manifest ?? createTemplateManifest(), {
    cognition: options.cognition ?? new TemplateCognitionSystem(),
    perception: new TemplatePerceptionSystem(),
    drawing: new TemplateDrawingSystem(ids),
    feedback: new TemplateFeedbackCompositor(ids),
    adaptation: new TemplateAdaptationSystem(),
    repository: options.repository ?? new InMemoryIndividualRepository(),
    memory: options.memory ?? new InMemoryMemoryStore(),
    clock: new SystemClock(),
    ids,
  });
};
