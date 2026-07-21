import type {
  AnatomyVisualSpecification,
  ArtPracticeSpecification,
  ArtworkDescriptor,
  FigureDescriptor,
  GeometricAssessment,
  PerceptionEvidence,
  SignedBodyAdjustment,
  SocialFeedbackEvidence,
} from "../core/model";
import {
  assertArtworkDescriptorBounds,
  assertPerceptionEvidenceBounds,
} from "../core/validation/visualEvidence";
import { FIGURE_DIMENSIONS as CORE_FIGURE_DIMENSIONS } from "../core/figureGeometry";
import {
  assertExactKeys,
  requireBoolean,
  requireEnum,
  requireFinite,
  requireInteger,
  requireRecord,
  requireSafeIdentifier,
  requireString,
  requireStringArray,
  requireUnitInterval,
} from "./validationPrimitives";

export const FIGURE_DIMENSIONS = new Set(CORE_FIGURE_DIMENSIONS);
const FACE_SHAPES = new Set(["oval", "square", "elongated"] as const);
const SURFACE_FINISHES = new Set(["matte", "translucent-plate", "threaded"] as const);
const MARK_MODES = new Set(["continuous-contour", "assembled-planes", "repeated-gesture"] as const);
const COMPOSITION_MODES = new Set(["isolated-frontal", "low-grounded", "spine-centered"] as const);
const CORRECTION_MODES = new Set(["adjacent-line", "overpaint-plane", "repeated-pass"] as const);
const ADJUSTMENT_BASES = new Set(["ideal", "social", "self"] as const);

export const validateFigure = (value: unknown, field: string): FigureDescriptor => {
  const figure = requireRecord(value, field, FIGURE_DIMENSIONS.size);
  assertExactKeys(figure, [...FIGURE_DIMENSIONS], field);
  for (const dimension of FIGURE_DIMENSIONS) {
    requireFinite(
      figure[dimension],
      `${field}.${dimension}`,
      dimension === "postureLean" ? -1 : 0,
      1,
    );
  }
  return value as FigureDescriptor;
};

export const validateAnatomy = (
  value: unknown,
  field: string,
): AnatomyVisualSpecification => {
  const anatomy = requireRecord(value, field, 11);
  assertExactKeys(
    anatomy,
    ["faceShape", "eyeSpacing", "noseLength", "mouthWidth", "fingerCountPerHand", "skinColor", "surfaceFinish", "jointContourColor", "chestPlates", "spinalMark"],
    field,
  );
  requireEnum(anatomy.faceShape, FACE_SHAPES, `${field}.faceShape`);
  requireUnitInterval(anatomy.eyeSpacing, `${field}.eyeSpacing`);
  requireUnitInterval(anatomy.noseLength, `${field}.noseLength`);
  requireUnitInterval(anatomy.mouthWidth, `${field}.mouthWidth`);
  requireInteger(anatomy.fingerCountPerHand, `${field}.fingerCountPerHand`, 1, 10);
  requireString(anatomy.skinColor, `${field}.skinColor`, 100);
  requireEnum(anatomy.surfaceFinish, SURFACE_FINISHES, `${field}.surfaceFinish`);
  if (anatomy.jointContourColor !== undefined) {
    requireString(anatomy.jointContourColor, `${field}.jointContourColor`, 100);
  }
  if (anatomy.chestPlates !== undefined) {
    const plates = requireRecord(anatomy.chestPlates, `${field}.chestPlates`, 3);
    assertExactKeys(plates, ["count", "color", "opacity"], `${field}.chestPlates`);
    requireInteger(plates.count, `${field}.chestPlates.count`, 1, 16);
    requireString(plates.color, `${field}.chestPlates.color`, 100);
    requireUnitInterval(plates.opacity, `${field}.chestPlates.opacity`);
  }
  if (anatomy.spinalMark !== undefined) {
    const mark = requireRecord(anatomy.spinalMark, `${field}.spinalMark`, 2);
    assertExactKeys(mark, ["color", "width"], `${field}.spinalMark`);
    requireString(mark.color, `${field}.spinalMark.color`, 100);
    requireFinite(mark.width, `${field}.spinalMark.width`, Number.MIN_VALUE, 20);
  }
  return value as AnatomyVisualSpecification;
};

