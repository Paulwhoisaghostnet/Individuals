import type {
  AnatomyVisualSpecification,
  ArtPracticeSpecification,
  ArtworkDescriptor,
  FigureDescriptor,
  GeometricAssessment,
  OpticalCalibrationEvidence,
  PerceptionEvidence,
  RenderingDescriptor,
  SocialFeedbackEvidence,
} from "../model";
import { FIGURE_DIMENSIONS } from "../figureGeometry";
import { assertOpticalCalibration } from "../opticalCalibration";
import {
  requireBoundedStringArray,
  requireBoundedText,
  requireExactKeys,
  requireFinite,
  requireRecord,
  requireRouteId,
  requireUnit,
  requireUtcTimestamp,
} from "./primitives";

const FIGURE_DIMENSION_SET = new Set(FIGURE_DIMENSIONS);
const RENDERING_DIMENSIONS = new Set<keyof RenderingDescriptor>([
  "edgeEmphasis", "interiorVisibility", "fragmentation", "sampleRetention",
  "temporalLag", "echoCount", "echoSpacing", "stillnessVisibility",
]);
const EFFECT_OPERATIONS = new Set(["increase", "decrease", "quantize", "offset", "repeat", "omit"]);
const FACE_SHAPES = new Set(["oval", "square", "elongated"]);
const SURFACE_FINISHES = new Set(["matte", "translucent-plate", "threaded"]);
const MARK_MODES = new Set(["continuous-contour", "assembled-planes", "repeated-gesture"]);
const COMPOSITION_MODES = new Set(["isolated-frontal", "low-grounded", "spine-centered"]);
const CORRECTION_MODES = new Set(["adjacent-line", "overpaint-plane", "repeated-pass"]);

const validateFigure = (value: unknown, field: string): FigureDescriptor => {
  const figure = requireRecord(value, field);
  requireExactKeys(figure, [...FIGURE_DIMENSIONS], [], field);
  for (const dimension of FIGURE_DIMENSIONS) {
    requireFinite(figure[dimension], `${field}.${dimension}`, dimension === "postureLean" ? -1 : 0, 1);
  }
  return value as FigureDescriptor;
};

const validateRendering = (value: unknown, field: string): RenderingDescriptor => {
  const rendering = requireRecord(value, field);
  requireExactKeys(rendering, [...RENDERING_DIMENSIONS], [], field);
  for (const dimension of RENDERING_DIMENSIONS) {
    const maximum = dimension === "echoCount" ? 8 : dimension === "echoSpacing" ? 32 : 1;
    const result = requireFinite(rendering[dimension], `${field}.${dimension}`, 0, maximum);
    if (dimension === "echoCount" && !Number.isInteger(result)) {
      throw new Error(`${field}.echoCount must be an integer.`);
    }
  }
  return value as RenderingDescriptor;
};

const validateAnatomy = (value: unknown, field: string): AnatomyVisualSpecification => {
  const anatomy = requireRecord(value, field);
  requireExactKeys(
    anatomy,
    ["faceShape", "eyeSpacing", "noseLength", "mouthWidth", "fingerCountPerHand", "skinColor", "surfaceFinish"],
    ["jointContourColor", "chestPlates", "spinalMark"],
    field,
  );
  if (typeof anatomy.faceShape !== "string" || !FACE_SHAPES.has(anatomy.faceShape)) throw new Error(`${field}.faceShape is unsupported.`);
  if (typeof anatomy.surfaceFinish !== "string" || !SURFACE_FINISHES.has(anatomy.surfaceFinish)) throw new Error(`${field}.surfaceFinish is unsupported.`);
  requireUnit(anatomy.eyeSpacing, `${field}.eyeSpacing`);
  requireUnit(anatomy.noseLength, `${field}.noseLength`);
  requireUnit(anatomy.mouthWidth, `${field}.mouthWidth`);
  if (!Number.isInteger(anatomy.fingerCountPerHand) || (anatomy.fingerCountPerHand as number) < 1 || (anatomy.fingerCountPerHand as number) > 10) {
    throw new Error(`${field}.fingerCountPerHand is outside accepted bounds.`);
  }
  requireBoundedText(anatomy.skinColor, `${field}.skinColor`, 64);
  if (anatomy.jointContourColor !== undefined) requireBoundedText(anatomy.jointContourColor, `${field}.jointContourColor`, 64);
  if (anatomy.chestPlates !== undefined) {
    const plates = requireRecord(anatomy.chestPlates, `${field}.chestPlates`);
    requireExactKeys(plates, ["count", "color", "opacity"], [], `${field}.chestPlates`);
    if (!Number.isInteger(plates.count) || (plates.count as number) < 1 || (plates.count as number) > 16) throw new Error(`${field}.chestPlates.count is outside accepted bounds.`);
    requireBoundedText(plates.color, `${field}.chestPlates.color`, 64);
    requireUnit(plates.opacity, `${field}.chestPlates.opacity`);
  }
  if (anatomy.spinalMark !== undefined) {
    const mark = requireRecord(anatomy.spinalMark, `${field}.spinalMark`);
    requireExactKeys(mark, ["color", "width"], [], `${field}.spinalMark`);
    requireBoundedText(mark.color, `${field}.spinalMark.color`, 64);
    requireFinite(mark.width, `${field}.spinalMark.width`, 0.1, 20);
  }
  return value as AnatomyVisualSpecification;
};

