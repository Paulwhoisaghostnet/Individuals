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

const assertUnitInterval = (value: number, field: string): void => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Individual manifest field "${field}" must be between 0 and 1.`);
  }
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

  assertNonEmpty(manifest.perception.modelId, "perception.modelId");
  assertNonEmpty(manifest.perception.modelName, "perception.modelName");
  if (manifest.perception.controls.length === 0) {
    throw new Error('Individual manifest field "perception.controls" must define at least one control.');
  }
  const controlIds = new Set<string>();
  for (const control of manifest.perception.controls) {
    assertNonEmpty(control.id, "perception.controls[].id");
    assertNonEmpty(control.label, "perception.controls[].label");
    assertNonEmpty(control.description, "perception.controls[].description");
    if (controlIds.has(control.id)) {
      throw new Error(`Duplicate perception control id "${control.id}".`);
    }
    controlIds.add(control.id);
    if (control.min >= control.max || control.step <= 0) {
      throw new Error(`Perception control "${control.id}" has an invalid numeric range.`);
    }
    if (control.defaultValue < control.min || control.defaultValue > control.max) {
      throw new Error(`Perception control "${control.id}" defaultValue is outside its range.`);
    }
  }

  const ability = manifest.drawing.ability;
  assertNonEmpty(ability.styleName, "drawing.ability.styleName");
  assertNonEmpty(ability.styleDescription, "drawing.ability.styleDescription");
  assertNonEmpty(ability.markBehavior, "drawing.ability.markBehavior");
  assertNonEmpty(ability.compositionBehavior, "drawing.ability.compositionBehavior");
  assertNonEmpty(ability.correctionBehavior, "drawing.ability.correctionBehavior");
  assertNonEmptyList(ability.favoredPrimitives, "drawing.ability.favoredPrimitives");
  assertNonEmptyList(ability.limitations, "drawing.ability.limitations");
  for (const [name, value] of Object.entries(ability.skill)) {
    assertUnitInterval(value, `drawing.ability.skill.${name}`);
  }

  return manifest;
};
