import type {
  Artwork,
  ArtworkDescriptor,
  Observation,
  OpticalCalibrationEvidence,
  Portrait,
} from "../core/model";
import { applyOpticalCalibration, assertOpticalCalibration } from "../core/opticalCalibration";
import type { PerceptionSystem } from "../core/systems/contracts";
import {
  artworkDescriptorsEqual,
  assertArtworkDescriptorBounds,
} from "../core/validation/visualEvidence";
import { requireUtcTimestamp } from "../core/validation/primitives";
import { applyPerceptionModel } from "./perceptionModels";

const validateDescriptor = (value: unknown, field: string): ArtworkDescriptor => {
  assertArtworkDescriptorBounds(value, field);
  return value;
};

export type CameraCalibration = OpticalCalibrationEvidence;

export interface ObservationRoute {
  readonly observerId: string;
  readonly subjectId: string;
  readonly sourceId: string;
  readonly targetCanvasId: string;
  readonly calibration: CameraCalibration;
}

export type FrameSourceKind = "digital-canvas" | "physical-camera" | "recorded-fixture";

interface CapturedFrameBase {
  readonly sourceId: string;
  readonly targetCanvasId: string;
  readonly subjectId: string;
  readonly capturedAt: string;
  readonly artwork: Artwork;
}

export interface DescriptorBearingCapturedFrame extends CapturedFrameBase {
  readonly kind: "digital-canvas" | "recorded-fixture";
  readonly descriptor?: ArtworkDescriptor;
}

export interface PhysicalCameraCapturedFrame extends CapturedFrameBase {
  readonly kind: "physical-camera";
}

export type CapturedFrame = DescriptorBearingCapturedFrame | PhysicalCameraCapturedFrame;

export interface StructuredFrameSource {
  readonly kind: "digital-canvas" | "recorded-fixture";
  capture(input: {
    readonly route: ObservationRoute;
    readonly sourcePortrait: Portrait;
    readonly signal?: AbortSignal;
  }): Promise<DescriptorBearingCapturedFrame>;
}

export interface PhysicalCameraFrameSource {
  readonly kind: "physical-camera";
  capture(input: {
    readonly route: ObservationRoute;
    readonly signal?: AbortSignal;
  }): Promise<PhysicalCameraCapturedFrame>;
}

export type FrameSource = StructuredFrameSource | PhysicalCameraFrameSource;

export interface FrameInterpretationInput extends CapturedFrameBase {
  readonly kind: FrameSourceKind;
  readonly route: ObservationRoute;
  readonly signal?: AbortSignal;
}

/**
 * Explicit computer-vision boundary for turning pixels into body evidence.
 * Its input deliberately has no source-portrait descriptor.
 */
export interface FrameInterpreter {
  interpret(frame: FrameInterpretationInput): Promise<ArtworkDescriptor>;
}

/** Digital prototype adapter: reads the routed peer portrait; it does not claim camera I/O. */
export class DigitalPortraitFrameSource implements StructuredFrameSource {
  readonly kind = "digital-canvas" as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async capture(input: {
    readonly route: ObservationRoute;
    readonly sourcePortrait: Portrait;
    readonly signal?: AbortSignal;
  }): Promise<DescriptorBearingCapturedFrame> {
    input.signal?.throwIfAborted();
    return {
      kind: this.kind,
      sourceId: input.route.sourceId,
      targetCanvasId: input.route.targetCanvasId,
      subjectId: input.sourcePortrait.subjectId,
      capturedAt: this.now().toISOString(),
      artwork: input.sourcePortrait.artwork,
      descriptor: input.sourcePortrait.descriptor,
    };
  }
}

export interface CameraObservationOptions {
  readonly routes: readonly ObservationRoute[];
  readonly frameSource?: FrameSource;
  readonly frameInterpreter?: FrameInterpreter;
}

const validateRoute = (route: ObservationRoute): void => {
  for (const [field, value] of Object.entries({
    observerId: route.observerId,
    subjectId: route.subjectId,
    sourceId: route.sourceId,
    targetCanvasId: route.targetCanvasId,
  })) {
    if (
      typeof value !== "string" ||
      value.trim().length === 0 ||
      value.length > 128 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)
    ) {
      throw new Error(`Observation route ${field} must be non-empty.`);
    }
  }
  assertOpticalCalibration(route.calibration, "observation route calibration");
};

export class CameraObservationSystem implements PerceptionSystem {
  private readonly routes = new Map<string, ObservationRoute>();
  private readonly frameSource: FrameSource;
  private readonly frameInterpreter: FrameInterpreter | undefined;

  constructor(options: CameraObservationOptions) {
    if (!Array.isArray(options.routes) || options.routes.length === 0) {
      throw new Error("Camera observation requires an explicit target route allowlist.");
    }
    for (const route of options.routes) {
      validateRoute(route);
      const key = this.routeKey(route.observerId, route.subjectId);
      if (this.routes.has(key)) throw new Error(`Duplicate observation route "${key}".`);
      this.routes.set(key, route);
    }
    this.frameSource = options.frameSource ?? new DigitalPortraitFrameSource();
    this.frameInterpreter = options.frameInterpreter;
    if (this.frameSource.kind === "physical-camera" && !this.frameInterpreter) {
      throw new Error(
        "A physical-camera frame source requires an explicit FrameInterpreter; digital portrait metadata cannot stand in for observed pixels.",
      );
    }
  }