const validatePractice = (value: unknown, field: string): ArtPracticeSpecification => {
  const practice = requireRecord(value, field);
  requireExactKeys(
    practice,
    ["markMode", "compositionMode", "correctionMode", "lineLiftAllowed", "erasureAllowed", "minimumRepetitions", "detailSuppression", "curveQuantization", "overlapSimplification"],
    [],
    field,
  );
  if (typeof practice.markMode !== "string" || !MARK_MODES.has(practice.markMode)) throw new Error(`${field}.markMode is unsupported.`);
  if (typeof practice.compositionMode !== "string" || !COMPOSITION_MODES.has(practice.compositionMode)) throw new Error(`${field}.compositionMode is unsupported.`);
  if (typeof practice.correctionMode !== "string" || !CORRECTION_MODES.has(practice.correctionMode)) throw new Error(`${field}.correctionMode is unsupported.`);
  if (typeof practice.lineLiftAllowed !== "boolean" || typeof practice.erasureAllowed !== "boolean") throw new Error(`${field} boolean controls are invalid.`);
  if (!Number.isInteger(practice.minimumRepetitions) || (practice.minimumRepetitions as number) < 1 || (practice.minimumRepetitions as number) > 8) throw new Error(`${field}.minimumRepetitions is outside accepted bounds.`);
  requireUnit(practice.detailSuppression, `${field}.detailSuppression`);
  requireUnit(practice.curveQuantization, `${field}.curveQuantization`);
  requireUnit(practice.overlapSimplification, `${field}.overlapSimplification`);
  return value as ArtPracticeSpecification;
};

export const assertArtworkDescriptorBounds: (
  value: unknown,
  field?: string,
) => asserts value is ArtworkDescriptor = (
  value: unknown,
  field = "portrait.descriptor",
): asserts value is ArtworkDescriptor => {
  const descriptor = requireRecord(value, field);
  requireExactKeys(
    descriptor,
    ["schemaVersion", "figure", "rendering", "features", "omittedFeatures", "styleName", "primitives", "confidence"],
    ["anatomy", "practice"],
    field,
  );
  if (descriptor.schemaVersion !== 1) throw new Error(`${field}.schemaVersion is unsupported.`);
  validateFigure(descriptor.figure, `${field}.figure`);
  validateRendering(descriptor.rendering, `${field}.rendering`);
  if (!Array.isArray(descriptor.features) || descriptor.features.length > 32) throw new Error(`${field}.features exceeds accepted array bounds.`);
  const labels = new Set<string>();
  descriptor.features.forEach((rawFeature, index) => {
    const feature = requireRecord(rawFeature, `${field}.features[${index}]`);
    requireExactKeys(feature, ["label", "prominence"], ["support"], `${field}.features[${index}]`);
    const label = requireBoundedText(feature.label, `${field}.features[${index}].label`, 300);
    if (labels.has(label)) throw new Error(`${field}.features contains duplicate labels.`);
    labels.add(label);
    requireUnit(feature.prominence, `${field}.features[${index}].prominence`);
    if (feature.support !== undefined) requireUnit(feature.support, `${field}.features[${index}].support`);
  });
  requireBoundedStringArray(descriptor.omittedFeatures, `${field}.omittedFeatures`, 32, 300);
  requireBoundedText(descriptor.styleName, `${field}.styleName`, 300);
  requireBoundedStringArray(descriptor.primitives, `${field}.primitives`, 24, 300);
  requireUnit(descriptor.confidence, `${field}.confidence`);
  if (descriptor.anatomy !== undefined) validateAnatomy(descriptor.anatomy, `${field}.anatomy`);
  if (descriptor.practice !== undefined) validatePractice(descriptor.practice, `${field}.practice`);
};

