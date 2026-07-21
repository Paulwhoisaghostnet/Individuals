import type { FigureDescriptor, IndividualManifest, Trait } from "./model";
import { FIGURE_DIMENSIONS, figureDistance } from "./figureGeometry";

const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const SKILL_DIMENSIONS = [
  "observationalAccuracy", "proportionAccuracy", "anatomicalCoherence",
  "lineControl", "detailCapacity", "spatialCoherence",
] as const;

const assertNonEmpty = (value: string, field: string): void => {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2_000) {
    throw new Error(`Individual manifest field "${field}" cannot be empty.`);
  }
};

const assertSafeId = (value: string, field: string): void => {
  assertNonEmpty(value, field);
  if (!SAFE_ID.test(value) || RESERVED_KEYS.has(value)) {
    throw new Error(`Individual manifest field "${field}" is not a safe identifier.`);
  }
};

const assertTrait = (trait: Trait): void => {
  assertNonEmpty(trait.name, "identity.traits[].name");
  if (!Number.isFinite(trait.value) || trait.value < 0 || trait.value > 1) {
    throw new Error(`Trait "${trait.name}" must have a value between 0 and 1.`);
  }
};

const assertNonEmptyList = (values: readonly string[], field: string): void => {
  if (!Array.isArray(values) || values.length === 0 || values.length > 64) {
    throw new Error(`Individual manifest field "${field}" must contain at least one value.`);
  }
  values.forEach((value) => assertNonEmpty(value, `${field}[]`));
};

const assertFigure = (figure: FigureDescriptor, field: string): void => {
  if (!figure || typeof figure !== "object") {
    throw new Error(`Individual manifest field "${field}" is required.`);
  }
  if (
    Object.keys(figure).length !== FIGURE_DIMENSIONS.length ||
    FIGURE_DIMENSIONS.some((dimension) => !Object.hasOwn(figure, dimension))
  ) {
    throw new Error(`Individual manifest field "${field}" must define the exact figure schema.`);
  }
  for (const dimension of FIGURE_DIMENSIONS) {
    const value = figure[dimension];
    const minimum = dimension === "postureLean" ? -1 : 0;
    if (!Number.isFinite(value) || value < minimum || value > 1) {
      throw new Error(
        `Individual manifest field "${field}.${dimension}" must be finite and between ${minimum} and 1.`,
      );
    }
  }
};

