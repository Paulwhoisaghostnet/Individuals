import { stableNoise } from "../core/deterministic";
import type {
  AnatomyVisualSpecification,
  ArtisticAbilityScope,
  FaceShape,
} from "../core/model";

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const shiftedFaceShape = (shape: FaceShape, shift: number): FaceShape => {
  const shapes: readonly FaceShape[] = ["oval", "square", "elongated"];
  const index = shapes.indexOf(shape);
  return shapes[(index + shift + shapes.length) % shapes.length];
};

/**
 * Applies the artist's hand to categorical observed anatomy. Self anatomy is
 * handled separately as an authored identity anchor; this function is for a
 * fallible drawing of someone else's perceived body.
 */
export const drawObservedAnatomy = (
  anatomy: AnatomyVisualSpecification | undefined,
  ability: ArtisticAbilityScope,
  seed: string,
): AnatomyVisualSpecification | undefined => {
  if (!anatomy) return undefined;
  const practice = ability.practice;
  const accuracy = clampUnit(
    (ability.skill.observationalAccuracy +
      ability.skill.anatomicalCoherence +
      ability.skill.detailCapacity) /
      3,
  );
  const detailVisibility = clampUnit(
    accuracy * (1 - (practice?.detailSuppression ?? 0) * 0.55),
  );
  const coordinateNoise = (label: string): number =>
    stableNoise(`${seed}:anatomy:${label}`) * (1 - accuracy) * 0.22;
  const deterministicFingerError =
    accuracy < 0.15
      ? stableNoise(`${seed}:anatomy:fingers`) >= 0
        ? 2
        : -2
      : Math.round(stableNoise(`${seed}:anatomy:fingers`) * (1 - accuracy) * 2);
  const keepDetail = (label: string): boolean =>
    detailVisibility >= 0.35 &&
    (stableNoise(`${seed}:anatomy:${label}`) + 1) / 2 <= detailVisibility;
  const faceShift =
    ability.skill.anatomicalCoherence < 0.25
      ? stableNoise(`${seed}:anatomy:face-shape`) >= 0
        ? 1
        : -1
      : 0;

  return {
    ...anatomy,
    faceShape: shiftedFaceShape(anatomy.faceShape, faceShift),
    eyeSpacing: clampUnit(anatomy.eyeSpacing + coordinateNoise("eyes")),
    noseLength: clampUnit(anatomy.noseLength + coordinateNoise("nose")),
    mouthWidth: clampUnit(anatomy.mouthWidth + coordinateNoise("mouth")),
    fingerCountPerHand: Math.max(
      1,
      Math.min(10, anatomy.fingerCountPerHand + deterministicFingerError),
    ),
    jointContourColor: keepDetail("joints") ? anatomy.jointContourColor : undefined,
    chestPlates: keepDetail("plates") ? anatomy.chestPlates : undefined,
    spinalMark: keepDetail("spine") ? anatomy.spinalMark : undefined,
  };
};
