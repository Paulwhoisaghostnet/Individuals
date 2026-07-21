import { describe, expect, it } from "vitest";

import { createInitialState } from "../../core/createInitialState";
import type { ArtworkDescriptor, Portrait } from "../../core/model";
import { StableIdGenerator } from "../../core/systemUtilities";
import { defaultRenderingDescriptor } from "../../drawing/figureDescriptor";
import { irisManifest } from "../../identity-packages";
import { ProceduralFeedbackCompositor } from "../proceduralCompositor";

const descriptor = (shoulderWidth: number, styleName: string): ArtworkDescriptor => ({
  schemaVersion: 1,
  figure: {
    headAspect: 0.7,
    shoulderWidth,
    torsoWidth: 0.48,
    torsoLength: 0.65,
    armLength: 0.7,
    legLength: 0.8,
    openness: 0.6,
    verticality: 0.9,
    symmetry: 0.8,
    centerX: 0.5,
    postureLean: 0,
  },
  rendering: defaultRenderingDescriptor(),
  features: [{ label: "long neck", prominence: 0.8 }],
  omittedFeatures: [],
  styleName,
  primitives: ["contour"],
  confidence: 0.8,
});

const peerPortrait = (
  id: string,
  artistId: string,
  body: ArtworkDescriptor,
  content: string,
): Portrait => ({
  id,
  cycle: 2,
  artistId,
  subjectId: "iris",
  role: "peer",
  createdAt: "2026-01-01T00:00:00.000Z",
  artwork: { format: "svg", width: 800, height: 1000, content },
  descriptor: body,
  sourcePortraitIds: ["iris--1--self"],
});

describe("ProceduralFeedbackCompositor", () => {
  it("builds a numeric consensus and never embeds peer-controlled markup", async () => {
    const compositor = new ProceduralFeedbackCompositor(new StableIdGenerator());
    const selfPortrait = peerPortrait(
      "iris--1--self",
      "iris",
      descriptor(0.4, "self"),
      "<svg/>",
    );
    const social = await compositor.compose({
      manifest: irisManifest,
      state: createInitialState(irisManifest, "2026-01-01T00:00:00.000Z"),
      sourceSelfPortrait: {
        ...selfPortrait,
        role: "self",
        subjectId: "iris",
        cycle: 1,
        sourcePortraitIds: [],
      },
      portraits: [
        peerPortrait(
          "morrow--2--peer--iris",
          "morrow",
          descriptor(0.3, "planes"),
          '<svg><script>COMPOSITE_SENTINEL()</script></svg>',
        ),
        peerPortrait(
          "sable--2--peer--iris",
          'sable"><script>ARTIST_SENTINEL()</script>',
          descriptor(0.7, "gesture"),
          "<svg><foreignObject>HOSTILE</foreignObject></svg>",
        ),
      ],
      cycle: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(social?.descriptor?.figure.shoulderWidth).toBe(0.5);
    expect(
      social?.socialEvidence?.comparisonToSelf.find((item) => item.dimension === "shoulderWidth")
        ?.delta,
    ).toBe(0.1);
    expect(social?.socialEvidence?.contributions).toHaveLength(2);
    expect(social?.socialEvidence?.disagreements.find((item) => item.dimension === "shoulderWidth")?.spread).toBe(0.4);
    expect(social?.artwork.content).not.toContain("COMPOSITE_SENTINEL");
    expect(social?.artwork.content).not.toContain("ARTIST_SENTINEL");
    expect(social?.artwork.content).not.toContain("foreignObject");
    expect(social?.artwork.content.match(/<svg\b/g)).toHaveLength(1);
  });

  it("rejects an invalid layer even when called outside the engine", async () => {
    const compositor = new ProceduralFeedbackCompositor(new StableIdGenerator());
    const source = peerPortrait("iris--1--self", "iris", descriptor(0.4, "self"), "<svg/>");
    await expect(
      compositor.compose({
        manifest: irisManifest,
        state: createInitialState(irisManifest, "2026-01-01T00:00:00.000Z"),
        sourceSelfPortrait: {
          ...source,
          cycle: 1,
          role: "self",
          sourcePortraitIds: [],
        },
        portraits: [
          {
            ...peerPortrait("morrow--2--self", "morrow", descriptor(0.5, "source"), "<svg/>"),
            role: "self",
            subjectId: "morrow",
          },
        ],
        cycle: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow('expected a peer portrait of "iris"');
  });

  it("measures minority feature support against every contributor", async () => {
    const compositor = new ProceduralFeedbackCompositor(new StableIdGenerator());
    const source = peerPortrait("iris--1--self", "iris", descriptor(0.4, "self"), "<svg/>");
    const withoutFeature = {
      ...descriptor(0.5, "gesture"),
      features: [],
    };
    const social = await compositor.compose({
      manifest: irisManifest,
      state: createInitialState(irisManifest, "2026-01-01T00:00:00.000Z"),
      sourceSelfPortrait: {
        ...source,
        cycle: 1,
        role: "self",
        sourcePortraitIds: [],
      },
      portraits: [
        peerPortrait("morrow--2--peer--iris", "morrow", descriptor(0.5, "planes"), "<svg/>"),
        peerPortrait("sable--2--peer--iris", "sable", withoutFeature, "<svg/>"),
      ],
      cycle: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const feature = social?.descriptor?.features.find((item) => item.label === "long neck");
    expect(feature?.support).toBe(0.5);
    expect(feature?.prominence).toBe(0.4);
  });
});
