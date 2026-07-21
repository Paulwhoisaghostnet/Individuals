import type {
  FigureDimension,
  IndividualManifest,
  SocialFeedbackEvidence,
} from "../core/model";

export const FIGURE_DIMENSION_LABELS: Readonly<Record<FigureDimension, string>> = {
  headAspect: "head proportion",
  shoulderWidth: "shoulder width",
  torsoWidth: "torso width",
  torsoLength: "torso length",
  armLength: "arm length",
  legLength: "leg length",
  openness: "openness of stance",
  verticality: "vertical alignment",
  symmetry: "bilateral symmetry",
  centerX: "placement on the canvas",
  postureLean: "postural lean",
};

const describeDifference = (dimension: FigureDimension, delta: number): string => {
  const direction = delta >= 0 ? "greater" : "less";
  return `Peer evidence returned ${direction} ${FIGURE_DIMENSION_LABELS[dimension]} than the source self-portrait (${delta >= 0 ? "+" : ""}${delta.toFixed(3)}).`;
};

const adjustmentFor = (dimension: FigureDimension, delta: number): string =>
  `Test ${delta >= 0 ? "more" : "less"} ${FIGURE_DIMENSION_LABELS[dimension]} while preserving authored identifying features.`;

export interface CausalPublicLanguage {
  readonly publicFragment: string;
  readonly perceivedDifferences: readonly string[];
  readonly nextBodilyAdjustment: string;
  readonly nextIntention: string;
}

/**
 * Curated public language derived only from manifest metadata and normalized
 * numeric evidence. Provider prose and memory never enter this function.
 */
export const deriveCausalPublicLanguage = (input: {
  readonly manifest: IndividualManifest;
  readonly cycle: number;
  readonly evidence?: SocialFeedbackEvidence;
}): CausalPublicLanguage => {
  const materialDifferences = (input.evidence?.comparisonToSelf ?? [])
    .filter((difference) => Math.abs(difference.delta) >= 0.008)
    .slice(0, 3);
  const strongest = materialDifferences[0];
  const hasSocialEvidence = (input.evidence?.contributions.length ?? 0) > 0;
  const nextBodilyAdjustment = strongest
    ? adjustmentFor(strongest.dimension, strongest.delta)
    : hasSocialEvidence
      ? "Hold the current body until materially different peer evidence arrives."
      : "Hold the current body until a returned peer image supplies evidence.";

  return {
    publicFragment: `${input.manifest.displayName}, cycle ${input.cycle}: ${hasSocialEvidence ? "the social mirror remains plural" : "a body waits to be answered"}.`,
    perceivedDifferences: hasSocialEvidence
      ? materialDifferences.map((difference) =>
          describeDifference(difference.dimension, difference.delta),
        )
      : ["No returned peer-body evidence was available in this cycle."],
    nextBodilyAdjustment,
    nextIntention: hasSocialEvidence
      ? `In the next portrait, ${nextBodilyAdjustment}`
      : "Repeat the authored silhouette so peers have a stable body to answer.",
  };
};
