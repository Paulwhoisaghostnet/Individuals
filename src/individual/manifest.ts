import type { IndividualManifest, Trait } from "./model";

const assertNonEmpty = (value: string, field: string): void => {
  if (value.trim().length === 0) {
    throw new Error(`Individual manifest field "${field}" cannot be empty.`);
  }
};

const assertTrait = (trait: Trait): void => {
  assertNonEmpty(trait.name, "identity.traits[].name");
  if (trait.value < 0 || trait.value > 1) {
    throw new Error(`Trait "${trait.name}" must have a value between 0 and 1.`);
  }
};

export const defineIndividualManifest = <T extends IndividualManifest>(manifest: T): T => {
  assertNonEmpty(manifest.id, "id");
  assertNonEmpty(manifest.displayName, "displayName");
  assertNonEmpty(manifest.statement, "statement");
  assertNonEmpty(manifest.identity.origin, "identity.origin");
  assertNonEmpty(manifest.identity.privateNarrative, "identity.privateNarrative");
  assertNonEmpty(manifest.identity.idealSelf.narrative, "identity.idealSelf.narrative");
  manifest.identity.traits.forEach(assertTrait);

  if (manifest.cadence.minimumCycleIntervalMs < 0) {
    throw new Error("minimumCycleIntervalMs cannot be negative.");
  }

  return manifest;
};