export const validatePractice = (
  value: unknown,
  field: string,
): ArtPracticeSpecification => {
  const practice = requireRecord(value, field, 10);
  assertExactKeys(
    practice,
    ["markMode", "compositionMode", "correctionMode", "lineLiftAllowed", "erasureAllowed", "minimumRepetitions", "detailSuppression", "curveQuantization", "overlapSimplification"],
    field,
  );
  requireEnum(practice.markMode, MARK_MODES, `${field}.markMode`);
  requireEnum(practice.compositionMode, COMPOSITION_MODES, `${field}.compositionMode`);
  requireEnum(practice.correctionMode, CORRECTION_MODES, `${field}.correctionMode`);
  requireBoolean(practice.lineLiftAllowed, `${field}.lineLiftAllowed`);
  requireBoolean(practice.erasureAllowed, `${field}.erasureAllowed`);
  requireInteger(practice.minimumRepetitions, `${field}.minimumRepetitions`, 1, 8);
  requireUnitInterval(practice.detailSuppression, `${field}.detailSuppression`);
  requireUnitInterval(practice.curveQuantization, `${field}.curveQuantization`);
  requireUnitInterval(practice.overlapSimplification, `${field}.overlapSimplification`);
  return value as ArtPracticeSpecification;
};

export const validateBodyAdjustments = (
  value: unknown,
  field: string,
): readonly SignedBodyAdjustment[] => {
  if (!Array.isArray(value) || value.length > FIGURE_DIMENSIONS.size) {
    throw new Error(`${field} must contain at most ${FIGURE_DIMENSIONS.size} adjustments.`);
  }
  const seen = new Set<string>();
  const adjustments = value.map((raw, index) => {
    const adjustment = requireRecord(raw, `${field}[${index}]`, 4);
    assertExactKeys(adjustment, ["dimension", "direction", "magnitude", "basis"], `${field}[${index}]`);
    const dimension = requireEnum(adjustment.dimension, FIGURE_DIMENSIONS, `${field}[${index}].dimension`);
    if (seen.has(dimension)) throw new Error(`${field} contains duplicate dimension "${dimension}".`);
    seen.add(dimension);
    if (adjustment.direction !== -1 && adjustment.direction !== 1) {
      throw new Error(`${field}[${index}].direction must be -1 or 1.`);
    }
    requireFinite(adjustment.magnitude, `${field}[${index}].magnitude`, 0, 0.25);
    requireEnum(adjustment.basis, ADJUSTMENT_BASES, `${field}[${index}].basis`);
    return raw as SignedBodyAdjustment;
  });
  return adjustments;
};

export const validateGeometry = (value: unknown, field: string): GeometricAssessment => {
  const geometry = requireRecord(value, field, 4);
  assertExactKeys(
    geometry,
    ["selfIdealDistance", "socialIdealDistance", "selfSocialDistance", "predictedIdealDistance"],
    field,
  );
  requireFinite(geometry.selfIdealDistance, `${field}.selfIdealDistance`, 0, 1);
  requireFinite(geometry.predictedIdealDistance, `${field}.predictedIdealDistance`, 0, 1);
  if (geometry.socialIdealDistance !== undefined) {
    requireFinite(geometry.socialIdealDistance, `${field}.socialIdealDistance`, 0, 1);
  }
  if (geometry.selfSocialDistance !== undefined) {
    requireFinite(geometry.selfSocialDistance, `${field}.selfSocialDistance`, 0, 1);
  }
  return value as GeometricAssessment;
};

export const validateDescriptor = (value: unknown, field: string): ArtworkDescriptor => {
  assertArtworkDescriptorBounds(value, field);
  return value;
};

export const validatePerceptionEvidence = (value: unknown, field: string): PerceptionEvidence => {
  assertPerceptionEvidenceBounds(value, field);
  return value as PerceptionEvidence;
};

