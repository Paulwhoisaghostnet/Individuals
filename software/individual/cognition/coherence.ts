import type {
  FigureDescriptor,
  GeometricAssessment,
  SignedBodyAdjustment,
  SocialFeedbackEvidence,
} from "../core/model";
import {
  FIGURE_DIMENSIONS,
  adjustmentsToward,
  clampFigureDimension,
  figureDistance,
} from "../core/figureGeometry";

export interface CoherencePressureInput {
  readonly idealFigure: FigureDescriptor;
  /** Authored first-person body prior that remains in tension with the ideal. */
  readonly embodiedPrior: FigureDescriptor;
  readonly currentFigure: FigureDescriptor;
  readonly selfIntegrity: number;
  readonly socialPermeability: number;
  readonly resistance: number;
  readonly curiosity: number;
  readonly evidence?: SocialFeedbackEvidence;
}

export interface CoherencePressure {
  readonly similarityDelta: number;
  readonly currentSimilarity: number;
  readonly predictedSimilarity: number;
  readonly disagreement: number;
  readonly socialDistance: number;
  readonly adjustedFigure: FigureDescriptor;
  readonly nextBodyAdjustments: readonly SignedBodyAdjustment[];
  readonly geometry: GeometricAssessment;
}

/** Computes coherence solely from authored and observed geometry. */
export const calculateCoherencePressure = (input: CoherencePressureInput): CoherencePressure => {
  const social = input.evidence?.consensus.figure;
  const evidenceConfidence = input.evidence?.confidence ?? 0;
  const idealWeight = 0.55 + input.selfIntegrity * 0.75;
  // The ideal is aspirational rather than an absorbing state. An authored
  // embodied prior gives each identity a stable geometric residue; it is not a
  // display cap or time-based oscillation and cannot disappear through repeat
  // cycles without new social evidence.
  const embodiedPriorWeight =
    0.18 + input.resistance * 0.22 + input.selfIntegrity * 0.12;
  const socialWeight = social
    ? input.socialPermeability * (1 - input.resistance * 0.65) * evidenceConfidence
    : 0;
  const target = { ...input.idealFigure };
  for (const dimension of FIGURE_DIMENSIONS) {
    target[dimension] = clampFigureDimension(
      dimension,
      (
        input.idealFigure[dimension] * idealWeight +
        input.embodiedPrior[dimension] * embodiedPriorWeight +
        (social?.[dimension] ?? 0) * socialWeight
      ) / Math.max(0.0001, idealWeight + embodiedPriorWeight + socialWeight),
    );
  }

  const responsiveness = social ? 0.16 + input.curiosity * 0.12 : 0.08;
  const adjustedFigure = { ...input.currentFigure };
  for (const dimension of FIGURE_DIMENSIONS) {
    const range = dimension === "postureLean" ? 2 : 1;
    const change = (target[dimension] - input.currentFigure[dimension]) * responsiveness;
    const maximum = 0.055 * range;
    adjustedFigure[dimension] = clampFigureDimension(
      dimension,
      input.currentFigure[dimension] + Math.max(-maximum, Math.min(maximum, change)),
    );
  }

  const currentIdealDistance = figureDistance(input.currentFigure, input.idealFigure);
  const predictedIdealDistance = figureDistance(adjustedFigure, input.idealFigure);
  const socialIdealDistance = social ? figureDistance(social, input.idealFigure) : undefined;
  const selfSocialDistance = social ? figureDistance(input.currentFigure, social) : undefined;
  const disagreement = input.evidence
    ? input.evidence.disagreements.reduce((sum, item) => sum + item.spread, 0) /
      Math.max(1, input.evidence.disagreements.length)
    : 0;
  const geometry: GeometricAssessment = {
    selfIdealDistance: Number(currentIdealDistance.toFixed(4)),
    socialIdealDistance:
      socialIdealDistance === undefined ? undefined : Number(socialIdealDistance.toFixed(4)),
    selfSocialDistance:
      selfSocialDistance === undefined ? undefined : Number(selfSocialDistance.toFixed(4)),
    predictedIdealDistance: Number(predictedIdealDistance.toFixed(4)),
  };

  return {
    currentSimilarity: Number((1 - currentIdealDistance).toFixed(4)),
    predictedSimilarity: Number((1 - predictedIdealDistance).toFixed(4)),
    similarityDelta: Number((currentIdealDistance - predictedIdealDistance).toFixed(4)),
    disagreement: Number(disagreement.toFixed(4)),
    socialDistance: Number((selfSocialDistance ?? 0).toFixed(4)),
    adjustedFigure,
    nextBodyAdjustments: adjustmentsToward({
      from: adjustedFigure,
      target,
      rate: 0.28,
      basis: social ? "social" : "ideal",
      maximumMagnitude: 0.035,
    }),
    geometry,
  };
};
