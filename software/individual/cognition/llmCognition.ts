import type {
  CycleIntent,
  IdentityReflection,
  SignedBodyAdjustment,
} from "../core/model";
import type { CognitionSystem } from "../core/systems/contracts";

import {
  classifyLlmFailure,
  FetchLlmClient,
  type LlmClient,
  type LlmFailureCategory,
} from "./llmClient";
import { ProceduralCognitionSystem } from "./proceduralCognition";
import {
  INTENT_SYSTEM_PROMPT,
  REFLECTION_SYSTEM_PROMPT,
  buildIntentUserPrompt,
  buildReflectionUserPrompt,
  isValidIntent,
  isValidReflection,
} from "./prompts";

// Providers frequently quote numeric JSON values ("0.02" instead of 0.02),
// which the strict validators reject. Repair coerces numeric strings back to
// numbers for known numeric fields only, so free-text fields stay untouched.
const NUMERIC_FIELD_KEYS = new Set([
  "magnitude",
  "direction",
  "similarityDelta",
  "selfIdealDistance",
  "predictedIdealDistance",
  "socialIdealDistance",
  "selfSocialDistance",
]);

const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;

export const repairNumericFields = (data: unknown): unknown => {
  if (Array.isArray(data)) {
    return data.map((item) => repairNumericFields(item));
  }
  if (!data || typeof data !== "object") {
    return data;
  }
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([key, value]) => {
      if (
        NUMERIC_FIELD_KEYS.has(key) &&
        typeof value === "string" &&
        NUMERIC_STRING.test(value.trim())
      ) {
        return [key, Number(value.trim())];
      }
      return [key, repairNumericFields(value)];
    }),
  );
};

const cleanText = (value: string, maximum: number): string =>
  value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);

const cleanList = (values: readonly string[], maximumItems = 32): readonly string[] =>
  values.slice(0, maximumItems).map((value) => cleanText(value, 600)).filter(Boolean);

const selectCausalBodyAdjustments = (
  provider: readonly SignedBodyAdjustment[],
  supported: readonly SignedBodyAdjustment[],
): readonly SignedBodyAdjustment[] => {
  const supportedByDimension = new Map(
    supported.map((adjustment) => [adjustment.dimension, adjustment]),
  );
  return provider.flatMap((candidate) => {
    const boundary = supportedByDimension.get(candidate.dimension);
    if (
      !boundary ||
      candidate.direction !== boundary.direction ||
      candidate.basis !== boundary.basis
    ) {
      return [];
    }
    return [
      {
        ...boundary,
        magnitude: Math.min(boundary.magnitude, candidate.magnitude),
      },
    ];
  });
};

export interface LlmCognitionSystemOptions {
  readonly client?: LlmClient;
  readonly fallbackSystem?: CognitionSystem;
  readonly onProviderFailure?: (event: LlmCognitionFailureEvent) => void | Promise<void>;
}

export interface LlmCognitionFailureEvent {
  readonly operation: "formIntent" | "reflect";
  readonly individualId: string;
  readonly cycle: number;
  readonly error: {
    readonly category: LlmFailureCategory;
    readonly retryable: boolean;
  };
}

export class LlmCognitionSystem implements CognitionSystem {
  private readonly client: LlmClient;
  private readonly fallback: CognitionSystem;
  private readonly causal = new ProceduralCognitionSystem();
  private readonly onProviderFailure?: LlmCognitionSystemOptions["onProviderFailure"];

  constructor(options: LlmCognitionSystemOptions = {}) {
    this.client = options.client ?? new FetchLlmClient();
    this.fallback = options.fallbackSystem ?? new ProceduralCognitionSystem();
    this.onProviderFailure = options.onProviderFailure;
  }

  private async reportFailure(
    operation: LlmCognitionFailureEvent["operation"],
    input: { readonly manifest: { readonly id: string }; readonly cycle: number },
    error: unknown,
  ): Promise<void> {
    if (!this.onProviderFailure) return;
    try {
      await this.onProviderFailure({
        operation,
        individualId: input.manifest.id,
        cycle: input.cycle,
        error: classifyLlmFailure(error),
      });
    } catch {
      // Observability must never prevent deterministic fallback cognition.
    }
  }

