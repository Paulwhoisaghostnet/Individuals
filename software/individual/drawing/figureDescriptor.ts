import type {
  ArtisticAbilityScope,
  AnatomyVisualSpecification,
  ArtPracticeSpecification,
  ArtworkDescriptor,
  CycleIntent,
  FigureDescriptor,
  IndividualManifest,
  IndividualState,
  Portrait,
  RenderingDescriptor,
} from "../core/model";
import { stableNoise } from "../core/deterministic";
import { drawObservedAnatomy } from "./anatomyAbility";
import { applyBodyAdjustments, figureDistance } from "../core/figureGeometry";

export const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));
export const clampSigned = (value: number): number => Math.min(1, Math.max(-1, value));
export const roundEvidence = (value: number): number => Number(value.toFixed(4));

export const defaultRenderingDescriptor = (): RenderingDescriptor => ({
  edgeEmphasis: 0.62,
  interiorVisibility: 0.72,
  fragmentation: 0,
  sampleRetention: 1,
  temporalLag: 0,
  echoCount: 1,
  echoSpacing: 0,
  stillnessVisibility: 1,
});

const BODY_PLANS: Readonly<Record<string, FigureDescriptor>> = {
  willow: {
    headAspect: 0.7,
    shoulderWidth: 0.43,
    torsoWidth: 0.36,
    torsoLength: 0.7,
    armLength: 0.76,
    legLength: 0.82,
    openness: 0.75,
    verticality: 0.92,
    symmetry: 0.92,
    centerX: 0.5,
    postureLean: 0,
  },
  compact: {
    headAspect: 0.82,
    shoulderWidth: 0.76,
    torsoWidth: 0.72,
    torsoLength: 0.48,
    armLength: 0.55,
    legLength: 0.58,
    openness: 0.62,
    verticality: 0.86,
    symmetry: 0.8,
    centerX: 0.5,
    postureLean: 0.02,
  },
  longline: {
    headAspect: 0.56,
    shoulderWidth: 0.38,
    torsoWidth: 0.3,
    torsoLength: 0.78,
    armLength: 0.9,
    legLength: 0.94,
    openness: 0.58,
    verticality: 0.9,
    symmetry: 0.76,
    centerX: 0.5,
    postureLean: -0.02,
  },
};

const GENERIC_FIGURE: FigureDescriptor = {
  headAspect: 0.7,
  shoulderWidth: 0.55,
  torsoWidth: 0.5,
  torsoLength: 0.62,
  armLength: 0.68,
  legLength: 0.72,
  openness: 0.64,
  verticality: 0.88,
  symmetry: 0.85,
  centerX: 0.5,
  postureLean: 0,
};

export const normalizeFigure = (figure: FigureDescriptor): FigureDescriptor => ({
  headAspect: roundEvidence(clampUnit(figure.headAspect)),
  shoulderWidth: roundEvidence(clampUnit(figure.shoulderWidth)),
  torsoWidth: roundEvidence(clampUnit(figure.torsoWidth)),
  torsoLength: roundEvidence(clampUnit(figure.torsoLength)),
  armLength: roundEvidence(clampUnit(figure.armLength)),
  legLength: roundEvidence(clampUnit(figure.legLength)),
  openness: roundEvidence(clampUnit(figure.openness)),
  verticality: roundEvidence(clampUnit(figure.verticality)),
  symmetry: roundEvidence(clampUnit(figure.symmetry)),
  centerX: roundEvidence(clampUnit(figure.centerX)),
  postureLean: roundEvidence(clampSigned(figure.postureLean)),
});

export const describeIntendedSelf = (
  manifest: IndividualManifest,
  state: IndividualState,
  intent: CycleIntent,
): ArtworkDescriptor => {
  const ideal =
    manifest.identity.idealPhysicalForm.visualSpecification?.figure ??
    BODY_PLANS[manifest.identity.idealPhysicalForm.bodyPlan] ??
    GENERIC_FIGURE;
  const belief =
    state.selfConcept.physicalSelf.bodyBelief ??
    manifest.identity.initialPhysicalSelf.bodyBelief ??
    ideal;
  const figure = normalizeFigure(applyBodyAdjustments(belief, intent.bodyAdjustments ?? []));
  const similarity = clampUnit(1 - figureDistance(figure, ideal));

  const features = manifest.identity.idealPhysicalForm.nonNegotiableFeatures.map((label) => ({
    label,
    prominence: roundEvidence(0.72 + manifest.identity.socialDisposition.selfIntegrity * 0.25),
  }));

  return {
    schemaVersion: 1,
    figure,
    rendering: defaultRenderingDescriptor(),
    features,
    omittedFeatures: [],
    styleName: "internal bodily image",
    primitives: ["body schema"],
    confidence: roundEvidence(0.45 + similarity * 0.5),
    anatomy: manifest.identity.idealPhysicalForm.visualSpecification?.anatomy,
  };
};

