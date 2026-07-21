import { defineIndividualManifest } from "../core/manifest";
import type { IndividualManifest } from "../core/model";
import { validateAnatomy, validateFigure, validatePractice } from "./visualValidation";
import {
  assertExactKeys,
  requireBoolean,
  requireFinite,
  requireInteger,
  requireRecord,
  requireSafeIdentifier,
  requireString,
  requireStringArray,
  requireUnitInterval,
} from "./validationPrimitives";

const validatePhysicalSelf = (value: unknown, field: string): void => {
  const physical = requireRecord(value, field, 4);
  assertExactKeys(
    physical,
    ["description", "perceivedSimilarity", "perceivedDifferences", "bodyBelief"],
    field,
  );
  requireString(physical.description, `${field}.description`, 5_000);
  requireUnitInterval(physical.perceivedSimilarity, `${field}.perceivedSimilarity`);
  requireStringArray(physical.perceivedDifferences, `${field}.perceivedDifferences`, 32, 2_000);
  if (physical.bodyBelief !== undefined) validateFigure(physical.bodyBelief, `${field}.bodyBelief`);
};

const validateIdentity = (value: unknown): void => {
  const field = "snapshot.manifest.identity";
  const identity = requireRecord(value, field, 7);
  assertExactKeys(
    identity,
    ["origin", "privateNarrative", "traits", "idealSelf", "idealPhysicalForm", "initialPhysicalSelf", "socialDisposition"],
    field,
  );
  requireString(identity.origin, `${field}.origin`, 10_000);
  requireString(identity.privateNarrative, `${field}.privateNarrative`, 20_000);
  if (!Array.isArray(identity.traits) || identity.traits.length > 64) {
    throw new Error(`${field}.traits contains too many items.`);
  }
  const traitNames = new Set<string>();
  identity.traits.forEach((rawTrait, index) => {
    const trait = requireRecord(rawTrait, `${field}.traits[${index}]`, 3);
    assertExactKeys(trait, ["name", "description", "value"], `${field}.traits[${index}]`);
    const name = requireSafeIdentifier(trait.name, `${field}.traits[${index}].name`, 128);
    if (traitNames.has(name)) throw new Error(`${field}.traits contains duplicate name "${name}".`);
    traitNames.add(name);
    requireString(trait.description, `${field}.traits[${index}].description`, 2_000);
    requireUnitInterval(trait.value, `${field}.traits[${index}].value`);
  });

  const ideal = requireRecord(identity.idealSelf, `${field}.idealSelf`, 3);
  assertExactKeys(ideal, ["narrative", "values", "visualAnchors"], `${field}.idealSelf`);
  requireString(ideal.narrative, `${field}.idealSelf.narrative`, 20_000);
  requireStringArray(ideal.values, `${field}.idealSelf.values`, 64, 1_000);
  requireStringArray(ideal.visualAnchors, `${field}.idealSelf.visualAnchors`, 64, 1_000);

  const form = requireRecord(identity.idealPhysicalForm, `${field}.idealPhysicalForm`, 9);
  assertExactKeys(
    form,
    ["description", "bodyPlan", "stature", "surface", "face", "anatomy", "movement", "nonNegotiableFeatures", "visualSpecification"],
    `${field}.idealPhysicalForm`,
  );
  for (const key of ["description", "bodyPlan", "stature", "surface", "movement"] as const) {
    requireString(form[key], `${field}.idealPhysicalForm.${key}`, 10_000);
  }
  for (const key of ["face", "anatomy", "nonNegotiableFeatures"] as const) {
    requireStringArray(form[key], `${field}.idealPhysicalForm.${key}`, 64, 1_000);
  }
  const visual = requireRecord(form.visualSpecification, `${field}.idealPhysicalForm.visualSpecification`, 2);
  assertExactKeys(visual, ["figure", "anatomy"], `${field}.idealPhysicalForm.visualSpecification`);
  validateFigure(visual.figure, `${field}.idealPhysicalForm.visualSpecification.figure`);
  validateAnatomy(visual.anatomy, `${field}.idealPhysicalForm.visualSpecification.anatomy`);

  validatePhysicalSelf(identity.initialPhysicalSelf, `${field}.initialPhysicalSelf`);
  const disposition = requireRecord(identity.socialDisposition, `${field}.socialDisposition`, 6);
  assertExactKeys(
    disposition,
    ["selfIntegrity", "socialPermeability", "needForRecognition", "resistance", "curiosity", "trustByPeer"],
    `${field}.socialDisposition`,
  );
  for (const key of ["selfIntegrity", "socialPermeability", "needForRecognition", "resistance", "curiosity"] as const) {
    requireUnitInterval(disposition[key], `${field}.socialDisposition.${key}`);
  }
  const trust = requireRecord(disposition.trustByPeer, `${field}.socialDisposition.trustByPeer`, 64);
  for (const [peerId, rawTrust] of Object.entries(trust)) {
    requireSafeIdentifier(peerId, `${field}.socialDisposition.trustByPeer key`, 128);
    requireUnitInterval(rawTrust, `${field}.socialDisposition.trustByPeer.${peerId}`);
  }
};

