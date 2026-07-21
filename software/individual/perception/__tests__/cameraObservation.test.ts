import { describe, expect, it } from "vitest";
import {
  CameraObservationSystem,
  type FrameSource,
  type PhysicalCameraCapturedFrame,
} from "../cameraObservation";
import {
  CommissioningChecklist,
  type EvidenceBackedCheck,
  type EvidenceReference,
} from "../../../../hardware/operations/commissioning/checklist";
import { createTemplateManifest } from "../../core/template/manifest";
import { createInitialState } from "../../core/createInitialState";
import {
  DEFAULT_ART_PRACTICE,
  defaultRenderingDescriptor,
  descriptorForLegacyPortrait,
  descriptorForPortrait,
} from "../../drawing/figureDescriptor";
import type { ArtworkDescriptor, Portrait } from "../../core/model";
import { createTemplateIndividual } from "../../testing-simulation/support/createTemplateIndividual";

const route = {
  observerId: "iris",
  subjectId: "morrow",
  sourceId: "view-morrow",
  targetCanvasId: "canvas-morrow",
  calibration: {
    focalLengthMm: 50,
    workingDistanceMeters: 2,
    ambientIlluminationLux: 500,
    lensDistortionGain: 0.12,
  },
} as const;

const sourcePortrait = (): Portrait => {
  const sourceManifest = createTemplateManifest({ id: "morrow", displayName: "Morrow" });
  const specification = sourceManifest.identity.idealPhysicalForm.visualSpecification!;
  const descriptor: ArtworkDescriptor = {
    schemaVersion: 1,
    figure: specification.figure,
    rendering: defaultRenderingDescriptor(),
    features: sourceManifest.identity.idealPhysicalForm.nonNegotiableFeatures.map((label) => ({
      label,
      prominence: 0.8,
    })),
    omittedFeatures: [],
    styleName: "commissioning source",
    primitives: ["line"],
    confidence: 0.9,
    anatomy: specification.anatomy,
    practice: DEFAULT_ART_PRACTICE,
  };
  const base: Portrait = {
    id: "morrow-self-1",
    cycle: 1,
    artistId: "morrow",
    subjectId: "morrow",
    role: "self",
    createdAt: "2026-01-01T00:00:00Z",
    artwork: {
      format: "svg",
      width: 800,
      height: 1000,
      content: "<svg viewBox='0 0 800 1000'></svg>",
    },
    descriptor,
    sourcePortraitIds: [],
  };
  return base;
};

