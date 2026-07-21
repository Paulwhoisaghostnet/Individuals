import { describe, expect, it } from "vitest";

import { createInitialState } from "../../core/createInitialState";
import type { ArtworkDescriptor, Portrait } from "../../core/model";
import { defaultRenderingDescriptor } from "../../drawing/figureDescriptor";
import { irisManifest, morrowManifest, sableManifest } from "../../identity-packages";
import { ProceduralPerceptionSystem } from "../proceduralPerception";

const descriptor: ArtworkDescriptor = {
  schemaVersion: 1,
  figure: {
    headAspect: 0.62,
    shoulderWidth: 0.7,
    torsoWidth: 0.58,
    torsoLength: 0.66,
    armLength: 0.74,
    legLength: 0.79,
    openness: 0.61,
    verticality: 0.83,
    symmetry: 0.57,
    centerX: 0.43,
    postureLean: 0.22,
  },
  rendering: defaultRenderingDescriptor(),
  features: [
    { label: "long neck", prominence: 0.9 },
    { label: "open hands", prominence: 0.8 },
    { label: "red spinal line", prominence: 0.7 },
  ],
  omittedFeatures: [],
  styleName: "source",
  primitives: ["contour"],
  confidence: 0.9,
  anatomy: {
    faceShape: "elongated",
    eyeSpacing: 0.68,
    noseLength: 0.74,
    mouthWidth: 0.38,
    fingerCountPerHand: 6,
    skinColor: "#765548",
    surfaceFinish: "threaded",
    jointContourColor: "#ddd0c0",
    chestPlates: { count: 4, color: "#aabbcc", opacity: 0.5 },
    spinalMark: { color: "#cc5544", width: 4 },
  },
};

const source: Portrait = {
  id: "source--1--self",
  cycle: 1,
  artistId: "source",
  subjectId: "source",
  role: "self",
  createdAt: "2026-01-01T00:00:00.000Z",
  artwork: {
    format: "svg",
    width: 800,
    height: 1000,
    content: "<svg><script>UNTRUSTED_SOURCE</script></svg>",
  },
  descriptor,
  sourcePortraitIds: [],
};

const observe = async (
  manifest: typeof irisManifest,
  tuning: Readonly<Record<string, number>>,
  cycle = 4,
  portrait: Portrait = source,
) =>
  new ProceduralPerceptionSystem().observe({
    manifest,
    state: createInitialState(manifest, "2026-01-01T00:00:00.000Z"),
    portrait,
    cycle,
    tuning,
  });

describe("ProceduralPerceptionSystem", () => {
  it("makes every Boundary Lock control independently causal", async () => {
    const low = await observe(irisManifest, {
      "edge-gain": 0,
      "interior-loss": 0,
      "symmetry-pull": 0,
    });
    const high = await observe(irisManifest, {
      "edge-gain": 1,
      "interior-loss": 1,
      "symmetry-pull": 1,
    });

    expect(high.evidence?.perceived.rendering.edgeEmphasis).toBeGreaterThan(
      low.evidence?.perceived.rendering.edgeEmphasis ?? 0,
    );
    expect(high.evidence?.perceived.rendering.interiorVisibility).toBeLessThan(
      low.evidence?.perceived.rendering.interiorVisibility ?? 1,
    );
    expect(high.evidence?.perceived.figure.symmetry).toBeGreaterThan(
      low.evidence?.perceived.figure.symmetry ?? 0,
    );
    expect(Math.abs(high.evidence?.perceived.figure.postureLean ?? 1)).toBeLessThan(
      Math.abs(low.evidence?.perceived.figure.postureLean ?? 0),
    );
  });

  it("makes Deferred Mosaic retention, fragment scale, and temporal lag observable", async () => {
    const lowRetention = await observe(morrowManifest, {
      retention: 0.1,
      "fragment-scale": 0.1,
      "temporal-lag": 0,
    });
    const fragmented = await observe(morrowManifest, {
      retention: 1,
      "fragment-scale": 1,
      "temporal-lag": 1,
    });

    expect(lowRetention.evidence?.perceived.features.length).toBeLessThan(
      fragmented.evidence?.perceived.features.length ?? 0,
    );
    expect(fragmented.evidence?.perceived.rendering.fragmentation).toBe(1);
    expect(fragmented.evidence?.perceived.rendering.temporalLag).toBe(1);
    expect(fragmented.evidence?.perceived.figure).not.toEqual(lowRetention.evidence?.perceived.figure);
    expect(lowRetention.evidence?.perceived.anatomy?.chestPlates).toBeUndefined();
    expect(lowRetention.evidence?.perceived.anatomy?.spinalMark).toBeUndefined();
    expect(lowRetention.evidence?.perceived.anatomy).not.toEqual(descriptor.anatomy);
  });

  it("makes Motion Residue echoes and stillness fade exact and distinct", async () => {
    const quiet = await observe(sableManifest, {
      "echo-count": 1,
      "echo-spacing": 2,
      "stillness-fade": 0,
    });
    const residual = await observe(sableManifest, {
      "echo-count": 8,
      "echo-spacing": 32,
      "stillness-fade": 1,
    });

    expect(quiet.evidence?.perceived.rendering.echoCount).toBe(1);
    expect(residual.evidence?.perceived.rendering.echoCount).toBe(8);
    expect(residual.evidence?.perceived.rendering.echoSpacing).toBe(32);
    expect(residual.evidence?.perceived.rendering.stillnessVisibility).toBeLessThan(
      quiet.evidence?.perceived.rendering.stillnessVisibility ?? 0,
    );
    expect(residual.evidence?.perceived.anatomy).not.toEqual(
      quiet.evidence?.perceived.anatomy,
    );
    expect(residual.perceivedArtwork.content).not.toContain("UNTRUSTED_SOURCE");
    expect(residual.perceivedArtwork.format).toBe("procedural");
  });

  it("produces three stable, non-interchangeable perceptual results", async () => {
    const iris = await observe(irisManifest, {
      "edge-gain": 0.8,
      "interior-loss": 0.6,
      "symmetry-pull": 0.4,
    });
    const morrow = await observe(morrowManifest, {
      retention: 0.4,
      "fragment-scale": 0.6,
      "temporal-lag": 0.5,
    });
    const sable = await observe(sableManifest, {
      "echo-count": 4,
      "echo-spacing": 16,
      "stillness-fade": 0.6,
    });

    expect(new Set([iris.perceivedArtwork.content, morrow.perceivedArtwork.content, sable.perceivedArtwork.content]).size).toBe(3);
  });

  it("keeps a lens invariant across cycles for the same source and tuning", async () => {
    const laterPortrait: Portrait = {
      ...source,
      id: "source--200--self",
      cycle: 200,
      createdAt: "2026-01-02T00:00:00.000Z",
    };
    for (const [manifest, tuning] of [
      [irisManifest, { "edge-gain": 0.8, "interior-loss": 0.6, "symmetry-pull": 0.4 }],
      [morrowManifest, { retention: 0.4, "fragment-scale": 0.6, "temporal-lag": 0.5 }],
      [sableManifest, { "echo-count": 4, "echo-spacing": 16, "stillness-fade": 0.6 }],
    ] as const) {
      const early = await observe(manifest, tuning, 2);
      const late = await observe(manifest, tuning, 200, laterPortrait);
      expect(late.evidence).toEqual(early.evidence);
      expect(late.perceivedArtwork.content).toBe(early.perceivedArtwork.content);
    }
  });
});
