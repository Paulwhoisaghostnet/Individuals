import { LlmCognitionSystem } from "../cognition/llmCognition";
import { ProceduralCognitionSystem } from "../cognition/proceduralCognition";
import { IndividualEngine } from "../core/engine/IndividualEngine";
import type { IndividualManifest } from "../core/model";
import type { CycleCommitter, IndividualRepository, MemoryStore } from "../core/persistence/contracts";
import type { CycleProgressSink } from "../core/systems/contracts";
import type { CognitionSystem } from "../core/systems/contracts";
import { StableIdGenerator } from "../core/systemUtilities";
import { EvidenceBodyAdaptationSystem } from "../cognition/bodyAdaptation";
import { GenerativeDrawingSystem } from "../drawing/generativeDrawing";
import { ProceduralPerceptionSystem } from "../perception/proceduralPerception";
import { ProceduralFeedbackCompositor } from "../social-feedback/proceduralCompositor";
import { DeterministicRelationshipAdaptationSystem } from "../social-feedback/relationshipAdaptation";
import type { HealthMonitor } from "../observability/healthMonitor";
import type { RuntimeClock } from "./scheduler";

export interface RuntimeEngineFactoryContext {
  readonly repository: IndividualRepository;
  readonly memory: MemoryStore;
  readonly healthMonitor: HealthMonitor;
  readonly clock: RuntimeClock;
  readonly committer?: CycleCommitter;
  readonly progress: CycleProgressSink;
  readonly allowedPeerIds: readonly string[];
}

export type RuntimeEngineFactory = (
  manifest: IndividualManifest,
  context: RuntimeEngineFactoryContext,
) => IndividualEngine;

export interface DefaultEngineFactoryOptions {
  readonly onProviderFailure: (input: {
    readonly individualId: string;
    readonly cycle: number;
    readonly operation: "form_intent" | "reflect";
    readonly provider: string;
    readonly error: string;
    readonly category: string;
    readonly retryable: boolean;
  }) => void;
  readonly providerConfigured?: boolean;
}

export const isLlmProviderConfigured = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean =>
  Boolean(environment.LLM_API_KEY?.trim() || environment.LLM_API_KEY_FILE?.trim());

export const createDefaultEngineFactory = (
  options: DefaultEngineFactoryOptions,
): RuntimeEngineFactory => (manifest, context) => {
  const ids = new StableIdGenerator();
  const providerConfigured = options.providerConfigured ?? isLlmProviderConfigured();
  let cognition: CognitionSystem = new ProceduralCognitionSystem();
  if (providerConfigured) {
    try {
      cognition = new LlmCognitionSystem({
        onProviderFailure: (event) => {
          options.onProviderFailure({
            individualId: event.individualId,
            cycle: event.cycle,
            operation: event.operation === "formIntent" ? "form_intent" : "reflect",
            provider: "configured-provider",
            error: event.error.category,
            category: event.error.category,
            retryable: event.error.retryable,
          });
        },
      });
    } catch {
      // Constructor errors can include secret-file paths. Report only a fixed
      // category and keep the installation alive on deterministic cognition.
      try {
        options.onProviderFailure({
          individualId: manifest.id,
          cycle: 0,
          operation: "form_intent",
          provider: "configured-provider",
          error: "provider_configuration_invalid",
          category: "configuration",
          retryable: false,
        });
      } catch {
        // Observability remains subordinate to deterministic availability.
      }
    }
  }
  return new IndividualEngine(manifest, {
    cognition,
    perception: new ProceduralPerceptionSystem(),
    drawing: new GenerativeDrawingSystem(ids),
    feedback: new ProceduralFeedbackCompositor(ids),
    relationships: new DeterministicRelationshipAdaptationSystem(),
    adaptation: new EvidenceBodyAdaptationSystem(),
    repository: context.repository,
    memory: context.memory,
    clock: { now: () => context.clock.now().toISOString() },
    ids,
    committer: context.committer,
    progress: context.progress,
    allowedPeerIds: context.allowedPeerIds,
  });
};