describe("Camera Observation & Commissioning", () => {
  it("reads an allowlisted digital canvas and applies optical calibration before perception", async () => {
    const cameraSystem = new CameraObservationSystem({ routes: [route] });
    const manifest = createTemplateManifest({ id: "iris" });
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const observation = await cameraSystem.observe({
      manifest,
      state,
      portrait: sourcePortrait(),
      cycle: 1,
      tuning: Object.fromEntries(
        manifest.perception.controls.map((control) => [control.id, control.defaultValue]),
      ),
    });

    expect(observation.observerId).toBe("iris");
    expect(observation.subjectId).toBe("morrow");
    expect(observation.perceivedArtwork.format).toBe("procedural");
    expect(observation.perceivedArtwork.content).toContain('"sourceKind":"digital-canvas"');
    expect(observation.notes[0]).toContain("read allowlisted canvas");
    expect(observation.evidence?.source).toEqual(sourcePortrait().descriptor);
    expect(observation.evidence?.acquisition?.calibrated.figure.torsoWidth).not.toBe(
      sourcePortrait().descriptor?.figure.torsoWidth,
    );
  });

  it("rejects a physical camera source without an explicit frame interpreter", () => {
    const physicalSource: FrameSource = {
      kind: "physical-camera",
      async capture() {
        const portrait = sourcePortrait();
        return {
          kind: "physical-camera",
          sourceId: route.sourceId,
          targetCanvasId: route.targetCanvasId,
          subjectId: route.subjectId,
          capturedAt: "2026-01-01T00:00:00Z",
          artwork: {
            format: "raster-reference",
            width: portrait.artwork.width,
            height: portrait.artwork.height,
            content: "captured-pixels://frame-1",
          },
          // Even if a camera adapter copies digital truth here, the constructor
          // requires an independent pixel interpreter for physical acquisition.
          descriptor: portrait.descriptor,
        } as unknown as PhysicalCameraCapturedFrame;
      },
    };
    expect(
      () => new CameraObservationSystem({ routes: [route], frameSource: physicalSource }),
    ).toThrow(/FrameInterpreter/);
  });

  it("rejects corrupt physical interpretation instead of clamping it into evidence", async () => {
    const physicalSource: FrameSource = {
      kind: "physical-camera",
      async capture() {
        const portrait = sourcePortrait();
        return {
          kind: "physical-camera",
          sourceId: route.sourceId,
          targetCanvasId: route.targetCanvasId,
          subjectId: route.subjectId,
          capturedAt: "2026-01-01T00:00:00Z",
          artwork: {
            format: "raster-reference",
            width: portrait.artwork.width,
            height: portrait.artwork.height,
            content: "captured-pixels://frame-2",
          },
        };
      },
    };
    const valid = sourcePortrait().descriptor!;
    const cameraSystem = new CameraObservationSystem({
      routes: [route],
      frameSource: physicalSource,
      frameInterpreter: {
        async interpret() {
          return {
            ...valid,
            figure: { ...valid.figure, torsoWidth: Number.POSITIVE_INFINITY },
            unexpectedPrivateModelOutput: "must not survive",
          } as ArtworkDescriptor;
        },
      },
    });
    const manifest = createTemplateManifest({ id: "iris" });
    await expect(cameraSystem.observe({
      manifest,
      state: createInitialState(manifest, "2026-01-01T00:00:00Z"),
      portrait: sourcePortrait(),
      cycle: 1,
      tuning: { "distortion-strength": 0.25 },
    })).rejects.toThrow(/invalid field set|finite number/);
  });

  it("rejects descriptor-bearing physical frames and unchanged pass-through interpretations", async () => {
    const manifest = createTemplateManifest({ id: "iris" });
    const observe = (frameSource: FrameSource, descriptor: ArtworkDescriptor) =>
      new CameraObservationSystem({
        routes: [route],
        frameSource,
        frameInterpreter: {
          async interpret(frame) {
            expect(Object.hasOwn(frame, "descriptor")).toBe(false);
            expect(Object.hasOwn(frame, "sourcePortrait")).toBe(false);
            return descriptor;
          },
        },
      }).observe({
        manifest,
        state: createInitialState(manifest, "2026-01-01T00:00:00Z"),
        portrait: sourcePortrait(),
        cycle: 1,
        tuning: { "distortion-strength": 0.25 },
      });
    const pixels = {
      format: "raster-reference" as const,
      width: 800,
      height: 1000,
      content: "captured-pixels://frame-adversarial",
    };
    const descriptorBearing: FrameSource = {
      kind: "physical-camera",
      async capture() {
        return {
          kind: "physical-camera",
          sourceId: route.sourceId,
          targetCanvasId: route.targetCanvasId,
          subjectId: route.subjectId,
          capturedAt: "2026-01-01T00:00:00Z",
          artwork: pixels,
          descriptor: sourcePortrait().descriptor,
        } as unknown as PhysicalCameraCapturedFrame;
      },
    };
    await expect(observe(descriptorBearing, {
      ...sourcePortrait().descriptor!,
      figure: { ...sourcePortrait().descriptor!.figure, torsoWidth: 0.61 },
    })).rejects.toThrow(/cannot carry a source portrait descriptor/);

    const descriptorFree: FrameSource = {
      kind: "physical-camera",
      async capture() {
        return {
          kind: "physical-camera",
          sourceId: route.sourceId,
          targetCanvasId: route.targetCanvasId,
          subjectId: route.subjectId,
          capturedAt: "2026-01-01T00:00:00Z",
          artwork: pixels,
        };
      },
    };
    await expect(
      observe(descriptorFree, sourcePortrait().descriptor!),
    ).rejects.toThrow(/pass through.*unchanged/);
  });

  it("runs a physical-camera cycle from descriptor-free pixels with verifiable acquisition evidence", async () => {
    const physicalSource: FrameSource = {
      kind: "physical-camera",
      async capture() {
        return {
          kind: "physical-camera",
          sourceId: route.sourceId,
          targetCanvasId: route.targetCanvasId,
          subjectId: route.subjectId,
          capturedAt: "2026-01-01T00:00:01Z",
          artwork: {
            format: "raster-reference",
            width: 800,
            height: 1000,
            content: "captured-pixels://commissioned-frame",
          },
        };
      },
    };
    const interpreted = {
      ...sourcePortrait().descriptor!,
      figure: {
        ...sourcePortrait().descriptor!.figure,
        torsoWidth: 0.61,
        centerX: 0.47,
      },
      confidence: 0.74,
    };
    const perception = new CameraObservationSystem({
      routes: [route],
      frameSource: physicalSource,
      frameInterpreter: {
        async interpret(frame) {
          expect(frame.artwork.content).toBe("captured-pixels://commissioned-frame");
          expect(Object.hasOwn(frame, "descriptor")).toBe(false);
          return interpreted;
        },
      },
    });
    const individual = createTemplateIndividual({
      manifest: createTemplateManifest({ id: "iris", displayName: "Iris" }),
      perception,
      allowedPeerIds: ["morrow"],
    });

    const record = await individual.runCycle({
      peerSelfPortraits: [sourcePortrait()],
      receivedPeerPortraits: [],
    });

    const evidence = record.peerPortraits[0].observationEvidence!;
    expect(evidence.source).toEqual(sourcePortrait().descriptor);
    expect(evidence.acquisition).toMatchObject({
      sourceKind: "physical-camera",
      sourcePortraitId: "morrow-self-1",
      interpreted: { figure: { torsoWidth: 0.61, centerX: 0.47 } },
    });
    expect(evidence.acquisition?.calibrated).not.toEqual(evidence.acquisition?.interpreted);
  });

  it("threads cycle cancellation through physical capture and interpretation", async () => {
    const controller = new AbortController();
    const physicalSource: FrameSource = {
      kind: "physical-camera",
      async capture(input) {
        expect(input.signal).toBe(controller.signal);
        return {
          kind: "physical-camera",
          sourceId: route.sourceId,
          targetCanvasId: route.targetCanvasId,
          subjectId: route.subjectId,
          capturedAt: "2026-01-01T00:00:01Z",
          artwork: {
            format: "raster-reference",
            width: 800,
            height: 1000,
            content: "captured-pixels://abort-frame",
          },
        };
      },
    };
    const cameraSystem = new CameraObservationSystem({
      routes: [route],
      frameSource: physicalSource,
      frameInterpreter: {
        async interpret(frame) {
          expect(frame.signal).toBe(controller.signal);
          controller.abort();
          return {
            ...sourcePortrait().descriptor!,
            figure: { ...sourcePortrait().descriptor!.figure, torsoWidth: 0.61 },
          };
        },
      },
    });
    const manifest = createTemplateManifest({ id: "iris" });

    await expect(cameraSystem.observe({
      manifest,
      state: createInitialState(manifest, "2026-01-01T00:00:00Z"),
      portrait: sourcePortrait(),
      cycle: 1,
      tuning: { "distortion-strength": 0.25 },
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("never invents a plausible body for a live descriptor-less canvas", () => {
    const { descriptor: _descriptor, ...legacy } = sourcePortrait();
    expect(() => descriptorForPortrait(legacy)).toThrow(/cannot invent one/);

    const explicitlyImported = descriptorForLegacyPortrait(legacy);
    expect(explicitlyImported.styleName).toBe("legacy source");
    expect(explicitlyImported.omittedFeatures).toContain(
      "source artwork supplied no structured descriptor",
    );
  });

  it("requires evidence-backed commissioning rather than caller-supplied booleans", () => {
    const evidence = (id: string, type: EvidenceReference["type"]): EvidenceReference => ({
      id,
      type,
      recordedAt: "2026-06-01T12:00:00Z",
      recordedBy: "commissioning-team",
      uri: `evidence://${id}`,
      sha256: "a".repeat(64),
    });
    const check = (id: string, type: EvidenceReference["type"]): EvidenceBackedCheck => ({
      status: "passed",
      procedureId: `procedure-${id}`,
      performedAt: "2026-06-01T12:00:00Z",
      performedBy: "commissioning-team",
      evidence: [evidence(`evidence-${id}`, type)],
    });
    const validReport = {
      siteId: "london",
      venueName: "Tate Modern",
      reportId: "report-2026-06",
      completedAt: "2026-06-01T15:00:00Z",
      displayCalibration: {
        ...check("display", "measurement"),
        calibrationProfileId: "display-profile-01",
      },
      cameraPeerTargeting: {
        ...check("camera", "photograph"),
        routes: [{ sourceId: "cam-01", targetCanvasId: "canvas-morrow", subjectId: "morrow" }],
        visitorExclusionMethod: "Fixed crop and masking verified with occupied gallery walkthrough.",
      },
      mountingSafety: {
        ...check("mount", "certificate"),
        certifierOrganization: "Venue Engineering",
      },
      upsRecovery: {
        ...check("ups", "test-log"),
        testedRuntimeMinutes: 45,
        automaticRestartObserved: true,
      },
      thermalSoak: {
        ...check("thermal", "measurement"),
        sensorId: "sensor-01",
        durationMinutes: 120,
        maxThermalCelsius: 38,
        thermalLimitCelsius: 45,
      },
    } as const;

    expect(CommissioningChecklist.validate(validReport).passed).toBe(true);
    const invalid = {
      ...validReport,
      cameraPeerTargeting: { ...validReport.cameraPeerTargeting, evidence: [] },
      thermalSoak: { ...validReport.thermalSoak, maxThermalCelsius: 52 },
    };
    const result = CommissioningChecklist.validate(invalid);
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});