export const assertPerceptionEvidenceBounds: (
  value: unknown,
  field?: string,
) => asserts value is PerceptionEvidence = (
  value: unknown,
  field = "portrait.observationEvidence",
): asserts value is PerceptionEvidence => {
  const evidence = requireRecord(value, field);
  requireExactKeys(
    evidence,
    ["modelId", "tuning", "source", "perceived", "effects"],
    ["acquisition"],
    field,
  );
  requireBoundedText(evidence.modelId, `${field}.modelId`, 200);
  const tuning = requireRecord(evidence.tuning, `${field}.tuning`);
  if (Object.keys(tuning).length > 32) throw new Error(`${field}.tuning contains too many controls.`);
  for (const [id, rawValue] of Object.entries(tuning)) {
    requireRouteId(id, `${field}.tuning key`, 128);
    requireFinite(rawValue, `${field}.tuning.${id}`, -100, 100);
  }
  assertArtworkDescriptorBounds(evidence.source, `${field}.source`);
  assertArtworkDescriptorBounds(evidence.perceived, `${field}.perceived`);
  if (!Array.isArray(evidence.effects) || evidence.effects.length > 64) throw new Error(`${field}.effects exceeds accepted array bounds.`);
  evidence.effects.forEach((rawEffect, index) => {
    const effect = requireRecord(rawEffect, `${field}.effects[${index}]`);
    requireExactKeys(effect, ["dimension", "operation", "magnitude", "explanation"], [], `${field}.effects[${index}]`);
    if (typeof effect.dimension !== "string" || (!FIGURE_DIMENSION_SET.has(effect.dimension as keyof FigureDescriptor) && !RENDERING_DIMENSIONS.has(effect.dimension as keyof RenderingDescriptor) && effect.dimension !== "features")) throw new Error(`${field}.effects[${index}].dimension is unsupported.`);
    if (typeof effect.operation !== "string" || !EFFECT_OPERATIONS.has(effect.operation)) throw new Error(`${field}.effects[${index}].operation is unsupported.`);
    requireFinite(effect.magnitude, `${field}.effects[${index}].magnitude`, -100, 100);
    requireBoundedText(effect.explanation, `${field}.effects[${index}].explanation`, 1_000);
  });
  if (evidence.acquisition !== undefined) {
    const acquisition = requireRecord(evidence.acquisition, `${field}.acquisition`);
    requireExactKeys(
      acquisition,
      [
        "schemaVersion",
        "sourceKind",
        "sourcePortraitId",
        "sourceId",
        "targetCanvasId",
        "capturedAt",
        "interpreted",
        "calibrated",
        "calibration",
      ],
      [],
      `${field}.acquisition`,
    );
    if (acquisition.schemaVersion !== 1) {
      throw new Error(`${field}.acquisition.schemaVersion is unsupported.`);
    }
    if (
      typeof acquisition.sourceKind !== "string" ||
      !["digital-canvas", "physical-camera", "recorded-fixture"].includes(
        acquisition.sourceKind,
      )
    ) {
      throw new Error(`${field}.acquisition.sourceKind is unsupported.`);
    }
    requireRouteId(acquisition.sourcePortraitId, `${field}.acquisition.sourcePortraitId`);
    requireRouteId(acquisition.sourceId, `${field}.acquisition.sourceId`, 128);
    requireRouteId(acquisition.targetCanvasId, `${field}.acquisition.targetCanvasId`, 128);
    requireUtcTimestamp(
      acquisition.capturedAt,
      `${field}.acquisition.capturedAt`,
    );
    assertArtworkDescriptorBounds(
      acquisition.interpreted,
      `${field}.acquisition.interpreted`,
    );
    assertArtworkDescriptorBounds(
      acquisition.calibrated,
      `${field}.acquisition.calibrated`,
    );
    const calibration = requireRecord(
      acquisition.calibration,
      `${field}.acquisition.calibration`,
    );
    requireExactKeys(
      calibration,
      [
        "focalLengthMm",
        "workingDistanceMeters",
        "ambientIlluminationLux",
        "lensDistortionGain",
      ],
      ["opticalCenterOffsetX", "opticalCenterOffsetY"],
      `${field}.acquisition.calibration`,
    );
    assertOpticalCalibration(
      acquisition.calibration as OpticalCalibrationEvidence,
      `${field}.acquisition.calibration`,
    );
  }
};

const validateGeometry = (value: unknown, field: string): GeometricAssessment => {
  const geometry = requireRecord(value, field);
  requireExactKeys(geometry, ["selfIdealDistance", "predictedIdealDistance"], ["socialIdealDistance", "selfSocialDistance"], field);
  for (const key of ["selfIdealDistance", "predictedIdealDistance", "socialIdealDistance", "selfSocialDistance"] as const) {
    if (geometry[key] !== undefined) requireUnit(geometry[key], `${field}.${key}`);
  }
  return value as GeometricAssessment;
};