export const validateSocialEvidence = (value: unknown, field: string): SocialFeedbackEvidence => {
  const social = requireRecord(value, field, 8);
  assertExactKeys(
    social,
    ["subjectId", "sourceSelfPortraitId", "contributions", "consensus", "comparisonToSelf", "disagreements", "confidence", "geometry"],
    field,
  );
  requireSafeIdentifier(social.subjectId, `${field}.subjectId`, 128);
  requireSafeIdentifier(social.sourceSelfPortraitId, `${field}.sourceSelfPortraitId`, 256);
  if (!Array.isArray(social.contributions) || social.contributions.length > 16) {
    throw new Error(`${field}.contributions contains too many items.`);
  }
  const portraitIds = new Set<string>();
  const artistIds = new Set<string>();
  social.contributions.forEach((rawContribution, index) => {
    const contribution = requireRecord(rawContribution, `${field}.contributions[${index}]`, 5);
    assertExactKeys(
      contribution,
      ["portraitId", "artistId", "descriptor", "perceptionEvidence", "weight"],
      `${field}.contributions[${index}]`,
    );
    const portraitId = requireSafeIdentifier(contribution.portraitId, `${field}.contributions[${index}].portraitId`, 256);
    const artistId = requireSafeIdentifier(contribution.artistId, `${field}.contributions[${index}].artistId`, 128);
    if (portraitIds.has(portraitId) || artistIds.has(artistId)) {
      throw new Error(`${field}.contributions contains a duplicate portrait or artist.`);
    }
    portraitIds.add(portraitId);
    artistIds.add(artistId);
    validateDescriptor(contribution.descriptor, `${field}.contributions[${index}].descriptor`);
    if (contribution.perceptionEvidence !== undefined) {
      validatePerceptionEvidence(contribution.perceptionEvidence, `${field}.contributions[${index}].perceptionEvidence`);
    }
    requireUnitInterval(contribution.weight, `${field}.contributions[${index}].weight`);
  });
  validateDescriptor(social.consensus, `${field}.consensus`);
  if (!Array.isArray(social.comparisonToSelf) || social.comparisonToSelf.length > FIGURE_DIMENSIONS.size) {
    throw new Error(`${field}.comparisonToSelf contains too many items.`);
  }
  social.comparisonToSelf.forEach((rawDifference, index) => {
    const difference = requireRecord(rawDifference, `${field}.comparisonToSelf[${index}]`, 4);
    assertExactKeys(difference, ["dimension", "selfValue", "socialValue", "delta"], `${field}.comparisonToSelf[${index}]`);
    requireEnum(difference.dimension, FIGURE_DIMENSIONS, `${field}.comparisonToSelf[${index}].dimension`);
    requireFinite(difference.selfValue, `${field}.comparisonToSelf[${index}].selfValue`, -1, 1);
    requireFinite(difference.socialValue, `${field}.comparisonToSelf[${index}].socialValue`, -1, 1);
    requireFinite(difference.delta, `${field}.comparisonToSelf[${index}].delta`, -2, 2);
  });
  if (!Array.isArray(social.disagreements) || social.disagreements.length > FIGURE_DIMENSIONS.size) {
    throw new Error(`${field}.disagreements contains too many items.`);
  }
  social.disagreements.forEach((rawDisagreement, index) => {
    const disagreement = requireRecord(rawDisagreement, `${field}.disagreements[${index}]`, 4);
    assertExactKeys(disagreement, ["dimension", "spread", "minimum", "maximum"], `${field}.disagreements[${index}]`);
    requireEnum(disagreement.dimension, FIGURE_DIMENSIONS, `${field}.disagreements[${index}].dimension`);
    requireFinite(disagreement.spread, `${field}.disagreements[${index}].spread`, 0, 2);
    requireFinite(disagreement.minimum, `${field}.disagreements[${index}].minimum`, -1, 1);
    requireFinite(disagreement.maximum, `${field}.disagreements[${index}].maximum`, -1, 1);
  });
  requireUnitInterval(social.confidence, `${field}.confidence`);
  if (social.geometry !== undefined) validateGeometry(social.geometry, `${field}.geometry`);
  return value as SocialFeedbackEvidence;
};
