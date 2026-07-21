import type { Portrait } from "../core/model";
import type { FeedbackCompositor, IdGenerator } from "../core/systems/contracts";

export class ProceduralFeedbackCompositor implements FeedbackCompositor {
  constructor(private readonly ids: IdGenerator) {}

  async compose(input: Parameters<FeedbackCompositor["compose"]>[0]): Promise<Portrait | undefined> {
    const { manifest, portraits, cycle, createdAt } = input;
    if (portraits.length === 0) return undefined;

    const opacity = (1 / portraits.length).toFixed(2);
    const [bg = "#11110f", fg = "#e9e7df", accent = "#c57d4d"] = manifest.drawing.palette;

    const layersSvg = portraits
      .map(
        (portrait, index) =>
          `<g opacity="${opacity}" data-layer="${index}" data-artist="${portrait.artistId}">
            ${portrait.artwork.content}
          </g>`,
      )
      .join("\n");

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="Social portrait of ${manifest.displayName}">
  <rect width="800" height="1000" fill="${bg}"/>
  ${layersSvg}
  <text x="40" y="940" fill="${fg}" font-family="sans-serif" font-size="22">${manifest.displayName} — social composite / cycle ${cycle}</text>
  <text x="40" y="970" fill="${accent}" font-family="sans-serif" font-size="14">${portraits.length} peer portrait${portraits.length === 1 ? "" : "s"} composited.</text>
</svg>`;

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
        content: svgContent,
      },
      statement: `Layered composite of ${portraits.length} peer interpretation${portraits.length === 1 ? "" : "s"}.`,
      sourcePortraitIds: portraits.map((portrait) => portrait.id),
    };
  }
}