export const DEFAULT_ART_PRACTICE: ArtPracticeSpecification = {
  markMode: "continuous-contour",
  compositionMode: "isolated-frontal",
  correctionMode: "adjacent-line",
  lineLiftAllowed: false,
  erasureAllowed: false,
  minimumRepetitions: 1,
  detailSuppression: 0.35,
  curveQuantization: 0.05,
  overlapSimplification: 0.3,
};

const ART_SKILL_BY_DIMENSION: Readonly<Record<keyof FigureDescriptor, keyof ArtisticAbilityScope["skill"]>> = {
  headAspect: "observationalAccuracy",
  shoulderWidth: "proportionAccuracy",
  torsoWidth: "proportionAccuracy",
  torsoLength: "proportionAccuracy",
  armLength: "anatomicalCoherence",
  legLength: "anatomicalCoherence",
  openness: "observationalAccuracy",
  verticality: "spatialCoherence",
  symmetry: "anatomicalCoherence",
  centerX: "spatialCoherence",
  postureLean: "lineControl",
};

export const renderThroughAbility = (
  target: ArtworkDescriptor,
  ability: ArtisticAbilityScope,
  seed: string,
  options: { readonly subject: "self" | "observed-peer" } = { subject: "self" },
): ArtworkDescriptor => {
  const figure = { ...target.figure };
  for (const dimension of Object.keys(figure) as (keyof FigureDescriptor)[]) {
    const skill = ability.skill[ART_SKILL_BY_DIMENSION[dimension]];
    const range = dimension === "postureLean" ? 0.24 : 0.18;
    figure[dimension] += stableNoise(`${seed}:${dimension}`) * (1 - skill) * range;
  }

  const practice = ability.practice ?? DEFAULT_ART_PRACTICE;
  const usesPlanes = practice.markMode === "assembled-planes";
  const usesRepetition = practice.markMode === "repeated-gesture";
  const confidence = Object.values(ability.skill).reduce((sum, value) => sum + value, 0) / 6;
  const rendering: RenderingDescriptor = {
    edgeEmphasis: roundEvidence(clampUnit(target.rendering.edgeEmphasis * 0.55 + ability.skill.lineControl * 0.45)),
    interiorVisibility: roundEvidence(
      clampUnit(
        target.rendering.interiorVisibility *
          (0.35 + ability.skill.detailCapacity * 0.65) *
          (1 - practice.detailSuppression * 0.55),
      ),
    ),
    fragmentation: roundEvidence(
      clampUnit(
        Math.max(
          target.rendering.fragmentation,
          usesPlanes ? 0.35 + practice.curveQuantization * 0.65 : practice.curveQuantization * 0.12,
        ),
      ),
    ),
    sampleRetention: roundEvidence(clampUnit(target.rendering.sampleRetention)),
    temporalLag: roundEvidence(clampUnit(target.rendering.temporalLag)),
    echoCount: Math.max(
      target.rendering.echoCount,
      usesRepetition ? practice.minimumRepetitions : 1,
    ),
    echoSpacing: roundEvidence(
      Math.max(target.rendering.echoSpacing, usesRepetition ? 4 + practice.overlapSimplification * 8 : 0),
    ),
    stillnessVisibility: roundEvidence(clampUnit(target.rendering.stillnessVisibility)),
  };

  return {
    schemaVersion: 1,
    figure: normalizeFigure(figure),
    rendering,
    features: target.features.map((feature) => ({
      label: feature.label,
      support: feature.support,
      prominence: roundEvidence(
        clampUnit(feature.prominence * (0.4 + ability.skill.observationalAccuracy * 0.4 + ability.skill.detailCapacity * 0.2)),
      ),
    })),
    omittedFeatures: [...target.omittedFeatures],
    styleName: ability.styleName,
    primitives: [...ability.favoredPrimitives],
    confidence: roundEvidence(clampUnit(confidence * target.confidence)),
    anatomy:
      options.subject === "observed-peer"
        ? drawObservedAnatomy(target.anatomy, ability, seed)
        : target.anatomy,
    practice,
  };
};

