import type { IndividualManifest, IndividualState } from "./model";

export const createInitialState = (
  manifest: IndividualManifest,
  createdAt: string,
): IndividualState => ({
  individualId: manifest.id,
  status: "idle",
  cycle: 0,
  selfConcept: {
    narrative: manifest.identity.privateNarrative,
    keywords: manifest.identity.traits.map((trait) => trait.name),
    confidence: 0.5,
  },
  createdAt,
  updatedAt: createdAt,
});