  async observe(input: Parameters<PerceptionSystem["observe"]>[0]): Promise<Observation> {
    const { manifest, portrait, tuning } = input;
    input.signal?.throwIfAborted();
    const route = this.routes.get(this.routeKey(manifest.id, portrait.subjectId));
    if (!route) {
      throw new Error(
        `No allowlisted frame route from "${manifest.id}" to "${portrait.subjectId}".`,
      );
    }
    const frame =
      this.frameSource.kind === "physical-camera"
        ? await this.frameSource.capture({ route, signal: input.signal })
        : await this.frameSource.capture({
            route,
            sourcePortrait: portrait,
            signal: input.signal,
          });
    input.signal?.throwIfAborted();
    if (
      frame.kind !== this.frameSource.kind ||
      frame.sourceId !== route.sourceId ||
      frame.targetCanvasId !== route.targetCanvasId ||
      frame.subjectId !== route.subjectId
    ) {
      throw new Error("Frame source returned content outside its allowlisted route.");
    }
    if (
      frame.kind === "physical-camera" &&
      Object.hasOwn(frame as object, "descriptor")
    ) {
      throw new Error(
        "Physical-camera frames cannot carry a source portrait descriptor.",
      );
    }
    requireUtcTimestamp(frame.capturedAt, "frame capture timestamp");
    if (
      !Number.isSafeInteger(frame.artwork.width) ||
      !Number.isSafeInteger(frame.artwork.height) ||
      frame.artwork.width < 1 ||
      frame.artwork.height < 1 ||
      frame.artwork.width > 16_384 ||
      frame.artwork.height > 16_384 ||
      typeof frame.artwork.content !== "string" ||
      Buffer.byteLength(frame.artwork.content, "utf8") > 512 * 1024
    ) {
      throw new Error("Frame source returned artwork outside acquisition safety bounds.");
    }
    if (frame.kind === "physical-camera" && frame.artwork.format !== "raster-reference") {
      throw new Error("Physical-camera frames must carry raster-reference artwork.");
    }

    const sourceDescriptor = validateDescriptor(
      portrait.descriptor,
      "source portrait descriptor",
    );
    const interpretationInput: FrameInterpretationInput = {
      kind: frame.kind,
      sourceId: frame.sourceId,
      targetCanvasId: frame.targetCanvasId,
      subjectId: frame.subjectId,
      capturedAt: frame.capturedAt,
      artwork: frame.artwork,
      route,
      signal: input.signal,
    };
    let descriptor: ArtworkDescriptor;
    if (frame.kind === "physical-camera") {
      descriptor = validateDescriptor(
        await this.frameInterpreter!.interpret(interpretationInput),
        "physical frame interpretation",
      );
      input.signal?.throwIfAborted();
      if (artworkDescriptorsEqual(descriptor, sourceDescriptor)) {
        throw new Error(
          "Physical frame interpretation cannot pass through the source portrait descriptor unchanged.",
        );
      }
    } else if (frame.descriptor) {
      descriptor = validateDescriptor(frame.descriptor, "captured frame descriptor");
    } else if (this.frameInterpreter) {
      descriptor = validateDescriptor(
        await this.frameInterpreter.interpret(interpretationInput),
        "frame interpretation",
      );
      input.signal?.throwIfAborted();
    } else {
      throw new Error(
        `${this.frameSource.kind} frame "${frame.sourceId}" has no interpreted body descriptor.`,
      );
    }
    if (
      frame.kind === "digital-canvas" &&
      !artworkDescriptorsEqual(descriptor, sourceDescriptor)
    ) {
      throw new Error("Digital canvas acquisition altered its structured source descriptor.");
    }
    const calibrated = applyOpticalCalibration(descriptor, route.calibration);
    const modelEvidence = applyPerceptionModel({
      modelId: manifest.perception.modelId,
      source: calibrated,
      tuning: { ...tuning },
      // Route geometry may affect a physical view, but portrait chronology must
      // not randomly change the observer's characteristic distortion.
      observationKey: `${manifest.id}:${route.sourceId}:${route.targetCanvasId}`,
    });
    const evidence = {
      ...modelEvidence,
      // Raw portrait lineage remains exact even though the model sees a
      // calibrated acquisition descriptor.
      source: sourceDescriptor,
      acquisition: {
        schemaVersion: 1 as const,
        sourceKind: frame.kind,
        sourcePortraitId: portrait.id,
        sourceId: frame.sourceId,
        targetCanvasId: frame.targetCanvasId,
        capturedAt: frame.capturedAt,
        interpreted: descriptor,
        calibrated,
        calibration: { ...route.calibration },
      },
    };
    const acquisition = {
      schema: "individuals-frame-observation/v1",
      sourceKind: this.frameSource.kind,
      sourceId: frame.sourceId,
      targetCanvasId: frame.targetCanvasId,
      capturedAt: frame.capturedAt,
      calibration: route.calibration,
      perceivedDescriptor: evidence.perceived,
    };

    return {
      observerId: manifest.id,
      subjectId: portrait.subjectId,
      sourcePortrait: portrait,
      perceivedArtwork: {
        format: "procedural",
        width: frame.artwork.width,
        height: frame.artwork.height,
        content: JSON.stringify(acquisition),
      },
      evidence,
      notes: [
        `${this.frameSource.kind} source "${route.sourceId}" read allowlisted canvas "${route.targetCanvasId}".`,
        `Calibration applied: ${route.calibration.focalLengthMm}mm at ${route.calibration.workingDistanceMeters}m, lens gain ${route.calibration.lensDistortionGain}, ${route.calibration.ambientIlluminationLux} lux.`,
        `Perception model "${manifest.perception.modelName}" applied after acquisition calibration.`,
      ],
    };
  }

  private routeKey(observerId: string, subjectId: string): string {
    return `${observerId}->${subjectId}`;
  }
}
