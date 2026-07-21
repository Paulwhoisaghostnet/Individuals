import type { Portrait } from "../core/model";
import type { IdGenerator, DrawingSystem } from "../core/systems/contracts";
import type { BodyPlan, VisualLanguage, ArtisticAbility } from "../../../src/exhibition/types";
import { generatePortrait } from "../../../src/exhibition/generative";
import { resolveDrawingEffect } from "../../../src/exhibition/drawing";

const resolveVisualLanguage = (primitives: readonly string[]): VisualLanguage => {
  if (primitives.includes("rectangle") || primitives.includes("overlaid plane")) return "fragment";
  if (primitives.includes("long curve") || primitives.includes("thread line")) return "thread";
  return "contour";
};

const resolveBodyPlan = (plan: string): BodyPlan => {
  if (plan === "compact" || plan === "longline") return plan;
  return "willow";
};

const toArtisticAbility = (scope: Parameters<DrawingSystem["drawSelf"]>[0]["manifest"]["drawing"]["ability"]): ArtisticAbility => ({
  name: scope.styleName,
  description: scope.styleDescription,
  primitives: scope.favoredPrimitives,
  markBehavior: scope.markBehavior,
  compositionBehavior: scope.compositionBehavior,
  correctionBehavior: scope.correctionBehavior,
  skill: scope.skill,
  limitations: scope.limitations,
});

export class GenerativeDrawingSystem implements DrawingSystem {
  constructor(private readonly ids: IdGenerator) {}

  async drawSelf(input: Parameters<DrawingSystem["drawSelf"]>[0]): Promise<Portrait> {
    const { manifest, cycle, createdAt, intent } = input;
    const bodyPlan = resolveBodyPlan(manifest.identity.idealPhysicalForm.bodyPlan);
    const language = resolveVisualLanguage(manifest.drawing.ability.favoredPrimitives);
    const drawingEffect = resolveDrawingEffect(toArtisticAbility(manifest.drawing.ability));

    const portraitData = generatePortrait(
      language,
      bodyPlan,
      manifest.id,
      cycle,
      "self",
      "self",
      undefined,
      drawingEffect,
    );

    const [bg = "#11110f", fg = "#e9e7df", accent = "#c57d4d", dim = "#5d574d"] = manifest.drawing.palette;

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="${manifest.displayName} self portrait">
  <rect width="800" height="1000" fill="${bg}"/>
  <g fill="none" stroke="${fg}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.88">
    <ellipse cx="${portraitData.body.head.x}" cy="${portraitData.body.head.y}" rx="${portraitData.body.head.rx}" ry="${portraitData.body.head.ry}"/>
    <path d="${portraitData.body.torsoPath}" fill="${dim}" opacity="0.3"/>
    <path d="${portraitData.body.leftArmPath}" stroke-width="6"/>
    <path d="${portraitData.body.rightArmPath}" stroke-width="6"/>
    <path d="${portraitData.body.leftLegPath}" stroke-width="8"/>
    <path d="${portraitData.body.rightLegPath}" stroke-width="8"/>
    <path d="${portraitData.body.spinePath}" stroke="${accent}" stroke-width="3"/>
  </g>
  <text x="40" y="940" fill="${fg}" font-family="sans-serif" font-size="22">${manifest.displayName} — self / cycle ${cycle}</text>
  <text x="40" y="970" fill="${accent}" font-family="sans-serif" font-size="14">${intent.statement.replace(/[<>&"']/g, "")}</text>
</svg>`;

    return {
      id: this.ids.create([manifest.id, cycle, "self"]),
      cycle,
      artistId: manifest.id,
      subjectId: manifest.id,
      role: "self",
      createdAt,
      artwork: {
        format: "svg",
        width: 800,
        height: 1000,
        content: svgContent,
      },
      statement: intent.statement,
      sourcePortraitIds: [],
    };
  }

  async drawPeer(input: Parameters<DrawingSystem["drawPeer"]>[0]): Promise<Portrait> {
    const { manifest, observation, cycle, createdAt } = input;
    const subjectId = observation.subjectId;
    const language = resolveVisualLanguage(manifest.drawing.ability.favoredPrimitives);
    const drawingEffect = resolveDrawingEffect(toArtisticAbility(manifest.drawing.ability));

    const [bg = "#11110f", fg = "#e9e7df", accent = "#c57d4d"] = manifest.drawing.palette;

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="${subjectId} perceived by ${manifest.displayName}">
  <rect width="800" height="1000" fill="${bg}"/>
  <g fill="none" stroke="${fg}" stroke-width="${(1.5 + (drawingEffect?.lineInstability ?? 0) * 2).toFixed(1)}" opacity="0.82">
    ${observation.perceivedArtwork.content}
  </g>
  <text x="40" y="940" fill="${fg}" font-family="sans-serif" font-size="22">${subjectId} as perceived by ${manifest.displayName}</text>
  <text x="40" y="970" fill="${accent}" font-family="sans-serif" font-size="14">cycle ${cycle} peer drawing</text>
</svg>`;

    return {
      id: this.ids.create([manifest.id, cycle, "peer", subjectId]),
      cycle,
      artistId: manifest.id,
      subjectId,
      role: "peer",
      createdAt,
      artwork: {
        format: "svg",
        width: 800,
        height: 1000,
        content: svgContent,
      },
      statement: observation.notes.join(" "),
      sourcePortraitIds: [observation.sourcePortrait.id],
    };
  }
}
