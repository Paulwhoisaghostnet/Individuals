import { describe, expect, it } from "vitest";
import { CameraObservationSystem } from "../cameraObservation";
import { CommissioningChecklist } from "../../../../hardware/operations/commissioning/checklist";
import { createTemplateManifest } from "../../core/template/manifest";
import { createInitialState } from "../../core/createInitialState";

describe("Camera Observation & Commissioning (Milestone 4.1)", () => {
  it("captures peer canvas artwork through calibrated optical camera lens simulation", async () => {
    const cameraSystem = new CameraObservationSystem({
      "iris->morrow": {
        cameraId: "cam-01",
        targetCanvasId: "canvas-morrow",
        focalLengthMm: 50,
        workingDistanceMeters: 2.0,
        ambientIlluminationLux: 500,
        lensDistortionGain: 0.02,
      },
    });

    const manifest = createTemplateManifest({ id: "iris" });
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const observation = await cameraSystem.observe({
      manifest,
      state,
      portrait: {
        id: "morrow-self-1",
        cycle: 1,
        artistId: "morrow",
        subjectId: "morrow",
        role: "self",
        createdAt: "2026-01-01T00:00:00Z",
        artwork: { format: "svg", width: 800, height: 1000, content: "<svg viewBox='0 0 800 1000'></svg>" },
        sourcePortraitIds: [],
      },
      cycle: 1,
      tuning: {},
    });

    expect(observation.observerId).toBe("iris");
    expect(observation.subjectId).toBe("morrow");
    expect(observation.perceivedArtwork.content).toContain('data-camera="cam-01"');
    expect(observation.notes[0]).toContain('Camera "cam-01" captured peer canvas');
  });

  it("validates hardware commissioning reports correctly", () => {
    const validReport = {
      venueName: "Tate Modern",
      date: "2026-06-01",
      displayCalibrationPassed: true,
      cameraPeerTargetingVerified: true,
      mountingSafetyCertified: true,
      upsPowerBackupVerified: true,
      maxThermalCelsius: 38,
      thermalLimitCelsius: 45,
    };

    const result = CommissioningChecklist.validate(validReport);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);

    const invalidReport = {
      ...validReport,
      cameraPeerTargetingVerified: false,
      maxThermalCelsius: 52,
    };

    const invalidResult = CommissioningChecklist.validate(invalidReport);
    expect(invalidResult.passed).toBe(false);
    expect(invalidResult.issues.length).toBeGreaterThanOrEqual(2);
  });
});