export const assertSocialFeedbackEvidenceBounds: (
  value: unknown,
  field?: string,
) => asserts value is SocialFeedbackEvidence = (
  value: unknown,
  field = "portrait.socialEvidence",
): asserts value is SocialFeedbackEvidence => {
  const evidence = requireRecord(value, field);
  requireExactKeys(evidence, ["subjectId", "sourceSelfPortraitId", "contributions", "consensus", "comparisonToSelf", "disagreements", "confidence"], ["geometry"], field);
  requireRouteId(evidence.subjectId, `${field}.subjectId`, 64);
  requireRouteId(evidence.sourceSelfPortraitId, `${field}.sourceSelfPortraitId`);
  if (!Array.isArray(evidence.contributions) || evidence.contributions.length > 16) throw new Error(`${field}.contributions exceeds accepted array bounds.`);
  const portraitIds = new Set<string>();
  const artistIds = new Set<string>();
  evidence.contributions.forEach((rawContribution, index) => {
    const contribution = requireRecord(rawContribution, `${field}.contributions[${index}]`);
    requireExactKeys(contribution, ["portraitId", "artistId", "descriptor", "weight"], ["perceptionEvidence"], `${field}.contributions[${index}]`);
    const portraitId = requireRouteId(contribution.portraitId, `${field}.contributions[${index}].portraitId`);
    const artistId = requireRouteId(contribution.artistId, `${field}.contributions[${index}].artistId`, 64);
    if (portraitIds.has(portraitId) || artistIds.has(artistId)) throw new Error(`${field}.contributions contains duplicate lineage.`);
    portraitIds.add(portraitId);
    artistIds.add(artistId);
    assertArtworkDescriptorBounds(contribution.descriptor, `${field}.contributions[${index}].descriptor`);
    if (contribution.perceptionEvidence !== undefined) assertPerceptionEvidenceBounds(contribution.perceptionEvidence, `${field}.contributions[${index}].perceptionEvidence`);
    requireUnit(contribution.weight, `${field}.contributions[${index}].weight`);
  });
  assertArtworkDescriptorBounds(evidence.consensus, `${field}.consensus`);
  validateDimensionEvidence(evidence.comparisonToSelf, `${field}.comparisonToSelf`, "comparison");
  validateDimensionEvidence(evidence.disagreements, `${field}.disagreements`, "disagreement");
  requireUnit(evidence.confidence, `${field}.confidence`);
  if (evidence.geometry !== undefined) validateGeometry(evidence.geometry, `${field}.geometry`);
};

const validateDimensionEvidence = (
  value: unknown,
  field: string,
  kind: "comparison" | "disagreement",
): void => {
  if (!Array.isArray(value) || value.length > FIGURE_DIMENSIONS.length) throw new Error(`${field} exceeds accepted array bounds.`);
  const dimensions = new Set<string>();
  value.forEach((rawItem, index) => {
    const item = requireRecord(rawItem, `${field}[${index}]`);
    requireExactKeys(item, kind === "comparison" ? ["dimension", "selfValue", "socialValue", "delta"] : ["dimension", "spread", "minimum", "maximum"], [], `${field}[${index}]`);
    if (typeof item.dimension !== "string" || !FIGURE_DIMENSION_SET.has(item.dimension as keyof FigureDescriptor) || dimensions.has(item.dimension)) throw new Error(`${field} has an invalid dimension.`);
    dimensions.add(item.dimension);
    if (kind === "comparison") {
      const minimum = item.dimension === "postureLean" ? -1 : 0;
      requireFinite(item.selfValue, `${field}[${index}].selfValue`, minimum, 1);
      requireFinite(item.socialValue, `${field}[${index}].socialValue`, minimum, 1);
      requireFinite(item.delta, `${field}[${index}].delta`, -2, 2);
    } else {
      requireFinite(item.spread, `${field}[${index}].spread`, 0, 2);
      requireFinite(item.minimum, `${field}[${index}].minimum`, -1, 1);
      requireFinite(item.maximum, `${field}[${index}].maximum`, -1, 1);
    }
  });
};

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const artworkDescriptorsEqual = (left: ArtworkDescriptor, right: ArtworkDescriptor): boolean =>
  canonicalJson(left) === canonicalJson(right);

export const perceptionEvidenceEqual = (left: PerceptionEvidence, right: PerceptionEvidence): boolean =>
  canonicalJson(left) === canonicalJson(right);

export const socialFeedbackEvidenceEqual = (
  left: SocialFeedbackEvidence,
  right: SocialFeedbackEvidence,
): boolean => canonicalJson(left) === canonicalJson(right);