const validatePerception = (value: unknown): void => {
  const field = "snapshot.manifest.perception";
  const perception = requireRecord(value, field, 5);
  assertExactKeys(perception, ["modelId", "modelName", "description", "constraints", "controls"], field);
  requireSafeIdentifier(perception.modelId, `${field}.modelId`, 128);
  requireString(perception.modelName, `${field}.modelName`, 300);
  requireString(perception.description, `${field}.description`, 10_000);
  requireStringArray(perception.constraints, `${field}.constraints`, 64, 2_000);
  if (!Array.isArray(perception.controls) || perception.controls.length < 1 || perception.controls.length > 32) {
    throw new Error(`${field}.controls must contain between 1 and 32 items.`);
  }
  const ids = new Set<string>();
  perception.controls.forEach((rawControl, index) => {
    const control = requireRecord(rawControl, `${field}.controls[${index}]`, 7);
    assertExactKeys(control, ["id", "label", "description", "min", "max", "step", "defaultValue"], `${field}.controls[${index}]`);
    const id = requireSafeIdentifier(control.id, `${field}.controls[${index}].id`, 128);
    if (ids.has(id)) throw new Error(`${field}.controls contains duplicate id "${id}".`);
    ids.add(id);
    requireString(control.label, `${field}.controls[${index}].label`, 300);
    requireString(control.description, `${field}.controls[${index}].description`, 2_000);
    const minimum = requireFinite(control.min, `${field}.controls[${index}].min`, -1_000, 1_000);
    const maximum = requireFinite(control.max, `${field}.controls[${index}].max`, -1_000, 1_000);
    const step = requireFinite(control.step, `${field}.controls[${index}].step`, Number.MIN_VALUE, 1_000);
    const defaultValue = requireFinite(control.defaultValue, `${field}.controls[${index}].defaultValue`, -1_000, 1_000);
    if (minimum >= maximum || step > maximum - minimum || defaultValue < minimum || defaultValue > maximum) {
      throw new Error(`${field}.controls[${index}] has an invalid range.`);
    }
  });
};

const validateDrawing = (value: unknown): void => {
  const field = "snapshot.manifest.drawing";
  const drawing = requireRecord(value, field, 5);
  assertExactKeys(drawing, ["description", "constraints", "palette", "preferredFormats", "ability"], field);
  requireString(drawing.description, `${field}.description`, 10_000);
  requireStringArray(drawing.constraints, `${field}.constraints`, 64, 2_000);
  const palette = requireStringArray(drawing.palette, `${field}.palette`, 16, 100);
  if (palette.length < 2) throw new Error(`${field}.palette must contain at least two colors.`);
  const preferred = requireStringArray(drawing.preferredFormats, `${field}.preferredFormats`, 3, 30);
  if (
    preferred.length === 0 ||
    preferred.some((format) => !["svg", "procedural", "raster-reference"].includes(format)) ||
    new Set(preferred).size !== preferred.length
  ) {
    throw new Error(`${field}.preferredFormats is invalid.`);
  }

  const ability = requireRecord(drawing.ability, `${field}.ability`, 9);
  assertExactKeys(
    ability,
    ["styleName", "styleDescription", "favoredPrimitives", "markBehavior", "compositionBehavior", "correctionBehavior", "skill", "limitations", "practice"],
    `${field}.ability`,
  );
  requireString(ability.styleName, `${field}.ability.styleName`, 300);
  requireString(ability.styleDescription, `${field}.ability.styleDescription`, 2_000);
  requireStringArray(ability.favoredPrimitives, `${field}.ability.favoredPrimitives`, 32, 300);
  requireString(ability.markBehavior, `${field}.ability.markBehavior`, 2_000);
  requireString(ability.compositionBehavior, `${field}.ability.compositionBehavior`, 2_000);
  requireString(ability.correctionBehavior, `${field}.ability.correctionBehavior`, 2_000);
  requireStringArray(ability.limitations, `${field}.ability.limitations`, 32, 1_000);
  const skill = requireRecord(ability.skill, `${field}.ability.skill`, 6);
  const skillKeys = ["observationalAccuracy", "proportionAccuracy", "anatomicalCoherence", "lineControl", "detailCapacity", "spatialCoherence"] as const;
  assertExactKeys(skill, skillKeys, `${field}.ability.skill`);
  for (const key of skillKeys) requireUnitInterval(skill[key], `${field}.ability.skill.${key}`);
  validatePractice(ability.practice, `${field}.ability.practice`);
};

export const validatePersistedManifest = (value: unknown): IndividualManifest => {
  const manifest = requireRecord(value, "snapshot.manifest", 8);
  assertExactKeys(
    manifest,
    ["schemaVersion", "id", "displayName", "statement", "identity", "perception", "drawing", "cadence"],
    "snapshot.manifest",
  );
  if (manifest.schemaVersion !== 4) throw new Error("Unsupported manifest schema version.");
  requireSafeIdentifier(manifest.id, "snapshot.manifest.id", 128);
  requireString(manifest.displayName, "snapshot.manifest.displayName", 200);
  requireString(manifest.statement, "snapshot.manifest.statement", 10_000);
  validateIdentity(manifest.identity);
  validatePerception(manifest.perception);
  validateDrawing(manifest.drawing);
  const cadence = requireRecord(manifest.cadence, "snapshot.manifest.cadence", 1);
  assertExactKeys(cadence, ["minimumCycleIntervalMs"], "snapshot.manifest.cadence");
  requireInteger(cadence.minimumCycleIntervalMs, "snapshot.manifest.cadence.minimumCycleIntervalMs", 0, 365 * 24 * 60 * 60 * 1_000);
  try {
    defineIndividualManifest(manifest as unknown as IndividualManifest);
  } catch (error) {
    throw new Error("snapshot.manifest failed validation.", { cause: error });
  }
  return value as IndividualManifest;
};

export { validatePhysicalSelf };
