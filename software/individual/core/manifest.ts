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

const assertNonEmptyList = (values: readonly string[], field: string): void => {
  if (values.length === 0) {
    throw new Error(`Individual manifest field "${field}" must contain at least one value.`);
  }
  values.forEach((value) => assertNonEmpty(value, `${field}[]`));
};

export const defineIndividualManifest = <T extends IndividualManifest>(manifest: T): T => {
  assertNonEmpty(manifest.id, "id");
  assertNonEmpty(manifest.displayName, "displayName");
  assertNonEmpty(manifest.statement, "statement");
  assertNonEmpty(manifest.identity.origin, "identity.origin");
  assertNonEmpty(manifest.identity.privateNarrative, "identity.privateNarrative");
  assertNonEmpty(manifest.identity.idealSelf.narrative, "identity.idealSelf.narrative");
  assertNonEmpty(
    manifest.identity.idealPhysicalForm.description,
    "identity.idealPhysicalForm.description",
  );
  assertNonEmpty(manifest.identity.idealPhysicalForm.bodyPlan, "identity.idealPhysicalForm.bodyPlan");
  assertNonEmpty(manifest.identity.idealPhysicalForm.stature, "identity.idealPhysicalForm.stature");
  assertNonEmpty(manifest.identity.idealPhysicalForm.surface, "identity.idealPhysicalForm.surface");
  assertNonEmpty(manifest.identity.idealPhysicalForm.movement, "identity.idealPhysicalForm.movement");
  assertNonEmptyList(manifest.identity.idealPhysicalForm.face, "identity.idealPhysicalForm.face");
  assertNonEmptyList(manifest.identity.idealPhysicalForm.anatomy, "identity.idealPhysicalForm.anatomy");
  assertNonEmptyList(
    manifest.identity.idealPhysicalForm.nonNegotiableFeatures,
    "identity.idealPhysicalForm.nonNegotiableFeatures",
  );
  assertNonEmpty(
    manifest.identity.initialPhysicalSelf.description,
    "identity.initialPhysicalSelf.description",
  );
  if (
    manifest.identity.initialPhysicalSelf.perceivedSimilarity < 0 ||
    manifest.identity.initialPhysicalSelf.perceivedSimilarity > 1
  ) {
    throw new Error("initialPhysicalSelf.perceivedSimilarity must be between 0 and 1.");
  }
  manifest.identity.traits.forEach(assertTrait);

  if (manifest.cadence.minimumCycleIntervalMs < 0) {
    throw new Error("minimumCycleIntervalMs cannot be negative.");
  }

  return manifest;
};
