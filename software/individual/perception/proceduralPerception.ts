import type { Observation } from "../core/model";
import type { PerceptionSystem } from "../core/systems/contracts";

export class ProceduralPerceptionSystem implements PerceptionSystem {
  async observe(input: Parameters<PerceptionSystem["observe"]>[0]): Promise<Observation> {
    const { manifest, portrait, tuning } = input;
    const modelId = manifest.perception.modelId;
    const tuningEntries = Object.entries(tuning).map(([k, v]) => `${k}=${v}`);

    // Transform artwork content to reflect spectator perception filter
    const sourceSvg = portrait.artwork.content;
    const opacity = tuning["interior-loss"] !== undefined ? (1 - (tuning["interior-loss"] as number) * 0.5).toFixed(2) : "0.85";
    const strokeWidth = tuning["edge-gain"] !== undefined ? ((tuning["edge-gain"] as number) * 4).toFixed(1) : "2";

    const perceivedContent = sourceSvg.replace(
      'stroke-width="2"',
      `stroke-width="${strokeWidth}" opacity="${opacity}" data-perception="${modelId}"`,
    );

    return {
      observerId: manifest.id,
      subjectId: portrait.subjectId,
      sourcePortrait: portrait,
      perceivedArtwork: {
        format: "svg",
        width: portrait.artwork.width,
        height: portrait.artwork.height,
        content: perceivedContent,
      },
      notes: [
        `Perception model "${modelId}" applied by ${manifest.displayName}.`,
        ...tuningEntries,
      ],
    };
  }
}