/** Explicit compatibility artifact for a curator-approved legacy import only. */
export const createLegacyFallbackDescriptor = (portrait: Pick<Portrait, "id" | "subjectId">): ArtworkDescriptor => {
  const jitter = (dimension: keyof FigureDescriptor, scale: number) =>
    stableNoise(`${portrait.id}:${dimension}`) * scale;
  return {
    schemaVersion: 1,
    figure: normalizeFigure({
      ...GENERIC_FIGURE,
      headAspect: GENERIC_FIGURE.headAspect + jitter("headAspect", 0.08),
      shoulderWidth: GENERIC_FIGURE.shoulderWidth + jitter("shoulderWidth", 0.12),
      torsoWidth: GENERIC_FIGURE.torsoWidth + jitter("torsoWidth", 0.1),
      postureLean: jitter("postureLean", 0.12),
      centerX: GENERIC_FIGURE.centerX + jitter("centerX", 0.04),
    }),
    rendering: defaultRenderingDescriptor(),
    features: [{ label: `${portrait.subjectId} silhouette`, prominence: 0.55 }],
    omittedFeatures: ["source artwork supplied no structured descriptor"],
    styleName: "legacy source",
    primitives: ["unknown marks"],
    confidence: 0.35,
    practice: DEFAULT_ART_PRACTICE,
  };
};

const boundedText = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
  return normalized.length > 0 ? normalized.slice(0, 240) : fallback;
};

const sanitizeAnatomy = (
  value: AnatomyVisualSpecification | undefined,
  fallback: AnatomyVisualSpecification | undefined,
): AnatomyVisualSpecification | undefined => {
  const source = value ?? fallback;
  if (!source) return undefined;
  const unit = (candidate: number, replacement: number) =>
    clampUnit(Number.isFinite(candidate) ? candidate : replacement);
  const shape = ["oval", "square", "elongated"].includes(source.faceShape)
    ? source.faceShape
    : (fallback?.faceShape ?? "oval");
  const finish = ["matte", "translucent-plate", "threaded"].includes(source.surfaceFinish)
    ? source.surfaceFinish
    : (fallback?.surfaceFinish ?? "matte");
  return {
    faceShape: shape,
    eyeSpacing: unit(source.eyeSpacing, 0.5),
    noseLength: unit(source.noseLength, 0.5),
    mouthWidth: unit(source.mouthWidth, 0.5),
    fingerCountPerHand: Math.max(
      1,
      Math.min(
        10,
        Math.round(Number.isFinite(source.fingerCountPerHand) ? source.fingerCountPerHand : (fallback?.fingerCountPerHand ?? 5)),
      ),
    ),
    skinColor: boundedText(source.skinColor, fallback?.skinColor ?? "#7c6557"),
    surfaceFinish: finish,
    jointContourColor: source.jointContourColor
      ? boundedText(source.jointContourColor, "#c7b39d")
      : undefined,
    chestPlates: source.chestPlates
      ? {
          count: Math.max(1, Math.min(16, Math.round(source.chestPlates.count))),
          color: boundedText(source.chestPlates.color, "#b9ceca"),
          opacity: unit(source.chestPlates.opacity, 0.4),
        }
      : undefined,
    spinalMark: source.spinalMark
      ? {
          color: boundedText(source.spinalMark.color, "#b84e4b"),
          width: Math.max(1, Math.min(20, Number.isFinite(source.spinalMark.width) ? source.spinalMark.width : 3)),
        }
      : undefined,
  };
};

const sanitizePractice = (
  value: ArtPracticeSpecification | undefined,
  fallback: ArtPracticeSpecification | undefined,
): ArtPracticeSpecification => {
  const source = value ?? fallback ?? DEFAULT_ART_PRACTICE;
  const unit = (candidate: number, replacement: number) =>
    clampUnit(Number.isFinite(candidate) ? candidate : replacement);
  return {
    markMode: ["continuous-contour", "assembled-planes", "repeated-gesture"].includes(source.markMode)
      ? source.markMode
      : DEFAULT_ART_PRACTICE.markMode,
    compositionMode: ["isolated-frontal", "low-grounded", "spine-centered"].includes(source.compositionMode)
      ? source.compositionMode
      : DEFAULT_ART_PRACTICE.compositionMode,
    correctionMode: ["adjacent-line", "overpaint-plane", "repeated-pass"].includes(source.correctionMode)
      ? source.correctionMode
      : DEFAULT_ART_PRACTICE.correctionMode,
    lineLiftAllowed: source.lineLiftAllowed === true,
    erasureAllowed: source.erasureAllowed === true,
    minimumRepetitions: Math.max(
      1,
      Math.min(
        8,
        Math.round(Number.isFinite(source.minimumRepetitions) ? source.minimumRepetitions : 1),
      ),
    ),
    detailSuppression: unit(source.detailSuppression, DEFAULT_ART_PRACTICE.detailSuppression),
    curveQuantization: unit(source.curveQuantization, DEFAULT_ART_PRACTICE.curveQuantization),
    overlapSimplification: unit(
      source.overlapSimplification,
      DEFAULT_ART_PRACTICE.overlapSimplification,
    ),
  };
};

