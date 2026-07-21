import type {
  ArtworkDescriptor,
  FigureDescriptor,
  PerceptionEffectEvidence,
  PerceptionEvidence,
} from "../core/model";
import {
  clampSigned,
  clampUnit,
  normalizeFigure,
  roundEvidence,
} from "../drawing/figureDescriptor";
import { stableNoise } from "../core/deterministic";
import {
  perceiveBoundaryAnatomy,
  perceiveGenericAnatomy,
  perceiveMosaicAnatomy,
  perceiveMotionAnatomy,
} from "./anatomyPerception";

interface PerceptionModelInput {
  readonly modelId: string;
  readonly source: ArtworkDescriptor;
  readonly tuning: Readonly<Record<string, number>>;
  readonly observationKey: string;
}

const control = (
  tuning: Readonly<Record<string, number>>,
  id: string,
  fallback: number,
): number => tuning[id] ?? fallback;

const withFigure = (
  source: ArtworkDescriptor,
  figure: FigureDescriptor,
  changes: Partial<ArtworkDescriptor> = {},
): ArtworkDescriptor => ({
  ...source,
  ...changes,
  figure: normalizeFigure(figure),
  rendering: changes.rendering ?? source.rendering,
  features: changes.features ?? source.features,
  omittedFeatures: changes.omittedFeatures ?? source.omittedFeatures,
});

const boundaryLock = (input: PerceptionModelInput): PerceptionEvidence => {
  const edgeGain = clampUnit(control(input.tuning, "edge-gain", 0.78));
  const interiorLoss = clampUnit(control(input.tuning, "interior-loss", 0.64));
  const symmetryPull = clampUnit(control(input.tuning, "symmetry-pull", 0.42));
  const perceived = withFigure(
    input.source,
    {
      ...input.source.figure,
      symmetry: input.source.figure.symmetry + (1 - input.source.figure.symmetry) * symmetryPull,
      postureLean: input.source.figure.postureLean * (1 - symmetryPull * 0.88),
      centerX: input.source.figure.centerX + (0.5 - input.source.figure.centerX) * symmetryPull,
    },
    {
      rendering: {
        ...input.source.rendering,
        edgeEmphasis: roundEvidence(0.3 + edgeGain * 0.7),
        interiorVisibility: roundEvidence(clampUnit(1 - interiorLoss * 0.9)),
      },
      features: input.source.features.map((feature) => ({
        ...feature,
        prominence: roundEvidence(clampUnit(feature.prominence * (1 - interiorLoss * 0.65))),
      })),
      anatomy: perceiveBoundaryAnatomy(
        input.source.anatomy,
        interiorLoss,
        symmetryPull,
      ),
    },
  );
  const effects: PerceptionEffectEvidence[] = [
    {
      dimension: "edgeEmphasis",
      operation: "increase",
      magnitude: edgeGain,
      explanation: "Boundary lock assigns certainty to the outer contour.",
    },
    {
      dimension: "interiorVisibility",
      operation: "decrease",
      magnitude: interiorLoss,
      explanation: "Interior surface information falls away behind the contour.",
    },
    {
      dimension: "symmetry",
      operation: "increase",
      magnitude: symmetryPull,
      explanation: "Irregular anatomy is pulled toward a bilateral reading.",
    },
  ];
  return { modelId: input.modelId, tuning: input.tuning, source: input.source, perceived, effects };
};

const quantize = (value: number, step: number): number => Math.round(value / step) * step;