  async formIntent(input: Parameters<CognitionSystem["formIntent"]>[0]): Promise<CycleIntent> {
    const causalIntent = await this.causal.formIntent(input);
    try {
      const intent = await this.client.generateJson<CycleIntent>({
        systemPrompt: INTENT_SYSTEM_PROMPT,
        userPrompt: buildIntentUserPrompt(input),
        validator: isValidIntent,
        repair: repairNumericFields,
        timeoutMs: 10_000,
        signal: input.signal,
      });
      return {
        statement: cleanText(intent.statement, 1_200),
        desiredQualities: cleanList(intent.desiredQualities),
        visualInstructions: cleanList(intent.visualInstructions),
        bodilyInstructions: cleanList(intent.bodilyInstructions),
        // Provider prose may inform private deliberation, but executable body
        // geometry comes only from deterministic identity state and evidence.
        bodyAdjustments: selectCausalBodyAdjustments(
          intent.bodyAdjustments ?? [],
          causalIntent.bodyAdjustments ?? [],
        ),
      };
    } catch (error) {
      input.signal?.throwIfAborted();
      await this.reportFailure("formIntent", input, error);
      const fallback = await this.fallback.formIntent(input);
      return {
        ...fallback,
        bodyAdjustments: causalIntent.bodyAdjustments ?? [],
      };
    }
  }

  async reflect(input: Parameters<CognitionSystem["reflect"]>[0]): Promise<IdentityReflection> {
    const causalReflection = await this.causal.reflect(input);
    try {
      const reflection = await this.client.generateJson<IdentityReflection>({
        systemPrompt: REFLECTION_SYSTEM_PROMPT,
        userPrompt: buildReflectionUserPrompt(input),
        validator: isValidReflection,
        repair: repairNumericFields,
        timeoutMs: 10_000,
        signal: input.signal,
      });
      const evidence = input.socialEvidence ?? input.socialPortrait?.socialEvidence;
      const knownPeerIds = new Set([
        ...Object.keys(input.manifest.identity.socialDisposition.trustByPeer),
        ...Object.keys(input.state.relationships),
      ]);
      const contributingPeerIds = new Set(
        (evidence?.contributions ?? []).map((contribution) => contribution.artistId),
      );
      const peerSignals = Object.fromEntries(
        Object.entries(reflection.perceivedPeerSignals ?? {})
          .filter(
            ([peerId]) => knownPeerIds.has(peerId) && contributingPeerIds.has(peerId),
          )
          .slice(0, 32)
          .map(([peerId, signals]) => [peerId, cleanList(signals)]),
      );
      const {
        relationshipUpdates: _ignoredRelationshipUpdates,
        publicFragment: _ignoredPublicFragment,
        physicalAssessment: _ignoredPhysicalAssessment,
        ...privateReflection
      } = reflection;
      return {
        ...privateReflection,
        summary: cleanText(reflection.summary, 2_000),
        tensions: cleanList(reflection.tensions),
        nextIntention: cleanText(reflection.nextIntention, 1_200),
        memory: cleanText(reflection.memory, 2_000),
        intendedSignals: cleanList(reflection.intendedSignals ?? []),
        perceivedPeerSignals: peerSignals,
        recurringPatterns: cleanList(reflection.recurringPatterns ?? []),
        acceptedFeedback: cleanList(reflection.acceptedFeedback ?? []),
        rejectedFeedback: cleanList(reflection.rejectedFeedback ?? []),
        unresolvedQuestions: cleanList(reflection.unresolvedQuestions ?? []),
        // Downstream adaptation may consume these fields, so they are rebuilt
        // from normalized causal evidence. Public projection independently
        // derives its own wording and never trusts reflection prose.
        publicFragment: causalReflection.publicFragment,
        physicalAssessment: causalReflection.physicalAssessment,
      };
    } catch (error) {
      input.signal?.throwIfAborted();
      await this.reportFailure("reflect", input, error);
      const fallback = await this.fallback.reflect(input);
      return {
        ...fallback,
        publicFragment: causalReflection.publicFragment,
        physicalAssessment: causalReflection.physicalAssessment,
        relationshipUpdates: undefined,
      };
    }
  }
}
