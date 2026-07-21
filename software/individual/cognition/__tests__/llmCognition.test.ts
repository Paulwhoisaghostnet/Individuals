import { describe, expect, it } from "vitest";
import { LlmCognitionSystem } from "../llmCognition";
import type { LlmClient, LlmRequestOptions } from "../llmClient";
import { createTemplateManifest } from "../../core/template/manifest";
import { createInitialState } from "../../core/createInitialState";

class MockLlmClient implements LlmClient {
  constructor(
    private readonly responseGenerator: (options: LlmRequestOptions) => unknown,
  ) {}

  async generateText(options: LlmRequestOptions): Promise<string> {
    const res = this.responseGenerator(options);
    if (typeof res === "string") return res;
    return JSON.stringify(res);
  }

  async generateJson<T>(
    options: LlmRequestOptions & { validator?: (data: unknown) => data is T },
  ): Promise<T> {
    const res = this.responseGenerator(options);
    if (res instanceof Error) throw res;
    if (options.validator && !options.validator(res)) {
      throw new Error("Invalid mock response schema");
    }
    return res as T;
  }
}

describe("LlmCognitionSystem", () => {
  it("uses valid LLM structured output when provider succeeds", async () => {
    const mockClient = new MockLlmClient(() => ({
      statement: "LLM generated intent",
      desiredQualities: ["openness"],
      visualInstructions: ["draw vertical spine"],
      bodilyInstructions: ["keep shoulder width"],
    }));

    const cognition = new LlmCognitionSystem({ client: mockClient });
    const manifest = createTemplateManifest();
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");

    const intent = await cognition.formIntent({
      manifest,
      state,
      memories: [],
      cycle: 1,
    });

    expect(intent.statement).toBe("LLM generated intent");
    expect(intent.desiredQualities).toEqual(["openness"]);
  });

  it("gracefully falls back to procedural cognition on provider error or invalid output", async () => {
    const mockFailingClient = new MockLlmClient(() => {
      throw new Error("Provider API timeout");
    });

    const cognition = new LlmCognitionSystem({ client: mockFailingClient });
    const manifest = createTemplateManifest();
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");

    const intent = await cognition.formIntent({
      manifest,
      state,
      memories: [],
      cycle: 1,
    });

    // Procedural fallback generates structured intent from manifest defaults
    expect(intent.statement).toBeDefined();
    expect(intent.bodilyInstructions.length).toBeGreaterThan(0);

    const reflection = await cognition.reflect({
      manifest,
      state,
      intent,
      selfPortrait: {
        id: "self-1",
        cycle: 1,
        artistId: "iris",
        subjectId: "iris",
        role: "self",
        createdAt: "2026-01-01T00:00:00Z",
        artwork: { format: "svg", width: 800, height: 1000, content: "<svg/>" },
        sourcePortraitIds: [],
      },
      cycle: 1,
    });

    expect(reflection.summary).toBeDefined();
    expect(reflection.physicalAssessment.similarityDelta).toBeDefined();
  });
});
