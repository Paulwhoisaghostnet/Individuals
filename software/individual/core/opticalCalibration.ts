import type {
  ArtworkDescriptor,
  OpticalCalibrationEvidence,
} from "./model";
import { clampFigureDimension } from "./figureGeometry";

const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.min(maximum, Math.max(minimum, value));

export const assertOpticalCalibration = (
  calibration: OpticalCalibrationEvidence,
  field = "calibration",
): void => {
  if (!Number.isFinite(calibration.focalLengthMm) || calibration.focalLengthMm <= 0) {
    throw new Error(`${field}.focalLengthMm must be positive.`);
  }
  if (
    !Number.isFinite(calibration.workingDistanceMeters) ||
    calibration.workingDistanceMeters <= 0
  ) {
    throw new Error(`${field}.workingDistanceMeters must be positive.`);
  }
  if (
    !Number.isFinite(calibration.ambientIlluminationLux) ||
    calibration.ambientIlluminationLux < 0 ||
    calibration.ambientIlluminationLux > 1_000_000
  ) {
    throw new Error(`${field}.ambientIlluminationLux is outside accepted bounds.`);
  }
  if (
    !Number.isFinite(calibration.lensDistortionGain) ||
    Math.abs(calibration.lensDistortionGain) > 0.5
  ) {
    throw new Error(`${field}.lensDistortionGain must be between -0.5 and 0.5.`);
  }
  for (const [name, offset] of [
    ["opticalCenterOffsetX", calibration.opticalCenterOffsetX],
    ["opticalCenterOffsetY", calibration.opticalCenterOffsetY],
  ] as const) {
    if (offset !== undefined && (!Number.isFinite(offset) || Math.abs(offset) > 0.5)) {
      throw new Error(`${field}.${name} must be between -0.5 and 0.5.`);
    }
  }
};

/** Deterministic calibration transform verifiable at the engine boundary. */
export const applyOpticalCalibration = (
  descriptor: ArtworkDescriptor,
  calibration: OpticalCalibrationEvidence,
): ArtworkDescriptor => {
  assertOpticalCalibration(calibration);
  const referenceMagnification = 35 / (2.2 * 15);
  const magnification = clamp(
    calibration.focalLengthMm /
      (calibration.workingDistanceMeters * 15) /
      referenceMagnification,
    0.65,
    1.35,
  );
  const illumination = clamp(calibration.ambientIlluminationLux / 450, 0.2, 1.2);
  const radial = calibration.lensDistortionGain;
  const figure = descriptor.figure;
  return {
    ...descriptor,
    figure: {
      ...figure,
      centerX: clampFigureDimension(
        "centerX",
        0.5 +
          (figure.centerX - 0.5) * magnification * (1 + radial) +
          (calibration.opticalCenterOffsetX ?? 0),
      ),
      verticality: clampFigureDimension(
        "verticality",
        figure.verticality - (calibration.opticalCenterOffsetY ?? 0) * 0.15,
      ),
      shoulderWidth: clampFigureDimension(
        "shoulderWidth",
        figure.shoulderWidth * magnification * (1 + radial * 0.4),
      ),
      torsoWidth: clampFigureDimension(
        "torsoWidth",
        figure.torsoWidth * magnification * (1 + radial * 0.55),
      ),
      headAspect: clampFigureDimension(
        "headAspect",
        figure.headAspect * (1 - radial * 0.35),
      ),
    },
    rendering: {
      ...descriptor.rendering,
      interiorVisibility: clamp(descriptor.rendering.interiorVisibility * illumination),
      edgeEmphasis: clamp(
        descriptor.rendering.edgeEmphasis + Math.max(0, 1 - illumination) * 0.18,
      ),
    },
    confidence: clamp(descriptor.confidence * clamp(illumination, 0.35, 1)),
  };
};
