import type {
  ArtworkDescriptor,
  FigureDescriptor,
  Portrait,
  RenderingDescriptor,
  SocialFeedbackEvidence,
} from "./model";
import {
  FIGURE_DIMENSIONS,
  clampFigureDimension,
  figureDistance,
} from "./figureGeometry";
import { applyOpticalCalibration } from "./opticalCalibration";
import {
  artworkDescriptorsEqual,
  perceptionEvidenceEqual,
  socialFeedbackEvidenceEqual,
} from "./validation/visualEvidence";

const RENDERING_DIMENSIONS: readonly (keyof RenderingDescriptor)[] = [
  "edgeEmphasis",
  "interiorVisibility",
  "fragmentation",
  "sampleRetention",
  "temporalLag",
  "echoCount",
  "echoSpacing",
  "stillnessVisibility",
];

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));
const roundEvidence = (value: number): number => Number(value.toFixed(4));

const descriptorFor = (portrait: Portrait): ArtworkDescriptor => {
  if (!portrait.descriptor) {
    throw new Error(`Portrait "${portrait.id}" lacks a structured descriptor.`);
  }
  return portrait.descriptor;
};

const weightedMean = (
  values: readonly { readonly value: number; readonly weight: number }[],
): number => {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
};

const consensusDescriptor = (
  portraits: readonly Portrait[],
  descriptors: readonly ArtworkDescriptor[],
): ArtworkDescriptor => {
  const weights = descriptors.map((descriptor) => Math.max(0.05, descriptor.confidence));
  const figure = Object.fromEntries(
    FIGURE_DIMENSIONS.map((dimension) => [
      dimension,
      roundEvidence(
        clampFigureDimension(
          dimension,
          weightedMean(
            descriptors.map((descriptor, index) => ({
              value: descriptor.figure[dimension],
              weight: weights[index],
            })),
          ),
        ),
      ),
    ]),
  ) as unknown as FigureDescriptor;
  const averagedRendering = Object.fromEntries(
    RENDERING_DIMENSIONS.map((dimension) => [
      dimension,
      roundEvidence(
        weightedMean(
          descriptors.map((descriptor, index) => ({
            value: descriptor.rendering[dimension],
            weight: weights[index],
          })),
        ),
      ),
    ]),
  ) as unknown as RenderingDescriptor;
  const rendering: RenderingDescriptor = {
    ...averagedRendering,
    echoCount: Math.max(1, Math.min(8, Math.round(averagedRendering.echoCount))),
  };

  const featureMap = new Map<string, { total: number; weight: number }>();
  const totalContributorWeight = weights.reduce((sum, weight) => sum + weight, 0);
  descriptors.forEach((descriptor, descriptorIndex) => {
    for (const feature of descriptor.features) {
      const aggregate = featureMap.get(feature.label) ?? { total: 0, weight: 0 };
      const weight = weights[descriptorIndex];
      aggregate.total += feature.prominence * weight;
      aggregate.weight += weight;
      featureMap.set(feature.label, aggregate);
    }
  });

  return {
    schemaVersion: 1,
    figure,
    rendering,
    features: [...featureMap.entries()]
      .map(([label, aggregate]) => ({
        label,
        prominence: roundEvidence(
          clampUnit(aggregate.total / Math.max(0.05, totalContributorWeight)),
        ),
        support: roundEvidence(
          clampUnit(aggregate.weight / Math.max(0.05, totalContributorWeight)),
        ),
      }))
      .sort(
        (left, right) =>
          right.prominence - left.prominence || left.label.localeCompare(right.label),
      ),
    omittedFeatures: [...new Set(descriptors.flatMap((descriptor) => descriptor.omittedFeatures))],
    styleName: "collective social composite",
    primitives: [...new Set(descriptors.flatMap((descriptor) => descriptor.primitives))],
    confidence: roundEvidence(
      clampUnit(
        weightedMean(
          descriptors.map((descriptor, index) => ({
            value: descriptor.confidence,
            weight: weights[index],
          })),
        ) * Math.min(1, 0.5 + portraits.length * 0.2),
      ),
    ),
  };
};

/**
 * Canonical social-evidence algorithm shared by the compositor and the engine
 * boundary. A compositor is therefore not trusted to assert its own consensus.
 */
