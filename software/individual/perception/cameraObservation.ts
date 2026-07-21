import type { Observation } from "../core/model";
import type { PerceptionSystem } from "../core/systems/contracts";

export interface CameraCalibration {
  readonly cameraId: string;
  readonly targetCanvasId: string;
  readonly focalLengthMm: number;
  readonly workingDistanceMeters: number;
  readonly ambientIlluminationLux: number;
  readonly lensDistortionGain: number;
}

export class CameraObservationSystem implements PerceptionSystem {
  constructor(private readonly calibrations: Readonly<Record<string, CameraCalibration>> = {}) {}

  async observe(input: Parameters<PerceptionSystem["observe"]>[0]): Promise<Observation> {
    const { manifest, portrait, tuning } = input;
    const observerId = manifest.id;
    const subjectId = portrait.subjectId;
    const calibrationKey = `${observerId}->${subjectId}`;
    const cal = this.calibrations[calibrationKey] ?? {
      cameraId: `cam-${observerId}`,
      targetCanvasId: `canvas-${subjectId}`,
      focalLengthMm: 35,
      workingDistanceMeters: 2.2,
      ambientIlluminationLux: 450,
      lensDistortionGain: 0.05,
    };

    const sourceSvg = portrait.artwork.content;
    const scale = (cal.focalLengthMm / (cal.workingDistanceMeters * 15)).toFixed(2);
    const opticalContent = sourceSvg.replace(
      "<svg ",
      `<svg data-camera="${cal.cameraId}" data-target-canvas="${cal.targetCanvasId}" transform="scale(${scale})" `,
    );

    return {
      observerId,
      subjectId,
      sourcePortrait: portrait,
      perceivedArtwork: {
        format: "svg",
        width: portrait.artwork.width,
        height: portrait.artwork.height,
        content: opticalContent,
      },
      notes: [
        `Camera "${cal.cameraId}" captured peer canvas "${cal.targetCanvasId}".`,
        `Working distance: ${cal.workingDistanceMeters}m | Focal length: ${cal.focalLengthMm}mm | Illumination: ${cal.ambientIlluminationLux} lux.`,
        ...Object.entries(tuning).map(([k, v]) => `${k}=${v}`),
      ],
    };
  }
}