/** Runtime-normalizes descriptors that may have crossed a file or network boundary. */
export const sanitizeArtworkDescriptor = (
  value: ArtworkDescriptor,
  fallback: ArtworkDescriptor,
): ArtworkDescriptor => {
  const finite = (candidate: number, replacement: number): number =>
    Number.isFinite(candidate) ? candidate : replacement;
  const figure = normalizeFigure({
    headAspect: finite(value.figure?.headAspect, fallback.figure.headAspect),
    shoulderWidth: finite(value.figure?.shoulderWidth, fallback.figure.shoulderWidth),
    torsoWidth: finite(value.figure?.torsoWidth, fallback.figure.torsoWidth),
    torsoLength: finite(value.figure?.torsoLength, fallback.figure.torsoLength),
    armLength: finite(value.figure?.armLength, fallback.figure.armLength),
    legLength: finite(value.figure?.legLength, fallback.figure.legLength),
    openness: finite(value.figure?.openness, fallback.figure.openness),
    verticality: finite(value.figure?.verticality, fallback.figure.verticality),
    symmetry: finite(value.figure?.symmetry, fallback.figure.symmetry),
    centerX: finite(value.figure?.centerX, fallback.figure.centerX),
    postureLean: finite(value.figure?.postureLean, fallback.figure.postureLean),
  });
  const sourceRendering = value.rendering ?? fallback.rendering;
  const rendering: RenderingDescriptor = {
    edgeEmphasis: roundEvidence(clampUnit(finite(sourceRendering.edgeEmphasis, fallback.rendering.edgeEmphasis))),
    interiorVisibility: roundEvidence(clampUnit(finite(sourceRendering.interiorVisibility, fallback.rendering.interiorVisibility))),
    fragmentation: roundEvidence(clampUnit(finite(sourceRendering.fragmentation, fallback.rendering.fragmentation))),
    sampleRetention: roundEvidence(clampUnit(finite(sourceRendering.sampleRetention, fallback.rendering.sampleRetention))),
    temporalLag: roundEvidence(clampUnit(finite(sourceRendering.temporalLag, fallback.rendering.temporalLag))),
    echoCount: Math.max(1, Math.min(8, Math.round(finite(sourceRendering.echoCount, 1)))),
    echoSpacing: roundEvidence(Math.max(0, Math.min(32, finite(sourceRendering.echoSpacing, 0)))),
    stillnessVisibility: roundEvidence(clampUnit(finite(sourceRendering.stillnessVisibility, fallback.rendering.stillnessVisibility))),
  };
  const sourceFeatures = Array.isArray(value.features) ? value.features : [];
  const sourceOmissions = Array.isArray(value.omittedFeatures) ? value.omittedFeatures : [];
  const sourcePrimitives = Array.isArray(value.primitives) ? value.primitives : [];

  return {
    schemaVersion: 1,
    figure,
    rendering,
    features: sourceFeatures.slice(0, 32).map((feature) => ({
      label: boundedText(feature?.label, "unlabelled feature"),
      support:
        feature?.support === undefined
          ? undefined
          : roundEvidence(clampUnit(finite(feature.support, 0))),
      prominence: roundEvidence(
        clampUnit(finite(feature?.prominence, 0.25)),
      ),
    })),
    omittedFeatures: sourceOmissions
      .slice(0, 32)
      .map((feature) => boundedText(feature, "unlabelled omission")),
    styleName: boundedText(value.styleName, fallback.styleName),
    primitives: sourcePrimitives
      .slice(0, 24)
      .map((primitive) => boundedText(primitive, "mark")),
    confidence: roundEvidence(clampUnit(finite(value.confidence, fallback.confidence))),
    anatomy: sanitizeAnatomy(value.anatomy, fallback.anatomy),
    practice: sanitizePractice(value.practice, fallback.practice),
  };
};

export const descriptorForPortrait = (portrait: Portrait): ArtworkDescriptor => {
  if (!portrait.descriptor) {
    throw new Error(
      `Portrait "${portrait.id}" has no structured body descriptor; live perception cannot invent one.`,
    );
  }
  return sanitizeArtworkDescriptor(
    portrait.descriptor,
    createLegacyFallbackDescriptor(portrait),
  );
};

export const descriptorForLegacyPortrait = (portrait: Portrait): ArtworkDescriptor =>
  portrait.descriptor
    ? descriptorForPortrait(portrait)
    : createLegacyFallbackDescriptor(portrait);
