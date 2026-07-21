import type { Observation } from "../core/model";
import type { PerceptionSystem } from "../core/systems/contracts";
import { descriptorForPortrait } from "../drawing/figureDescriptor";

import { applyPerceptionModel } from "./perceptionModels";

/**
 * Applies a stable, model-specific distortion to structured body evidence.
 * The perceived artwork is data, not embedded source markup; drawing remains a
 * later and independent stage of the causal pipeline.
 */
export class ProceduralPerceptionSystem implements PerceptionSystem {
  async observe(input: Parameters<PerceptionSystem["observe"]>[0]): Promise<Observation> {
    const { manifest, portrait, tuning } = input;
    const evidence = applyPerceptionModel({
      modelId: manifest.perception.modelId,
      source: descriptorForPortrait(portrait),
      tuning: { ...tuning },
      // Identity-specific lenses keep their directional bias across portraits;
      // a cycle/portrait ID must not randomly reverse how an Individual sees.
      observationKey: `${manifest.id}:lens`,
    });
    const tuningEntries = Object.entries(tuning)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, value]) => `${id}=${value}`);

    return {
      observerId: manifest.id,
      subjectId: portrait.subjectId,
      sourcePortrait: portrait,
      perceivedArtwork: {
        format: "procedural",
        width: portrait.artwork.width,
        height: portrait.artwork.height,
        content: JSON.stringify({
          schema: "individuals-perception/v1",
          modelId: evidence.modelId,
          descriptor: evidence.perceived,
          effects: evidence.effects,
        }),
      },
      evidence,
      notes: [
        `Perception model "${manifest.perception.modelName}" (${manifest.perception.modelId}) applied by ${manifest.displayName}.`,
        ...evidence.effects.map((effect) => effect.explanation),
        ...tuningEntries,
      ],
    };
  }
}
