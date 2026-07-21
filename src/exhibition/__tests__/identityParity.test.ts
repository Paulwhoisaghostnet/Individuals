import { describe, expect, it } from "vitest";

import { irisManifest } from "../../../software/individual/identity-packages/iris";
import { morrowManifest } from "../../../software/individual/identity-packages/morrow";
import { sableManifest } from "../../../software/individual/identity-packages/sable";
import { individuals } from "../data";

const manifests = [irisManifest, morrowManifest, sableManifest] as const;

describe("exhibition identity parity", () => {
  it("keeps the public exhibition biographies aligned with the runtime manifests", () => {
    expect(individuals.map(({ id }) => id)).toEqual(manifests.map(({ id }) => id));

    for (const manifest of manifests) {
      const exhibitionIdentity = individuals.find(({ id }) => id === manifest.id);
      expect(exhibitionIdentity, `missing exhibition identity ${manifest.id}`).toBeDefined();

      expect(exhibitionIdentity).toMatchObject({
        name: manifest.displayName,
        statement: manifest.statement,
        idealSelf: manifest.identity.idealSelf.narrative,
        palette: manifest.drawing.palette,
        physicalIdentity: {
          bodyPlan: manifest.identity.idealPhysicalForm.bodyPlan,
          ideal: manifest.identity.idealPhysicalForm.description,
          current: manifest.identity.initialPhysicalSelf.description,
          surface: manifest.identity.idealPhysicalForm.surface,
          invariantFeatures: manifest.identity.idealPhysicalForm.nonNegotiableFeatures,
          currentDifferences: manifest.identity.initialPhysicalSelf.perceivedDifferences,
        },
        socialDisposition: manifest.identity.socialDisposition,
        perceptionModel: {
          id: manifest.perception.modelId,
          name: manifest.perception.modelName,
          description: manifest.perception.description,
          controls: manifest.perception.controls,
        },
        artisticAbility: {
          name: manifest.drawing.ability.styleName,
          description: manifest.drawing.ability.styleDescription,
          primitives: manifest.drawing.ability.favoredPrimitives,
          markBehavior: manifest.drawing.ability.markBehavior,
          compositionBehavior: manifest.drawing.ability.compositionBehavior,
          correctionBehavior: manifest.drawing.ability.correctionBehavior,
          skill: manifest.drawing.ability.skill,
          limitations: manifest.drawing.ability.limitations,
        },
      });
    }
  });
});
