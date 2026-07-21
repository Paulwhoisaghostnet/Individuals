import { describe, expect, it } from "vitest";

import { createInitialState } from "../../core/createInitialState";
import type { ArtworkDescriptor, SocialFeedbackEvidence } from "../../core/model";
import { createTemplateManifest } from "../../core/template/manifest";
import { defaultRenderingDescriptor } from "../../drawing/figureDescriptor";
import { DeterministicRelationshipAdaptationSystem } from "../relationshipAdaptation";

const manifest = createTemplateManifest();
const descriptor: ArtworkDescriptor = {
  schemaVersion: 1,
  figure: manifest.identity.idealPhysicalForm.visualSpecification!.figure,
  rendering: defaultRenderingDescriptor(),
  features: [],
  omittedFeatures: ["left hand"],
  styleName: "peer study",
  primitives: ["line"],
  confidence: 0.8,
};
const evidence: SocialFeedbackEvidence = {
  subjectId: manifest.id,
  sourceSelfPortraitId: "individual-template--1--self",
  contributions: [
    {
      portraitId: "peer-a--2--peer--individual-template",
      artistId: "peer-a",
      descriptor,
      perceptionEvidence: {
        modelId: "stable-lens-v1",
        tuning: { strength: 0.5 },
        source: descriptor,
        perceived: descriptor,
        effects: [
          {
            dimension: "shoulderWidth",
            operation: "increase",
            magnitude: 0.4,
            explanation: "Shoulders remain consistently widened.",
          },
        ],
      },
      weight: 0.8,
    },
  ],
  consensus: descriptor,
  comparisonToSelf: [],
  disagreements: [],
  confidence: 0.8,
};

describe("DeterministicRelationshipAdaptationSystem", () => {
  it("derives the same peer model from the same evidence regardless of cycle", async () => {
    const system = new DeterministicRelationshipAdaptationSystem();
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const early = await system.adapt({ manifest, state, evidence, cycle: 2 });
    const late = await system.adapt({ manifest, state, evidence, cycle: 2_000 });

    expect(late).toEqual(early);
    expect(early["peer-a"].perceivedDistortions).toEqual([
      "increase:shoulderWidth",
      "omits:left hand",
    ]);
    expect(early["peer-a"].perceivedReliability).toBeGreaterThan(0);
    expect(early["peer-a"].perceivedReliability).toBeLessThan(1);
  });
});
