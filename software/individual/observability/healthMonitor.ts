export type HealthState = "healthy" | "degraded" | "faulted";

export type TelemetryEventType =
  | "cycle_start"
  | "cycle_complete"
  | "cycle_fault"
  | "state_change"
  | "curatorial_action";

export interface TelemetryEvent {
  readonly timestamp: string;
  readonly individualId: string;
  readonly type: TelemetryEventType;
  readonly cycle?: number;
  readonly latencyMs?: number;
  readonly error?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface IndividualHealth {
  readonly individualId: string;
  readonly state: HealthState;
  readonly lastCycle?: number;
  readonly lastCompletedAt?: string;
  readonly consecutiveFaults: number;
  readonly lastError?: string;
}

export class HealthMonitor {
  private readonly healthMap = new Map<string, IndividualHealth>();
  private readonly events: TelemetryEvent[] = [];

  constructor(individualIds: readonly string[] = []) {
    for (const id of individualIds) {
      this.healthMap.set(id, {
        individualId: id,
        state: "healthy",
        consecutiveFaults: 0,
      });
    }
  }

  recordStart(individualId: string, cycle: number): void {
    this.emit({
      timestamp: new Date().toISOString(),
      individualId,
      type: "cycle_start",
      cycle,
    });
  }

  recordComplete(individualId: string, cycle: number, latencyMs: number): void {
    const current = this.getHealth(individualId);
    this.healthMap.set(individualId, {
      ...current,
      state: "healthy",
      lastCycle: cycle,
      lastCompletedAt: new Date().toISOString(),
      consecutiveFaults: 0,
      lastError: undefined,
    });

    this.emit({
      timestamp: new Date().toISOString(),
      individualId,
      type: "cycle_complete",
      cycle,
      latencyMs,
    });
  }

  recordFault(individualId: string, cycle: number, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const current = this.getHealth(individualId);
    const consecutiveFaults = current.consecutiveFaults + 1;
    const state: HealthState = consecutiveFaults >= 3 ? "faulted" : "degraded";

    this.healthMap.set(individualId, {
      ...current,
      state,
      consecutiveFaults,
      lastError: errorMessage,
    });

    this.emit({
      timestamp: new Date().toISOString(),
      individualId,
      type: "cycle_fault",
      cycle,
      error: this.redact(errorMessage),
    });
  }

  recordAction(individualId: string, action: string, details?: Record<string, unknown>): void {
    this.emit({
      timestamp: new Date().toISOString(),
      individualId,
      type: "curatorial_action",
      details: { action, ...details },
    });
  }

  getHealth(individualId: string): IndividualHealth {
    return (
      this.healthMap.get(individualId) ?? {
        individualId,
        state: "healthy",
        consecutiveFaults: 0,
      }
    );
  }

  getAllHealth(): readonly IndividualHealth[] {
    return Array.from(this.healthMap.values());
  }

  getRecentEvents(limit = 50): readonly TelemetryEvent[] {
    return this.events.slice(-limit);
  }

  private emit(event: TelemetryEvent): void {
    this.events.push(event);
  }

  private redact(message: string): string {
    // Redact any accidental prompt or private token leaks
    return message.replace(/(prompt|key|secret|bearer\s+[a-z0-9_\-]+)=?[^\s]*/gi, "$1=[REDACTED]");
  }
}
