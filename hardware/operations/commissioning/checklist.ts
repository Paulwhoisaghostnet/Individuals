export interface CommissioningReport {
  readonly venueName: string;
  readonly date: string;
  readonly displayCalibrationPassed: boolean;
  readonly cameraPeerTargetingVerified: boolean; // Confirms camera observes canvas, not visitors
  readonly mountingSafetyCertified: boolean;
  readonly upsPowerBackupVerified: boolean;
  readonly maxThermalCelsius: number;
  readonly thermalLimitCelsius: number;
}

export interface ValidationResult {
  readonly passed: boolean;
  readonly issues: readonly string[];
}

export class CommissioningChecklist {
  static validate(report: CommissioningReport): ValidationResult {
    const issues: string[] = [];

    if (!report.displayCalibrationPassed) {
      issues.push("Display color/geometry calibration has not passed verification.");
    }
    if (!report.cameraPeerTargetingVerified) {
      issues.push("Camera alignment MUST be verified to target peer canvases exclusively, ignoring visitors.");
    }
    if (!report.mountingSafetyCertified) {
      issues.push("Physical display mounting safety certification is missing.");
    }
    if (!report.upsPowerBackupVerified) {
      issues.push("UPS power continuity & auto-recovery backup is unverified.");
    }
    if (report.maxThermalCelsius > report.thermalLimitCelsius) {
      issues.push(`Max recorded temperature (${report.maxThermalCelsius}°C) exceeds thermal threshold (${report.thermalLimitCelsius}°C).`);
    }

    return {
      passed: issues.length === 0,
      issues,
    };
  }
}