export const buildSocialFeedbackEvidence = (input: {
  readonly subjectId: string;
  readonly portraits: readonly Portrait[];
  readonly sourceSelfPortrait: Portrait;
  readonly idealFigure?: FigureDescriptor;
}): SocialFeedbackEvidence => {
  if (input.portraits.length === 0) {
    throw new Error("Social feedback evidence requires at least one peer portrait.");
  }
  const descriptors = input.portraits.map(descriptorFor);
  const consensus = consensusDescriptor(input.portraits, descriptors);
  const selfDescriptor = descriptorFor(input.sourceSelfPortrait);
  const comparisonToSelf = FIGURE_DIMENSIONS.map((dimension) => ({
    dimension,
    selfValue: roundEvidence(selfDescriptor.figure[dimension]),
    socialValue: roundEvidence(consensus.figure[dimension]),
    delta: roundEvidence(consensus.figure[dimension] - selfDescriptor.figure[dimension]),
  })).sort(
    (left, right) =>
      Math.abs(right.delta) - Math.abs(left.delta) ||
      left.dimension.localeCompare(right.dimension),
  );
  const disagreements = FIGURE_DIMENSIONS.map((dimension) => {
    const values = descriptors.map((descriptor) => descriptor.figure[dimension]);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    return {
      dimension,
      spread: roundEvidence(maximum - minimum),
      minimum: roundEvidence(minimum),
      maximum: roundEvidence(maximum),
    };
  }).sort(
    (left, right) =>
      right.spread - left.spread || left.dimension.localeCompare(right.dimension),
  );

  return {
    subjectId: input.subjectId,
    sourceSelfPortraitId: input.sourceSelfPortrait.id,
    contributions: input.portraits.map((portrait, index) => ({
      portraitId: portrait.id,
      artistId: portrait.artistId,
      descriptor: descriptors[index],
      perceptionEvidence: portrait.observationEvidence,
      weight: roundEvidence(Math.max(0.05, descriptors[index].confidence)),
    })),
    consensus,
    comparisonToSelf,
    disagreements,
    confidence: consensus.confidence,
    geometry: input.idealFigure
      ? {
          selfIdealDistance: roundEvidence(
            figureDistance(selfDescriptor.figure, input.idealFigure),
          ),
          socialIdealDistance: roundEvidence(
            figureDistance(consensus.figure, input.idealFigure),
          ),
          selfSocialDistance: roundEvidence(
            figureDistance(selfDescriptor.figure, consensus.figure),
          ),
          predictedIdealDistance: roundEvidence(
            figureDistance(selfDescriptor.figure, input.idealFigure),
          ),
        }
      : undefined,
  };
};

/**
 * Verifies semantic social claims against the accepted peer portraits. This is
 * shared by live engine routing and restart validation so a persisted
 * compositor claim never becomes trusted merely by surviving a restart.
 */
export const assertCanonicalSocialPortraitClaims = (input: {
  readonly portrait: Portrait;
  readonly sourceSelfPortrait: Portrait;
  readonly contributorPortraits: readonly Portrait[];
  readonly idealFigure?: FigureDescriptor;
}): void => {
  const evidence = input.portrait.socialEvidence;
  if (!input.portrait.descriptor || !evidence) {
    throw new Error("Social portrait lacks canonical descriptor evidence.");
  }
  const contributorIds = input.contributorPortraits.map((portrait) => portrait.id);
  if (
    evidence.sourceSelfPortraitId !== input.sourceSelfPortrait.id ||
    input.portrait.sourcePortraitIds.length !== contributorIds.length ||
    input.portrait.sourcePortraitIds.some((id, index) => id !== contributorIds[index])
  ) {
    throw new Error("Social portrait has non-canonical source lineage.");
  }
  for (const contributor of input.contributorPortraits) {
    if (
      !contributor.observationEvidence ||
      !input.sourceSelfPortrait.descriptor ||
      !artworkDescriptorsEqual(
        contributor.observationEvidence.source,
        input.sourceSelfPortrait.descriptor,
      )
    ) {
      throw new Error("Social portrait contribution contradicts its observed source.");
    }
    const acquisition = contributor.observationEvidence.acquisition;
    if (acquisition) {
      const expectedCalibrated = applyOpticalCalibration(
        acquisition.interpreted,
        acquisition.calibration,
      );
      if (
        acquisition.sourcePortraitId !== input.sourceSelfPortrait.id ||
        Date.parse(acquisition.capturedAt) < Date.parse(input.sourceSelfPortrait.createdAt) ||
        !artworkDescriptorsEqual(acquisition.calibrated, expectedCalibrated) ||
        (acquisition.sourceKind === "digital-canvas" &&
          !artworkDescriptorsEqual(
            acquisition.interpreted,
            input.sourceSelfPortrait.descriptor,
          )) ||
        (acquisition.sourceKind === "physical-camera" &&
          artworkDescriptorsEqual(
            acquisition.interpreted,
            input.sourceSelfPortrait.descriptor,
          ))
      ) {
        throw new Error("Social portrait contribution has invalid acquisition evidence.");
      }
    }
  }
  const expected = buildSocialFeedbackEvidence({
    subjectId: input.portrait.subjectId,
    portraits: input.contributorPortraits,
    sourceSelfPortrait: input.sourceSelfPortrait,
    idealFigure: input.idealFigure,
  });
  if (
    !artworkDescriptorsEqual(input.portrait.descriptor, expected.consensus) ||
    !socialFeedbackEvidenceEqual(evidence, expected) ||
    evidence.contributions.some((contribution, index) => {
      const actual = input.contributorPortraits[index]?.observationEvidence;
      return (
        !actual ||
        !contribution.perceptionEvidence ||
        !perceptionEvidenceEqual(contribution.perceptionEvidence, actual)
      );
    })
  ) {
    throw new Error("Social portrait contains non-canonical social claims.");
  }
};
