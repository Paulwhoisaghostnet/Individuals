export type HealthState = "healthy" | "degraded" | "faulted";

export type OperationalFaultCode =
  | "cycle_execution_failed"
  | "cycle_deadline_exceeded"
  | "scheduler_execution_failed"
  | "runtime_failure";

export type TelemetryEventType =
  | "cycle_start"
  | "cycle_complete"
  | "cycle_fault"
  | "provider_fallback"
  | "cycle_budget_denied"
  | "persistence_recovery"
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
  readonly providerFallbacks: number;
  readonly lastProviderFailureAt?: string;
  readonly lastError?: string;
}

export interface TelemetrySink {
  write(event: TelemetryEvent): void | Promise<void>;
}

export interface HealthMonitorOptions {
  readonly maxEvents?: number;
  readonly maxSubscribers?: number;
  readonly now?: () => Date;
  readonly sink?: TelemetrySink;
}

export type TelemetrySubscriber = (event: TelemetryEvent) => void;

const SENSITIVE_KEY = /(prompt|private|narrative|memory|token|secret|authorization|cookie|api[-_]?key)/i;

const OPERATIONAL_FAULT_CODES = new Set<OperationalFaultCode>([
  "cycle_execution_failed",
  "cycle_deadline_exceeded",
  "scheduler_execution_failed",
  "runtime_failure",
]);

const PROVIDER_FAILURE_CATEGORIES = new Set([
  "configuration",
  "authentication",
  "rate-limit",
  "timeout",
  "unavailable",
  "invalid-response",
  "unknown",
]);

const normalizeFaultCode = (code: OperationalFaultCode | undefined): OperationalFaultCode =>
  code && OPERATIONAL_FAULT_CODES.has(code) ? code : "runtime_failure";

const normalizeProviderCategory = (category: string | undefined): string =>
  category && PROVIDER_FAILURE_CATEGORIES.has(category) ? category : "unknown";

const sanitizeDetails = (
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const safe: Record<string, unknown> = {};
  let entries: [string, unknown][];
  try {
    entries = Object.entries(details);
  } catch {
    return { sanitization: "unavailable" };
  }
  for (const [key, value] of entries) {
    try {
      if (SENSITIVE_KEY.test(key)) {
        safe[key] = "[REDACTED]";
      } else if (typeof value === "string") {
        safe[key] = value.slice(0, 500);
      } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
        safe[key] = value;
      } else if (Array.isArray(value)) {
        safe[key] = value.slice(0, 20).map((item) =>
          typeof item === "string" ? item.slice(0, 200) : "[STRUCTURED_VALUE]",
        );
      } else {
        safe[key] = "[STRUCTURED_VALUE]";
      }
    } catch {
      safe[key] = "[UNAVAILABLE]";
    }
  }
  return safe;
};

export class HealthMonitor {
  private readonly healthMap = new Map<string, IndividualHealth>();
  private readonly events: TelemetryEvent[] = [];
  private readonly subscribers = new Set<TelemetrySubscriber>();
  private readonly providerFallbackCycles = new Map<string, number>();
  private readonly maxEvents: number;
  private readonly maxSubscribers: number;
  private readonly now: () => Date;
  private readonly sink: TelemetrySink | undefined;
  private droppedEvents = 0;
  private sinkFailures = 0;

  constructor(
    individualIds: readonly string[] = [],
    options: HealthMonitorOptions = {},
  ) {
    const requestedMaxEvents = options.maxEvents ?? 1_000;
    if (
      !Number.isSafeInteger(requestedMaxEvents) ||
      requestedMaxEvents < 1 ||
      requestedMaxEvents > 1_000_000
    ) {
      throw new Error("maxEvents must be an integer between 1 and 1000000.");
    }
    this.maxEvents = requestedMaxEvents;
    const requestedMaxSubscribers = options.maxSubscribers ?? 128;
    if (
      !Number.isSafeInteger(requestedMaxSubscribers) ||
      requestedMaxSubscribers < 1 ||
      requestedMaxSubscribers > 10_000
    ) {
      throw new Error("maxSubscribers must be an integer between 1 and 10000.");
    }
    this.maxSubscribers = requestedMaxSubscribers;
    this.now = options.now ?? (() => new Date());
    this.sink = options.sink;
    for (const id of individualIds) {
      this.healthMap.set(id, this.createHealthy(id));
    }
  }

  recordStart(individualId: string, cycle: number): void {
    this.emit({
      timestamp: this.timestamp(),
      individualId,
      type: "cycle_start",
      cycle,
    });
  }

  recordComplete(individualId: string, cycle: number, latencyMs: number): void {
    const current = this.getHealth(individualId);
    const usedFallback = this.providerFallbackCycles.get(individualId) === cycle;
    this.healthMap.set(individualId, {
      ...current,
      state: usedFallback ? "degraded" : "healthy",
      lastCycle: cycle,
      lastCompletedAt: this.timestamp(),
      consecutiveFaults: 0,
      lastError: usedFallback ? current.lastError : undefined,
    });

    this.emit({
      timestamp: this.timestamp(),
      individualId,
      type: "cycle_complete",
      cycle,
      latencyMs: Math.max(0, Math.round(latencyMs)),
      details: usedFallback ? { cognitionMode: "fallback" } : undefined,
    });
  }

  recordFault(
    individualId: string,
    cycle: number,
    _error: unknown,
    code: OperationalFaultCode = "cycle_execution_failed",
  ): void {
    // Exception messages are untrusted provider/adapter data. Telemetry keeps
    // only a caller-selected, allowlisted operational code.
    const errorCode = normalizeFaultCode(code);
    this.recordOperationalFault(individualId, cycle, errorCode, false);
  }

