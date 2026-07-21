import type { CycleIntent, IdentityReflection } from "../core/model";
import type { CognitionSystem } from "../core/systems/contracts";

import { FetchLlmClient, type LlmClient } from "./llmClient";
import { ProceduralCognitionSystem } from "./proceduralCognition";
import {
  INTENT_SYSTEM_PROMPT,
  REFLECTION_SYSTEM_PROMPT,
  buildIntentUserPrompt,
  buildReflectionUserPrompt,
  isValidIntent,
  isValidReflection,
} from "./prompts";

export interface LlmCognitionSystemOptions {
  readonly client?: LlmClient;
  readonly fallbackSystem?: CognitionSystem;
}

export class LlmCognitionSystem implements CognitionSystem {
  private readonly client: LlmClient;
  private readonly fallback: CognitionSystem;

  constructor(options: LlmCognitionSystemOptions = {}) {
    this.client = options.client ?? new FetchLlmClient();
    this.fallback = options.fallbackSystem ?? new ProceduralCognitionSystem();
  }

  async formIntent(input: Parameters<CognitionSystem["formIntent"]>[0]): Promise<CycleIntent> {
    try {
      return await this.client.generateJson<CycleIntent>({
        systemPrompt: INTENT_SYSTEM_PROMPT,
        userPrompt: buildIntentUserPrompt(input),
        validator: isValidIntent,
        timeoutMs: 10_000,
      });
    } catch {
      // Graceful fallback to procedural cognition on provider error, timeout, or refusal
      return this.fallback.formIntent(input);
    }
  }

  async reflect(input: Parameters<CognitionSystem["reflect"]>[0]): Promise<IdentityReflection> {
    try {
      return await this.client.generateJson<IdentityReflection>({
        systemPrompt: REFLECTION_SYSTEM_PROMPT,
        userPrompt: buildReflectionUserPrompt(input),
        validator: isValidReflection,
        timeoutMs: 10_000,
      });
    } catch {
      // Graceful fallback to procedural cognition on provider error, timeout, or refusal
      return this.fallback.reflect(input);
    }
  }
}
