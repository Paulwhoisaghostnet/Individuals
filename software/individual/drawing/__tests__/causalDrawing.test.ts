import { describe, expect, it } from "vitest";

import { createInitialState } from "../../core/createInitialState";
import type { CycleIntent, Observation, Portrait } from "../../core/model";
import { StableIdGenerator } from "../../core/systemUtilities";
import { irisManifest, morrowManifest, sableManifest } from "../../identity-packages";
import { ProceduralPerceptionSystem } from "../../perception/proceduralPerception";
import { GenerativeDrawingSystem } from "../generativeDrawing";

const baselineIntent: CycleIntent = {
  statement: "Keep the spine upright and the hands open.",
  desiredQualities: ["clarity"],
  visualInstructions: ["center the frontal body"],
  bodilyInstructions: ["level the shoulders"],
};

describe("GenerativeDrawingSystem causal rendering", () => {
  it("changes body geometry only through typed signed adjustments, not prose", async () => {
    const drawing = new GenerativeDrawingSystem(new StableIdGenerator());
    const state = createInitialState(irisManifest, "2026-01-01T00:00:00.000Z");
    const first = await drawing.drawSelf({
      manifest: irisManifest,
      state,
      intent: baselineIntent,
      cycle: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const second = await drawing.drawSelf({
      manifest: irisManifest,
      state: {
        ...state,
        selfConcept: {
          ...state.selfConcept,
          narrative: "This prose must not secretly steer geometry.",
        },
      },
      intent: {
        ...baselineIntent,
        statement: "Open and widen the body while straightening the spine.",
        bodilyInstructions: ["open both hands", "widen the shoulders"],
        bodyAdjustments: [
          { dimension: "openness", direction: 1, magnitude: 0.1, basis: "self" },
        ],
      },
      cycle: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(first.descriptor?.figure).not.toEqual(second.descriptor?.figure);
    expect(first.artwork.content).not.toEqual(second.artwork.content);
    expect(second.descriptor?.figure.openness).toBeGreaterThan(first.descriptor?.figure.openness ?? 0);

    const sameAdjustmentDifferentProse = await drawing.drawSelf({
      manifest: irisManifest,
      state,
      intent: {
        ...baselineIntent,
        statement: "Close, shrink, and fold everything (narrative decoy).",
        bodilyInstructions: ["become tiny"],
        bodyAdjustments: [
          { dimension: "openness", direction: 1, magnitude: 0.1, basis: "self" },
        ],
      },
      cycle: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(sameAdjustmentDifferentProse.descriptor?.figure).toEqual(second.descriptor?.figure);
  });

  it("redraws perceived evidence through the observer's own ability without nesting source SVG", async () => {
    const ids = new StableIdGenerator();
    const drawing = new GenerativeDrawingSystem(ids);
    const untrustedFeatureLabel = "MACHINE_VISION_FEATURE_CANARY_51b0";
    const sourceState = createInitialState(morrowManifest, "2026-01-01T00:00:00.000Z");
    const generatedSource = await drawing.drawSelf({
      manifest: morrowManifest,
      state: sourceState,
      intent: baselineIntent,
      cycle: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const source: Portrait = {
      ...generatedSource,
      descriptor: {
        ...generatedSource.descriptor!,
        features: [{ label: untrustedFeatureLabel, prominence: 0.9 }],
        anatomy: {
          ...generatedSource.descriptor!.anatomy!,
          skinColor: untrustedFeatureLabel,
          jointContourColor: untrustedFeatureLabel,
          chestPlates: {
            count: 3,
            color: untrustedFeatureLabel,
            opacity: 0.5,
          },
          spinalMark: { color: untrustedFeatureLabel, width: 3 },
        },
      },
      artwork: {
        ...generatedSource.artwork,
        content: '<svg><script>SOURCE_SENTINEL()</script><text>do not copy me</text></svg>',
      },
    };
    const state = createInitialState(irisManifest, "2026-01-01T00:00:00.000Z");
    const observation = await new ProceduralPerceptionSystem().observe({
      manifest: irisManifest,
      state,
      portrait: source,
      cycle: 2,
      tuning: { "edge-gain": 0.9, "interior-loss": 0.7, "symmetry-pull": 0.5 },
    });
    const peer = await drawing.drawPeer({
      manifest: irisManifest,
      state,
      intent: baselineIntent,
      observation,
      cycle: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(peer.descriptor?.styleName).toBe(irisManifest.drawing.ability.styleName);
    expect(peer.descriptor?.figure).not.toEqual(source.descriptor?.figure);
    expect(peer.artwork.content).not.toContain("SOURCE_SENTINEL");
    expect(peer.descriptor?.features[0]?.label).toBe(untrustedFeatureLabel);
    expect(JSON.stringify(peer.descriptor)).toContain(untrustedFeatureLabel);
    expect(peer.artwork.content).not.toContain(untrustedFeatureLabel);
    expect(peer.artwork.content.match(/<svg\b/g)).toHaveLength(1);
    expect(peer.sourcePortraitIds).toEqual([source.id]);
    expect(peer.observationEvidence?.modelId).toBe(irisManifest.perception.modelId);
  });

  it("XML-escapes authored labels without publishing private intention text", async () => {
    const drawing = new GenerativeDrawingSystem(new StableIdGenerator());
    const manifest = { ...irisManifest, displayName: 'Iris <script data-x="1">' };
    const state = createInitialState(manifest, "2026-01-01T00:00:00.000Z");
    const portrait = await drawing.drawSelf({
      manifest,
      state,
      intent: { ...baselineIntent, statement: '<img src=x onerror="alert(1)"> & body' },
      cycle: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(portrait.artwork.content).not.toContain("<script");
    expect(portrait.artwork.content).not.toContain("<img");
    expect(portrait.artwork.content).toContain("&lt;script");
    expect(portrait.artwork.content).not.toContain("&lt;img");
    expect(portrait.artwork.content).not.toContain("onerror");
    expect(portrait.artwork.content).not.toContain("&amp; body");
  });

  it("renders authored anatomy and art practice as visible constraints", async () => {
    const drawing = new GenerativeDrawingSystem(new StableIdGenerator());
    const draw = (manifest: typeof irisManifest) =>
      drawing.drawSelf({
        manifest,
        state: createInitialState(manifest, "2026-01-01T00:00:00.000Z"),
        intent: baselineIntent,
        cycle: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    const [iris, morrow, sable] = await Promise.all([
      draw(irisManifest),
      draw(morrowManifest),
      draw(sableManifest),
    ]);

    expect(iris.artwork.content).toContain('data-finger-count="4"');
    expect(iris.artwork.content).toContain('data-mark-mode="continuous-contour"');
    expect(iris.artwork.content).toContain('data-composition="isolated-frontal"');
    expect(morrow.artwork.content).toContain('data-mark-mode="assembled-planes"');
    expect(morrow.artwork.content).toContain('data-composition="low-grounded"');
    expect(morrow.artwork.content.match(/fill="#b9ceca"/g)).toHaveLength(5);
    expect(sable.artwork.content).toContain('data-finger-count="6"');
    expect(sable.artwork.content).toContain('data-feature="spinal-mark"');
    expect(sable.artwork.content).toContain('data-mark-mode="repeated-gesture"');
    expect(sable.artwork.content).toContain('stroke-dasharray="24 7"');

    const erasingManifest = {
      ...irisManifest,
      drawing: {
        ...irisManifest.drawing,
        ability: {
          ...irisManifest.drawing.ability,
          practice: {
            ...irisManifest.drawing.ability.practice!,
            erasureAllowed: true,
          },
        },
      },
    };
    const erasing = await draw(erasingManifest);
    expect(erasing.artwork.content).toContain('data-practice-effect="erasure"');
    expect(erasing.artwork.content).not.toEqual(iris.artwork.content);
  });

  it("draws observed categorical anatomy through skill limits while preserving authored self anatomy", async () => {
    const drawing = new GenerativeDrawingSystem(new StableIdGenerator());
    const limitedManifest = {
      ...irisManifest,
      drawing: {
        ...irisManifest.drawing,
        ability: {
          ...irisManifest.drawing.ability,
          skill: {
            observationalAccuracy: 0,
            proportionAccuracy: 0,
            anatomicalCoherence: 0,
            lineControl: 0,
            detailCapacity: 0,
            spatialCoherence: 0,
          },
          practice: {
            ...irisManifest.drawing.ability.practice!,
            detailSuppression: 1,
          },
        },
      },
    };
    const state = createInitialState(limitedManifest, "2026-01-01T00:00:00.000Z");
    const source = await drawing.drawSelf({
      manifest: morrowManifest,
      state: createInitialState(morrowManifest, "2026-01-01T00:00:00.000Z"),
      intent: baselineIntent,
      cycle: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const observedAnatomy = {
      ...source.descriptor!.anatomy!,
      jointContourColor: "#dddddd",
      spinalMark: { color: "#bb4433", width: 4 },
    };
    const observedDescriptor = { ...source.descriptor!, anatomy: observedAnatomy };
    const observation: Observation = {
      observerId: limitedManifest.id,
      subjectId: source.subjectId,
      sourcePortrait: { ...source, descriptor: observedDescriptor },
      perceivedArtwork: {
        format: "procedural",
        width: source.artwork.width,
        height: source.artwork.height,
        content: "{}",
      },
      evidence: {
        modelId: limitedManifest.perception.modelId,
        tuning: {},
        source: observedDescriptor,
        perceived: observedDescriptor,
        effects: [],
      },
      notes: [],
    };
    const peer = await drawing.drawPeer({
      manifest: limitedManifest,
      state,
      intent: baselineIntent,
      observation,
      cycle: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const self = await drawing.drawSelf({
      manifest: limitedManifest,
      state,
      intent: baselineIntent,
      cycle: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(peer.descriptor?.anatomy?.fingerCountPerHand).not.toBe(
      observedAnatomy.fingerCountPerHand,
    );
    expect(peer.descriptor?.anatomy?.chestPlates).toBeUndefined();
    expect(peer.descriptor?.anatomy?.spinalMark).toBeUndefined();
    expect(peer.descriptor?.anatomy?.jointContourColor).toBeUndefined();
    expect(peer.artwork.content).toContain(
      `data-finger-count="${peer.descriptor!.anatomy!.fingerCountPerHand}"`,
    );
    expect(peer.artwork.content).not.toContain('data-feature="spinal-mark"');
    expect(self.descriptor?.anatomy).toEqual(
      limitedManifest.identity.idealPhysicalForm.visualSpecification!.anatomy,
    );
  });
});