  /**
   * A hard deadline keeps the per-Individual overlap fence closed until the
   * abandoned adapter actually settles. That Individual is therefore
   * unavailable, not merely degraded, and readiness must say so immediately.
   */
  recordDeadlineExceeded(individualId: string, cycle: number, _error: unknown): void {
    this.recordOperationalFault(individualId, cycle, "cycle_deadline_exceeded", true);
  }

  recordProviderFallback(input: {
    individualId: string;
    cycle: number;
    operation: "form_intent" | "reflect";
    provider?: string;
    error: unknown;
    category?: string;
    retryable?: boolean;
  }): void {
    const current = this.getHealth(input.individualId);
    const timestamp = this.timestamp();
    // Never inspect or stringify input.error. Error objects can contain private
    // prose, secret paths, provider bodies, or hostile property traps.
    const category = normalizeProviderCategory(input.category);
    const errorCode = `provider_${category.replace("-", "_")}`;
    this.providerFallbackCycles.set(input.individualId, input.cycle);
    this.healthMap.set(input.individualId, {
      ...current,
      state: current.state === "faulted" ? "faulted" : "degraded",
      providerFallbacks: current.providerFallbacks + 1,
      lastProviderFailureAt: timestamp,
      lastError: errorCode,
    });
    this.emit({
      timestamp,
      individualId: input.individualId,
      type: "provider_fallback",
      cycle: input.cycle,
      error: errorCode,
      details: {
        operation: input.operation,
        provider: input.provider === "configured-provider" ? input.provider : "configured-provider",
        category,
        retryable: input.retryable ?? false,
      },
    });
  }

  recordBudgetDenied(individualId: string, details: Record<string, unknown>): void {
    this.emit({
      timestamp: this.timestamp(),
      individualId,
      type: "cycle_budget_denied",
      details: sanitizeDetails(details),
    });
  }

  recordRecovery(details: Record<string, unknown>): void {
    this.emit({
      timestamp: this.timestamp(),
      individualId: "society",
      type: "persistence_recovery",
      details: sanitizeDetails(details),
    });
  }

  recordAction(individualId: string, action: string, details?: Record<string, unknown>): void {
    const safeDetails = details ? sanitizeDetails(details) : {};
    this.emit({
      timestamp: this.timestamp(),
      individualId,
      type: "curatorial_action",
      details: sanitizeDetails({ action, ...safeDetails }),
    });
  }

  recordStateChange(state: string, details?: Record<string, unknown>): void {
    const safeDetails = details ? sanitizeDetails(details) : {};
    this.emit({
      timestamp: this.timestamp(),
      individualId: "society",
      type: "state_change",
      details: sanitizeDetails({ state, ...safeDetails }),
    });
  }

  getHealth(individualId: string): IndividualHealth {
    return this.healthMap.get(individualId) ?? this.createHealthy(individualId);
  }

  getAllHealth(): readonly IndividualHealth[] {
    return Array.from(this.healthMap.values());
  }

  getRecentEvents(limit = 50): readonly TelemetryEvent[] {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Event limit must be non-negative.");
    return this.events.slice(-Math.min(limit, this.maxEvents));
  }

  subscribe(listener: TelemetrySubscriber): () => void {
    if (!this.subscribers.has(listener) && this.subscribers.size >= this.maxSubscribers) {
      throw new Error("Telemetry subscriber capacity is exhausted.");
    }
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  getDiagnostics(): {
    readonly retainedEvents: number;
    readonly droppedEvents: number;
    readonly sinkFailures: number;
    readonly subscribers: number;
  } {
    return {
      retainedEvents: this.events.length,
      droppedEvents: this.droppedEvents,
      sinkFailures: this.sinkFailures,
      subscribers: this.subscribers.size,
    };
  }

  private emit(input: TelemetryEvent): void {
    const event: TelemetryEvent = {
      ...input,
      error: input.error,
      details: input.details ? sanitizeDetails(input.details) : undefined,
    };
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      const removed = this.events.length - this.maxEvents;
      this.events.splice(0, removed);
      this.droppedEvents += removed;
    }

    for (const listener of this.subscribers) {
      try {
        listener(event);
      } catch {
        // Telemetry consumers are isolated from the identity runtime.
      }
    }

    try {
      const result = this.sink?.write(event);
      if (result !== undefined) {
        void Promise.resolve(result).catch(() => {
          this.sinkFailures += 1;
        });
      }
    } catch {
      this.sinkFailures += 1;
    }
  }

  private recordOperationalFault(
    individualId: string,
    cycle: number,
    errorCode: OperationalFaultCode,
    immediatelyFaulted: boolean,
  ): void {
    const current = this.getHealth(individualId);
    const consecutiveFaults = current.consecutiveFaults + 1;
    const state: HealthState = immediatelyFaulted || consecutiveFaults >= 3
      ? "faulted"
      : "degraded";
    this.healthMap.set(individualId, {
      ...current,
      state,
      consecutiveFaults,
      lastError: errorCode,
    });
    this.emit({
      timestamp: this.timestamp(),
      individualId,
      type: "cycle_fault",
      cycle,
      error: errorCode,
    });
  }

  private createHealthy(individualId: string): IndividualHealth {
    return {
      individualId,
      state: "healthy",
      consecutiveFaults: 0,
      providerFallbacks: 0,
    };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

}
