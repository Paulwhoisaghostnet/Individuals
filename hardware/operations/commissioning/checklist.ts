export type CommissioningStatus = "passed" | "failed" | "not-run";

export interface EvidenceReference {
  readonly id: string;
  readonly type: "measurement" | "photograph" | "certificate" | "test-log" | "witness";
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly uri?: string;
  readonly sha256?: string;
  readonly notes?: string;
}

export interface EvidenceBackedCheck {
  readonly status: CommissioningStatus;
  readonly procedureId: string;
  readonly performedAt: string;
  readonly performedBy: string;
  readonly evidence: readonly EvidenceReference[];
}

export interface CommissioningReport {
  readonly siteId: string;
  readonly venueName: string;
  readonly reportId: string;
  readonly completedAt: string;
  readonly displayCalibration: EvidenceBackedCheck & {
    readonly calibrationProfileId: string;
  };
  readonly cameraPeerTargeting: EvidenceBackedCheck & {
    readonly routes: readonly {
      readonly sourceId: string;
      readonly targetCanvasId: string;
      readonly subjectId: string;
    }[];
    readonly visitorExclusionMethod: string;
  };
  readonly mountingSafety: EvidenceBackedCheck & {
    readonly certifierOrganization: string;
  };
  readonly upsRecovery: EvidenceBackedCheck & {
    readonly testedRuntimeMinutes: number;
    readonly automaticRestartObserved: boolean;
  };
  readonly thermalSoak: EvidenceBackedCheck & {
    readonly sensorId: string;
    readonly durationMinutes: number;
    readonly maxThermalCelsius: number;
    readonly thermalLimitCelsius: number;
  };
}

export interface ValidationResult {
  readonly passed: boolean;
  readonly issues: readonly string[];
  readonly evidenceCount: number;
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

const validTimestamp = (value: string): boolean => Number.isFinite(Date.parse(value));

export class CommissioningChecklist {
  static validate(report: CommissioningReport): ValidationResult {
    const issues: string[] = [];
    const seenEvidence = new Set<string>();
    let evidenceCount = 0;

    if (!SAFE_ID.test(report.siteId)) issues.push("Site ID is missing or invalid.");
    if (!SAFE_ID.test(report.reportId)) issues.push("Report ID is missing or invalid.");
    if (report.venueName.trim().length === 0) issues.push("Venue name is required.");
    if (!validTimestamp(report.completedAt)) issues.push("Report completion timestamp is invalid.");

    const validateCheck = (name: string, check: EvidenceBackedCheck): void => {
      if (check.status !== "passed") {
        issues.push(`${name} did not pass (status: ${check.status}).`);
      }
      if (!SAFE_ID.test(check.procedureId)) issues.push(`${name} procedure ID is invalid.`);
      if (check.performedBy.trim().length === 0) issues.push(`${name} performer is missing.`);
      if (!validTimestamp(check.performedAt)) issues.push(`${name} timestamp is invalid.`);
      if (check.evidence.length === 0) issues.push(`${name} has no supporting evidence.`);
      if (check.evidence.length > 20) issues.push(`${name} contains more than 20 evidence items.`);

      for (const evidence of check.evidence) {
        evidenceCount += 1;
        if (!SAFE_ID.test(evidence.id)) issues.push(`${name} has invalid evidence ID.`);
        if (seenEvidence.has(evidence.id)) issues.push(`Evidence ID "${evidence.id}" is duplicated.`);
        seenEvidence.add(evidence.id);
        if (!validTimestamp(evidence.recordedAt)) {
          issues.push(`Evidence "${evidence.id}" has an invalid timestamp.`);
        }
        if (evidence.recordedBy.trim().length === 0) {
          issues.push(`Evidence "${evidence.id}" has no recorder.`);
        }
        if (evidence.sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(evidence.sha256)) {
          issues.push(`Evidence "${evidence.id}" has an invalid SHA-256 digest.`);
        }
        if (evidence.uri !== undefined && evidence.uri.trim().length === 0) {
          issues.push(`Evidence "${evidence.id}" has an empty URI.`);
        }
      }
    };

    validateCheck("Display calibration", report.displayCalibration);
    validateCheck("Camera peer targeting", report.cameraPeerTargeting);
    validateCheck("Mounting safety", report.mountingSafety);
    validateCheck("UPS recovery", report.upsRecovery);
    validateCheck("Thermal soak", report.thermalSoak);

    if (!SAFE_ID.test(report.displayCalibration.calibrationProfileId)) {
      issues.push("Display calibration profile ID is invalid.");
    }
    if (report.cameraPeerTargeting.routes.length === 0) {
      issues.push("Camera peer targeting has no verified source-to-canvas routes.");
    }
    const routePairs = new Set<string>();
    for (const route of report.cameraPeerTargeting.routes) {
      if (![route.sourceId, route.targetCanvasId, route.subjectId].every((id) => SAFE_ID.test(id))) {
        issues.push("Camera peer targeting contains an invalid route identifier.");
      }
      const pair = `${route.sourceId}->${route.targetCanvasId}`;
      if (routePairs.has(pair)) issues.push(`Camera route "${pair}" is duplicated.`);
      routePairs.add(pair);
    }
    if (report.cameraPeerTargeting.visitorExclusionMethod.trim().length < 10) {
      issues.push("Camera visitor-exclusion method is not documented.");
    }
    if (report.mountingSafety.certifierOrganization.trim().length === 0) {
      issues.push("Mounting safety certifier organization is missing.");
    }
    if (
      !Number.isFinite(report.upsRecovery.testedRuntimeMinutes) ||
      report.upsRecovery.testedRuntimeMinutes <= 0
    ) {
      issues.push("UPS recovery test duration is invalid.");
    }
    if (!report.upsRecovery.automaticRestartObserved) {
      issues.push("UPS test did not observe automatic runtime restart.");
    }
    if (!SAFE_ID.test(report.thermalSoak.sensorId)) issues.push("Thermal sensor ID is invalid.");
    if (
      !Number.isFinite(report.thermalSoak.durationMinutes) ||
      report.thermalSoak.durationMinutes < 30
    ) {
      issues.push("Thermal soak must run for at least 30 minutes.");
    }
    if (
      !Number.isFinite(report.thermalSoak.maxThermalCelsius) ||
      !Number.isFinite(report.thermalSoak.thermalLimitCelsius)
    ) {
      issues.push("Thermal measurements must be finite.");
    } else if (report.thermalSoak.maxThermalCelsius > report.thermalSoak.thermalLimitCelsius) {
      issues.push(
        `Max recorded temperature (${report.thermalSoak.maxThermalCelsius}°C) exceeds threshold (${report.thermalSoak.thermalLimitCelsius}°C).`,
      );
    }

    return { passed: issues.length === 0, issues, evidenceCount };
  }
}
