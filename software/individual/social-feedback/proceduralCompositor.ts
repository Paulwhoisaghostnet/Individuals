import type { Portrait } from "../core/model";
import type { FeedbackCompositor, IdGenerator } from "../core/systems/contracts";
import { renderSocialCompositeSvg } from "../drawing/svgRenderer";

import { buildSocialFeedbackEvidence } from "./evidence";

/**
 * Composes peer interpretations at the descriptor layer. No peer-controlled
 * markup crosses the boundary into the composite SVG.
 */
export class ProceduralFeedbackCompositor implements FeedbackCompositor {
  constructor(private readonly ids: IdGenerator) {}

  async compose(input: Parameters<FeedbackCompositor["compose"]>[0]): Promise<Portrait | undefined> {
    const { manifest, portraits, sourceSelfPortrait, cycle, createdAt } = input;
    if (portraits.length === 0) return undefined;
    if (!sourceSelfPortrait) {
      throw new Error("A persisted source self portrait is required for social composition.");
    }

    const invalid = portraits.find(
      (portrait) => portrait.role !== "peer" || portrait.subjectId !== manifest.id,
    );
    if (invalid) {
      throw new Error(
        `Cannot composite portrait "${invalid.id}": expected a peer portrait of "${manifest.id}".`,
      );
    }
    for (const portrait of portraits) {
      if (
        portrait.sourcePortraitIds.length !== 1 ||
        portrait.sourcePortraitIds[0] !== sourceSelfPortrait.id
      ) {
        throw new Error(`Portrait "${portrait.id}" does not belong to source cohort "${sourceSelfPortrait.id}".`);
      }
    }

    const evidence = buildSocialFeedbackEvidence({
      subjectId: manifest.id,
      portraits,
      sourceSelfPortrait,
      idealFigure: manifest.identity.idealPhysicalForm.visualSpecification?.figure,
    });
    const title = `${manifest.displayName} — social composite / cycle ${cycle}`;
    const subtitle = `${portraits.length} peer interpretation${portraits.length === 1 ? "" : "s"}; confidence ${evidence.confidence.toFixed(2)}`;

    return {
      id: this.ids.create([manifest.id, cycle, "social"]),
      cycle,
      artistId: "collective",
      subjectId: manifest.id,
      role: "social",
      createdAt,
      artwork: {
        format: "svg",
        width: 800,
        height: 1000,
        content: renderSocialCompositeSvg({
          title,
          subtitle,
          consensus: evidence.consensus,
          layers: evidence.contributions.map((contribution) => ({
            descriptor: contribution.descriptor,
            weight: contribution.weight,
          })),
          palette: manifest.drawing.palette,
        }),
      },
      descriptor: evidence.consensus,
      socialEvidence: evidence,
      statement: `Structured consensus of ${portraits.length} peer interpretation${portraits.length === 1 ? "" : "s"}.`,
      sourcePortraitIds: portraits.map((portrait) => portrait.id),
    };
  }
}
