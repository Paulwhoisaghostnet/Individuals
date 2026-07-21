import { describe, expect, it } from "vitest";
import { LlmCognitionSystem } from "../llmCognition";
import type { LlmClient, LlmRequestOptions } from "../llmClient";
import { createTemplateManifest } from "../../core/template/manifest";
import { createInitialState } from "../../core/createInitialState";
import { LlmProviderError } from "../llmClient";
import { defaultRenderingDescriptor } from "../../drawing/figureDescriptor";
import type {
  ArtworkDescriptor,
  SignedBodyAdjustment,
  SocialFeedbackEvidence,
} from "../../core/model";
import { GenerativeDrawingSystem } from "../../drawing/generativeDrawing";
import { StableIdGenerator } from "../../core/systemUtilities";

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
      bodyAdjustments: [],
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

  it("lets the model select only bounded evidence-supported geometry for the next portrait", async () => {
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const baseState = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const state = {
      ...baseState,
      selfConcept: {
        ...baseState.selfConcept,
        nextBodyAdjustments: [
          {
            dimension: "shoulderWidth" as const,
            direction: 1 as const,
            magnitude: 0.03,
            basis: "ideal" as const,
          },
          {
            dimension: "openness" as const,
            direction: 1 as const,
            magnitude: 0.04,
            basis: "ideal" as const,
          },
        ],
      },
    };
    const drawWith = async (bodyAdjustments: readonly SignedBodyAdjustment[]) => {
      const cognition = new LlmCognitionSystem({
        client: new MockLlmClient(() => ({
          statement: "private model deliberation",
          desiredQualities: [],
          visualInstructions: [],
          bodilyInstructions: [],
          bodyAdjustments,
        })),
      });
      const intent = await cognition.formIntent({ manifest, state, memories: [], cycle: 1 });
      return new GenerativeDrawingSystem(new StableIdGenerator()).drawSelf({
        manifest,
        state,
        intent,
        cycle: 1,
        createdAt: "2026-01-01T00:00:01Z",
      });
    };

    const shoulderChoice = await drawWith([
      { dimension: "shoulderWidth", direction: 1, magnitude: 0.02, basis: "ideal" },
      // Wrong direction is valid JSON but unsupported by canonical pressure.
      { dimension: "openness", direction: -1, magnitude: 0.04, basis: "ideal" },
    ]);
    const opennessChoice = await drawWith([
      { dimension: "openness", direction: 1, magnitude: 0.02, basis: "ideal" },
    ]);

    expect(shoulderChoice.descriptor?.figure.shoulderWidth).not.toBe(
      opennessChoice.descriptor?.figure.shoulderWidth,
    );
    expect(shoulderChoice.descriptor?.figure.openness).not.toBe(
      opennessChoice.descriptor?.figure.openness,
    );
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

  it("reports a sanitized provider failure before falling back", async () => {
    const events: unknown[] = [];
    const cognition = new LlmCognitionSystem({
      client: new MockLlmClient(() => {
        throw new LlmProviderError("rate-limit", true);
      }),
      onProviderFailure: (event) => {
        events.push(event);
      },
    });
    const manifest = createTemplateManifest({ id: "iris" });
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");

    await cognition.formIntent({ manifest, state, memories: [], cycle: 7 });

    expect(events).toEqual([
      {
        operation: "formIntent",
        individualId: "iris",
        cycle: 7,
        error: { category: "rate-limit", retryable: true },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("prompt");
    expect(JSON.stringify(events)).not.toContain("api");
  });

  it("preserves every non-negotiable feature in otherwise valid model output", async () => {
    const mockClient = new MockLlmClient(() => ({
      summary: "A partial social return",
      tensions: ["alignment remains provisional"],
      nextIntention: "Open the hands",
      memory: "Peers returned a narrower figure.",
      physicalAssessment: {
        similarityDelta: 0.02,
        retainedFeatures: ["model-selected detail"],
        perceivedDifferences: ["narrow shoulders"],
        nextBodilyAdjustment: "Widen shoulders",
        nextBodyAdjustments: [],
        geometry: {
          selfIdealDistance: 0.2,
          predictedIdealDistance: 0.19,
        },
      },
    }));
    const cognition = new LlmCognitionSystem({ client: mockClient });
    const manifest = createTemplateManifest();
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const selfPortrait = {
      id: "self-1",
      cycle: 1,
      artistId: manifest.id,
      subjectId: manifest.id,
      role: "self" as const,
      createdAt: "2026-01-01T00:00:00Z",
      artwork: { format: "svg" as const, width: 800, height: 1000, content: "<svg/>" },
      sourcePortraitIds: [],
    };
    const reflection = await cognition.reflect({
      manifest,
      state,
      intent: {
        statement: "Intent",
        desiredQualities: [],
        visualInstructions: [],
        bodilyInstructions: [],
      },
      selfPortrait,
      cycle: 1,
    });

    expect(reflection.physicalAssessment.retainedFeatures).toEqual(
      expect.arrayContaining([...manifest.identity.idealPhysicalForm.nonNegotiableFeatures]),
    );
  });

  it("keeps provider peer signals inside the known, evidenced cohort", async () => {
    const manifest = createTemplateManifest();
    const figure = manifest.identity.idealPhysicalForm.visualSpecification!.figure;
    const descriptor: ArtworkDescriptor = {
      schemaVersion: 1,
      figure,
      rendering: defaultRenderingDescriptor(),
      features: [],
      omittedFeatures: [],
      styleName: "test",
      primitives: ["line"],
      confidence: 0.8,
    };
    const evidence: SocialFeedbackEvidence = {
      subjectId: manifest.id,
      sourceSelfPortraitId: "self-1",
      contributions: [
        {
          portraitId: "peer-a--2--peer--individual-template",
          artistId: "peer-a",
          descriptor,
          weight: 0.8,
        },
      ],
      consensus: descriptor,
      comparisonToSelf: [],
      disagreements: [],
      confidence: 0.8,
    };
    const client = new MockLlmClient(() => ({
      summary: "Evidence is partial.",
      tensions: [],
      nextIntention: "Continue.",
      memory: "One bounded return.",
      perceivedPeerSignals: {
        "peer-a": ["supported signal"],
        intruder: ["invented signal"],
      },
      physicalAssessment: {
        similarityDelta: 0,
        retainedFeatures: [],
        perceivedDifferences: [],
        nextBodilyAdjustment: "Hold.",
        nextBodyAdjustments: [],
        geometry: { selfIdealDistance: 0, predictedIdealDistance: 0 },
      },
    }));
    const cognition = new LlmCognitionSystem({ client });
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const reflection = await cognition.reflect({
      manifest,
      state,
      intent: {
        statement: "Intent",
        desiredQualities: [],
        visualInstructions: [],
        bodilyInstructions: [],
      },
      selfPortrait: {
        id: "self-1",
        cycle: 1,
        artistId: manifest.id,
        subjectId: manifest.id,
        role: "self",
        createdAt: "2026-01-01T00:00:00Z",
        artwork: { format: "svg", width: 800, height: 1000, content: "<svg/>" },
        descriptor,
        sourcePortraitIds: [],
      },
      socialEvidence: evidence,
      cycle: 2,
    });

    expect(reflection.perceivedPeerSignals).toEqual({ "peer-a": ["supported signal"] });
  });
});
