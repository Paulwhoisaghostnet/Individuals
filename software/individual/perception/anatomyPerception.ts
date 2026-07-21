import type { AnatomyVisualSpecification } from "../core/model";
import { stableNoise } from "../core/deterministic";

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));
const quantizeUnit = (value: number, step: number): number =>
  clampUnit(Math.round(value / step) * step);
const keepByVisibility = (seed: string, visibility: number): boolean =>
  (stableNoise(seed) + 1) / 2 <= clampUnit(visibility);

/** Boundary Lock retains silhouettes while progressively losing interior anatomy. */
export const perceiveBoundaryAnatomy = (
  anatomy: AnatomyVisualSpecification | undefined,
  interiorLoss: number,
  symmetryPull: number,
): AnatomyVisualSpecification | undefined => {
  if (!anatomy) return undefined;
  const interiorVisibility = 1 - clampUnit(interiorLoss);
  return {
    ...anatomy,
    eyeSpacing: clampUnit(
      anatomy.eyeSpacing + (0.5 - anatomy.eyeSpacing) * clampUnit(symmetryPull),
    ),
    noseLength: clampUnit(
      anatomy.noseLength + (0.5 - anatomy.noseLength) * interiorLoss * 0.7,
    ),
    mouthWidth: clampUnit(
      anatomy.mouthWidth + (0.5 - anatomy.mouthWidth) * interiorLoss * 0.7,
    ),
    jointContourColor:
      interiorVisibility >= 0.55 ? anatomy.jointContourColor : undefined,
    chestPlates: interiorVisibility >= 0.65 ? anatomy.chestPlates : undefined,
    spinalMark: interiorVisibility >= 0.45 ? anatomy.spinalMark : undefined,
  };
};

/** Deferred Mosaic samples categorical anatomy and quantizes retained detail. */
export const perceiveMosaicAnatomy = (
  anatomy: AnatomyVisualSpecification | undefined,
  retention: number,
  fragmentScale: number,
  seed: string,
): AnatomyVisualSpecification | undefined => {
  if (!anatomy || retention <= 0.02) return undefined;
  const boundedRetention = clampUnit(retention);
  const boundedFragment = clampUnit(fragmentScale);
  const visibility = boundedRetention * (1 - boundedFragment * 0.35);
  const step = 0.04 + boundedFragment * 0.22;
  const uncertainty = (1 - boundedRetention) * 0.8 + boundedFragment * 0.2;
  const fingerDelta = Math.round(stableNoise(`${seed}:finger-count`) * uncertainty * 3);
  const omitOptionalDetails = visibility < 0.25;
  return {
    ...anatomy,
    eyeSpacing: quantizeUnit(anatomy.eyeSpacing, step),
    noseLength: quantizeUnit(anatomy.noseLength, step),
    mouthWidth: quantizeUnit(anatomy.mouthWidth, step),
    fingerCountPerHand: Math.max(
      1,
      Math.min(10, anatomy.fingerCountPerHand + fingerDelta),
    ),
    jointContourColor:
      !omitOptionalDetails && keepByVisibility(`${seed}:joints`, visibility)
        ? anatomy.jointContourColor
        : undefined,
    chestPlates:
      !omitOptionalDetails && keepByVisibility(`${seed}:plates`, visibility)
        ? anatomy.chestPlates
        : undefined,
    spinalMark:
      !omitOptionalDetails && keepByVisibility(`${seed}:spine`, visibility)
        ? anatomy.spinalMark
        : undefined,
  };
};

/** Motion Residue loses stationary details while retaining the moving body plan. */
export const perceiveMotionAnatomy = (
  anatomy: AnatomyVisualSpecification | undefined,
  stillnessFade: number,
  seed: string,
): AnatomyVisualSpecification | undefined => {
  if (!anatomy) return undefined;
  const visibility = 1 - clampUnit(stillnessFade);
  return {
    ...anatomy,
    jointContourColor: keepByVisibility(`${seed}:joints`, visibility)
      ? anatomy.jointContourColor
      : undefined,
    chestPlates: keepByVisibility(`${seed}:plates`, visibility)
      ? anatomy.chestPlates
      : undefined,
    spinalMark: keepByVisibility(`${seed}:spine`, Math.min(1, visibility + 0.2))
      ? anatomy.spinalMark
      : undefined,
  };
};

export const perceiveGenericAnatomy = (
  anatomy: AnatomyVisualSpecification | undefined,
  strength: number,
  seed: string,
): AnatomyVisualSpecification | undefined => {
  if (!anatomy) return undefined;
  const bounded = clampUnit(strength);
  const shift = stableNoise(`${seed}:face`) * bounded * 0.12;
  return {
    ...anatomy,
    eyeSpacing: clampUnit(anatomy.eyeSpacing + shift),
    noseLength: clampUnit(anatomy.noseLength - shift * 0.6),
    mouthWidth: clampUnit(anatomy.mouthWidth + shift * 0.4),
  };
};