const assertUnitInterval = (value: number, field: string): void => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Individual manifest field "${field}" must be between 0 and 1.`);
  }
};

export const defineIndividualManifest = <T extends IndividualManifest>(manifest: T): T => {
  if (manifest.schemaVersion !== 4) throw new Error("Unsupported Individual manifest schemaVersion.");
  assertSafeId(manifest.id, "id");
  assertNonEmpty(manifest.displayName, "displayName");
  assertNonEmpty(manifest.statement, "statement");
  assertNonEmpty(manifest.identity.origin, "identity.origin");
  assertNonEmpty(manifest.identity.privateNarrative, "identity.privateNarrative");
  assertNonEmpty(manifest.identity.idealSelf.narrative, "identity.idealSelf.narrative");
  assertNonEmptyList(manifest.identity.idealSelf.values, "identity.idealSelf.values");
  assertNonEmptyList(manifest.identity.idealSelf.visualAnchors, "identity.idealSelf.visualAnchors");
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
  const visual = manifest.identity.idealPhysicalForm.visualSpecification;
  if (!visual) {
    throw new Error(
      'Individual manifest field "identity.idealPhysicalForm.visualSpecification" is required.',
    );
  }
  assertFigure(visual.figure, "identity.idealPhysicalForm.visualSpecification.figure");
  const anatomy = visual.anatomy;
  if (!anatomy || !["oval", "square", "elongated"].includes(anatomy.faceShape)) {
    throw new Error("idealPhysicalForm.visualSpecification.anatomy.faceShape is invalid.");
  }
  assertUnitInterval(anatomy.eyeSpacing, "idealPhysicalForm.visualSpecification.anatomy.eyeSpacing");
  assertUnitInterval(anatomy.noseLength, "idealPhysicalForm.visualSpecification.anatomy.noseLength");
  assertUnitInterval(anatomy.mouthWidth, "idealPhysicalForm.visualSpecification.anatomy.mouthWidth");
  if (!Number.isInteger(anatomy.fingerCountPerHand) || anatomy.fingerCountPerHand < 1 || anatomy.fingerCountPerHand > 10) {
    throw new Error("idealPhysicalForm.visualSpecification.anatomy.fingerCountPerHand is invalid.");
  }
  assertNonEmpty(anatomy.skinColor, "idealPhysicalForm.visualSpecification.anatomy.skinColor");
  if (!(["matte", "translucent-plate", "threaded"] as const).includes(anatomy.surfaceFinish)) {
    throw new Error("idealPhysicalForm.visualSpecification.anatomy.surfaceFinish is invalid.");
  }
  if (anatomy.chestPlates) {
    if (!Number.isInteger(anatomy.chestPlates.count) || anatomy.chestPlates.count < 1 || anatomy.chestPlates.count > 16) {
      throw new Error("idealPhysicalForm.visualSpecification.anatomy.chestPlates.count is invalid.");
    }
    assertNonEmpty(anatomy.chestPlates.color, "idealPhysicalForm.visualSpecification.anatomy.chestPlates.color");
    assertUnitInterval(anatomy.chestPlates.opacity, "idealPhysicalForm.visualSpecification.anatomy.chestPlates.opacity");
  }
  if (anatomy.spinalMark) {
    assertNonEmpty(anatomy.spinalMark.color, "idealPhysicalForm.visualSpecification.anatomy.spinalMark.color");
    if (!Number.isFinite(anatomy.spinalMark.width) || anatomy.spinalMark.width <= 0 || anatomy.spinalMark.width > 20) {
      throw new Error("idealPhysicalForm.visualSpecification.anatomy.spinalMark.width is invalid.");
    }
  }
  assertNonEmpty(
    manifest.identity.initialPhysicalSelf.description,
    "identity.initialPhysicalSelf.description",
  );
  const embodiedPrior = manifest.identity.initialPhysicalSelf.bodyBelief;
  if (!embodiedPrior) {
    throw new Error(
      'Individual manifest field "identity.initialPhysicalSelf.bodyBelief" is required.',
    );
  }
  assertFigure(embodiedPrior, "identity.initialPhysicalSelf.bodyBelief");
  if (figureDistance(embodiedPrior, visual.figure) < 0.005) {
    throw new Error(
      "initialPhysicalSelf.bodyBelief must retain a material geometric tension from the ideal form.",
    );
  }
  if (
    !Number.isFinite(manifest.identity.initialPhysicalSelf.perceivedSimilarity) ||
    manifest.identity.initialPhysicalSelf.perceivedSimilarity < 0 ||
    manifest.identity.initialPhysicalSelf.perceivedSimilarity > 1
  ) {
    throw new Error("initialPhysicalSelf.perceivedSimilarity must be between 0 and 1.");
  }
  if (!Array.isArray(manifest.identity.traits) || manifest.identity.traits.length === 0 || manifest.identity.traits.length > 64) {
    throw new Error("identity.traits must contain between 1 and 64 traits.");
  }
  manifest.identity.traits.forEach(assertTrait);
  if (new Set(manifest.identity.traits.map((trait) => trait.name)).size !== manifest.identity.traits.length) {
    throw new Error("identity.traits contains duplicate names.");
  }

  const disp = manifest.identity.socialDisposition;
  if (!disp) {
    throw new Error('Individual manifest field "identity.socialDisposition" is required.');
  }
  assertUnitInterval(disp.selfIntegrity, "identity.socialDisposition.selfIntegrity");
  assertUnitInterval(disp.socialPermeability, "identity.socialDisposition.socialPermeability");
  assertUnitInterval(disp.needForRecognition, "identity.socialDisposition.needForRecognition");
  assertUnitInterval(disp.resistance, "identity.socialDisposition.resistance");
  assertUnitInterval(disp.curiosity, "identity.socialDisposition.curiosity");
  if (disp.trustByPeer) {
    if (typeof disp.trustByPeer !== "object" || Object.keys(disp.trustByPeer).length > 64) {
      throw new Error("identity.socialDisposition.trustByPeer is invalid.");
    }
    for (const [peerId, trust] of Object.entries(disp.trustByPeer)) {
      assertSafeId(peerId, `identity.socialDisposition.trustByPeer.${peerId}`);
      assertUnitInterval(trust, `identity.socialDisposition.trustByPeer.${peerId}`);
    }
  }

  if (!Number.isSafeInteger(manifest.cadence.minimumCycleIntervalMs) || manifest.cadence.minimumCycleIntervalMs < 0) {
    throw new Error("minimumCycleIntervalMs cannot be negative.");
  }

  assertNonEmpty(manifest.perception.modelId, "perception.modelId");
  assertNonEmpty(manifest.perception.modelName, "perception.modelName");
  if (!Array.isArray(manifest.perception.controls) || manifest.perception.controls.length === 0 || manifest.perception.controls.length > 32) {
    throw new Error('Individual manifest field "perception.controls" must define at least one control.');
  }
  const controlIds = new Set<string>();
  for (const control of manifest.perception.controls) {
    assertSafeId(control.id, "perception.controls[].id");
    assertNonEmpty(control.label, "perception.controls[].label");
    assertNonEmpty(control.description, "perception.controls[].description");
    if (controlIds.has(control.id)) {
      throw new Error(`Duplicate perception control id "${control.id}".`);
    }
    controlIds.add(control.id);
    if (
      !Number.isFinite(control.min) ||
      !Number.isFinite(control.max) ||
      !Number.isFinite(control.step) ||
      !Number.isFinite(control.defaultValue) ||
      control.min >= control.max ||
      control.step <= 0
    ) {
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
  if (
    !ability.skill ||
    Object.keys(ability.skill).length !== SKILL_DIMENSIONS.length ||
    SKILL_DIMENSIONS.some((dimension) => !Object.hasOwn(ability.skill, dimension))
  ) {
    throw new Error("drawing.ability.skill must define the exact skill schema.");
  }
  for (const name of SKILL_DIMENSIONS) {
    assertUnitInterval(ability.skill[name], `drawing.ability.skill.${name}`);
  }
  const practice = ability.practice;
  if (!practice) throw new Error('Individual manifest field "drawing.ability.practice" is required.');
  if (!(["continuous-contour", "assembled-planes", "repeated-gesture"] as const).includes(practice.markMode)) {
    throw new Error("drawing.ability.practice.markMode is invalid.");
  }
  if (!(["isolated-frontal", "low-grounded", "spine-centered"] as const).includes(practice.compositionMode)) {
    throw new Error("drawing.ability.practice.compositionMode is invalid.");
  }
  if (!(["adjacent-line", "overpaint-plane", "repeated-pass"] as const).includes(practice.correctionMode)) {
    throw new Error("drawing.ability.practice.correctionMode is invalid.");
  }
  if (!Number.isInteger(practice.minimumRepetitions) || practice.minimumRepetitions < 1 || practice.minimumRepetitions > 8) {
    throw new Error("drawing.ability.practice.minimumRepetitions is invalid.");
  }
  assertUnitInterval(practice.detailSuppression, "drawing.ability.practice.detailSuppression");
  assertUnitInterval(practice.curveQuantization, "drawing.ability.practice.curveQuantization");
  assertUnitInterval(practice.overlapSimplification, "drawing.ability.practice.overlapSimplification");
  if (typeof practice.lineLiftAllowed !== "boolean" || typeof practice.erasureAllowed !== "boolean") {
    throw new Error("drawing.ability.practice boolean controls are invalid.");
  }
  if (!Array.isArray(manifest.drawing.palette) || manifest.drawing.palette.length < 2 || manifest.drawing.palette.length > 16) {
    throw new Error("drawing.palette must contain between 2 and 16 colors.");
  }
  manifest.drawing.palette.forEach((color) => assertNonEmpty(color, "drawing.palette[]"));
  if (
    !Array.isArray(manifest.drawing.preferredFormats) ||
    manifest.drawing.preferredFormats.length === 0 ||
    manifest.drawing.preferredFormats.length > 3 ||
    manifest.drawing.preferredFormats.some(
      (format) => !["svg", "procedural", "raster-reference"].includes(format),
    )
  ) {
    throw new Error("drawing.preferredFormats is invalid.");
  }

  return manifest;
};