const deferredMosaic = (input: PerceptionModelInput): PerceptionEvidence => {
  const retention = clampUnit(control(input.tuning, "retention", 0.38));
  const fragmentScale = clampUnit(control(input.tuning, "fragment-scale", 0.62));
  const temporalLag = clampUnit(control(input.tuning, "temporal-lag", 0.55));
  const step = 0.015 + fragmentScale * 0.14;
  const lagDirection = stableNoise(`${input.observationKey}:lag`);
  const figure = { ...input.source.figure };
  for (const dimension of Object.keys(figure) as (keyof FigureDescriptor)[]) {
    figure[dimension] = quantize(figure[dimension], step);
  }
  figure.centerX += lagDirection * temporalLag * 0.085;
  figure.postureLean = clampSigned(
    figure.postureLean + stableNoise(`${input.observationKey}:pose-lag`) * temporalLag * 0.16,
  );

  const rankedFeatures = input.source.features
    .map((feature) => ({ feature, rank: stableNoise(`${input.observationKey}:${feature.label}`) }))
    .sort((left, right) => right.rank - left.rank);
  const retainedCount = Math.min(
    rankedFeatures.length,
    Math.max(0, Math.ceil(rankedFeatures.length * retention)),
  );
  const retainedFeatures = rankedFeatures.slice(0, retainedCount).map(({ feature }) => ({
    ...feature,
    prominence: roundEvidence(clampUnit(feature.prominence * (0.35 + retention * 0.65))),
  }));
  const omitted = rankedFeatures.slice(retainedCount).map(({ feature }) => feature.label);
  const perceived = withFigure(input.source, figure, {
    rendering: {
      ...input.source.rendering,
      fragmentation: roundEvidence(fragmentScale),
      sampleRetention: roundEvidence(retention),
      temporalLag: roundEvidence(temporalLag),
    },
    features: retainedFeatures,
    omittedFeatures: [...input.source.omittedFeatures, ...omitted],
    confidence: roundEvidence(clampUnit(input.source.confidence * (0.35 + retention * 0.65))),
    anatomy: perceiveMosaicAnatomy(
      input.source.anatomy,
      retention,
      fragmentScale,
      input.observationKey,
    ),
  });
  const effects: PerceptionEffectEvidence[] = [
    {
      dimension: "sampleRetention",
      operation: "omit",
      magnitude: roundEvidence(1 - retention),
      explanation: "A deterministic fraction of sampled bodily features is forgotten.",
    },
    {
      dimension: "fragmentation",
      operation: "quantize",
      magnitude: fragmentScale,
      explanation: "Continuous proportions are reconstructed as rectangular samples.",
    },
    {
      dimension: "temporalLag",
      operation: "offset",
      magnitude: temporalLag,
      explanation: "Samples from separated moments displace the reconstructed pose.",
    },
  ];
  return { modelId: input.modelId, tuning: input.tuning, source: input.source, perceived, effects };
};

const motionResidue = (input: PerceptionModelInput): PerceptionEvidence => {
  const echoCount = Math.max(1, Math.min(8, Math.round(control(input.tuning, "echo-count", 4))));
  const echoSpacing = Math.max(2, Math.min(32, control(input.tuning, "echo-spacing", 16)));
  const stillnessFade = clampUnit(control(input.tuning, "stillness-fade", 0.58));
  const directionalPull = stableNoise(`${input.observationKey}:motion`);
  const perceived = withFigure(
    input.source,
    {
      ...input.source.figure,
      postureLean:
        input.source.figure.postureLean + directionalPull * (echoSpacing / 32) * 0.12,
      centerX: input.source.figure.centerX + directionalPull * (echoCount / 8) * 0.035,
    },
    {
      rendering: {
        ...input.source.rendering,
        echoCount,
        echoSpacing: roundEvidence(echoSpacing),
        stillnessVisibility: roundEvidence(clampUnit(1 - stillnessFade * 0.9)),
      },
      features: input.source.features.map((feature) => ({
        ...feature,
        prominence: roundEvidence(clampUnit(feature.prominence * (1 - stillnessFade * 0.5))),
      })),
      anatomy: perceiveMotionAnatomy(
        input.source.anatomy,
        stillnessFade,
        input.observationKey,
      ),
    },
  );
  const effects: PerceptionEffectEvidence[] = [
    {
      dimension: "echoCount",
      operation: "repeat",
      magnitude: echoCount,
      explanation: "Moving anatomy persists as a fixed number of prior positions.",
    },
    {
      dimension: "echoSpacing",
      operation: "offset",
      magnitude: echoSpacing,
      explanation: "Persistent positions separate along the direction of movement.",
    },
    {
      dimension: "stillnessVisibility",
      operation: "decrease",
      magnitude: stillnessFade,
      explanation: "Anatomy without motion loses contrast.",
    },
  ];
  return { modelId: input.modelId, tuning: input.tuning, source: input.source, perceived, effects };
};

const genericDistortion = (input: PerceptionModelInput): PerceptionEvidence => {
  const strength = clampUnit(control(input.tuning, "distortion-strength", 0.25));
  const direction = stableNoise(`${input.modelId}:${input.observationKey}`);
  const perceived = withFigure(
    input.source,
    {
      ...input.source.figure,
      centerX: input.source.figure.centerX + direction * strength * 0.08,
      postureLean: input.source.figure.postureLean + direction * strength * 0.18,
      symmetry: input.source.figure.symmetry - strength * 0.12,
    },
    {
      anatomy: perceiveGenericAnatomy(
        input.source.anatomy,
        strength,
        input.observationKey,
      ),
    },
  );
  return {
    modelId: input.modelId,
    tuning: input.tuning,
    source: input.source,
    perceived,
    effects: [
      {
        dimension: "postureLean",
        operation: "offset",
        magnitude: strength,
        explanation: "The placeholder lens applies a stable bodily displacement.",
      },
    ],
  };
};

export const applyPerceptionModel = (input: PerceptionModelInput): PerceptionEvidence => {
  if (input.modelId.startsWith("iris-boundary-lock")) return boundaryLock(input);
  if (input.modelId.startsWith("morrow-deferred-mosaic")) return deferredMosaic(input);
  if (input.modelId.startsWith("sable-motion-residue")) return motionResidue(input);
  return genericDistortion(input);
};
