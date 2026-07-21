import {
  InMemoryCycleBudgetStore,
  type CycleBudgetStore,
} from "./cycleBudgetStore";

export interface CyclePolicyConfig {
  readonly maxConcurrentCycles: number;
  readonly maxCyclesPerWindow: number;
  readonly windowMs: number;
  readonly maxEstimatedProviderCallsPerUtcDay: number;
  readonly estimatedProviderCallsPerCycle: number;
  readonly minimumCycleSpacingMs: number;
}

export interface CycleAuthorization {
  readonly allowed: boolean;
  readonly reason?: "concurrency" | "rate" | "daily_provider_budget" | "spacing";
  readonly retryAfterMs?: number;
}

export interface CyclePolicyStatus {
  readonly windowCycles: number;
  readonly windowLimit: number;
  readonly estimatedProviderCallsToday: number;
  readonly dailyProviderCallLimit: number;
}

const DEFAULT_POLICY: CyclePolicyConfig = {
  maxConcurrentCycles: 2,
  maxCyclesPerWindow: 12,
  windowMs: 60_000,
  maxEstimatedProviderCallsPerUtcDay: 1_000,
  estimatedProviderCallsPerCycle: 2,
  minimumCycleSpacingMs: 1_000,
};

export class CyclePolicy {
  readonly config: CyclePolicyConfig;
  private readonly cycleStarts: number[] = [];
  private readonly lastStartByIndividual = new Map<string, number>();
  private dayKey = "";
  private dailyEstimatedProviderCalls = 0;
  private initialization: Promise<void> | undefined;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    config: Partial<CyclePolicyConfig> = {},
    private readonly budgetStore: CycleBudgetStore = new InMemoryCycleBudgetStore(),
  ) {
    this.config = { ...DEFAULT_POLICY, ...config };
    for (const [key, value] of Object.entries(this.config)) {
      const permitsZero = key === "minimumCycleSpacingMs" || key === "estimatedProviderCallsPerCycle";
      if (!Number.isSafeInteger(value) || value < (permitsZero ? 0 : 1)) {
        throw new Error(`Cycle policy field "${key}" has an invalid value.`);
      }
    }
  }

  async initialize(nowMs: number, signal?: AbortSignal): Promise<void> {
    const attempt = this.initialization ??= (async () => {
      const dayKey = this.utcDay(nowMs);
      const persisted = await this.awaitWithAbort(this.budgetStore.load(signal), signal);
      signal?.throwIfAborted();
      this.dayKey = dayKey;
      this.dailyEstimatedProviderCalls = persisted?.utcDay === dayKey
        ? persisted.estimatedProviderCalls
        : 0;
    })();
    try {
      return await this.awaitWithAbort(attempt, signal);
    } catch (error) {
      if (this.initialization === attempt) this.initialization = undefined;
      throw error;
    }
  }

  async tryReserve(input: {
    readonly individualId: string;
    readonly nowMs: number;
    readonly runningCycles: number;
    readonly signal?: AbortSignal;
  }): Promise<CycleAuthorization> {
    return this.exclusive(async () => {
      input.signal?.throwIfAborted();
      await this.initialize(input.nowMs, input.signal);
      input.signal?.throwIfAborted();
      const authorization = this.authorize(input);
      if (!authorization.allowed) return authorization;
      this.rollWindow(input.nowMs);
      this.rollDay(input.nowMs);
      const nextCalls =
        this.dailyEstimatedProviderCalls + this.config.estimatedProviderCallsPerCycle;
      if (this.config.estimatedProviderCallsPerCycle > 0) {
        await this.awaitWithAbort(
          this.budgetStore.save({
            schemaVersion: 1,
            utcDay: this.dayKey,
            estimatedProviderCalls: nextCalls,
          }, input.signal),
          input.signal,
        );
      }
      this.cycleStarts.push(input.nowMs);
      this.lastStartByIndividual.set(input.individualId, input.nowMs);
      this.dailyEstimatedProviderCalls = nextCalls;
      return authorization;
    });
  }

  authorize(input: {
    readonly individualId: string;
    readonly nowMs: number;
    readonly runningCycles: number;
  }): CycleAuthorization {
    this.rollWindow(input.nowMs);
    this.rollDay(input.nowMs);

    if (input.runningCycles >= this.config.maxConcurrentCycles) {
      return { allowed: false, reason: "concurrency", retryAfterMs: 250 };
    }

    const lastStart = this.lastStartByIndividual.get(input.individualId);
    if (
      lastStart !== undefined &&
      input.nowMs - lastStart < this.config.minimumCycleSpacingMs
    ) {
      return {
        allowed: false,
        reason: "spacing",
        retryAfterMs: this.config.minimumCycleSpacingMs - (input.nowMs - lastStart),
      };
    }

    if (this.cycleStarts.length >= this.config.maxCyclesPerWindow) {
      return {
        allowed: false,
        reason: "rate",
        retryAfterMs: Math.max(1, this.cycleStarts[0] + this.config.windowMs - input.nowMs),
      };
    }

    if (
      this.dailyEstimatedProviderCalls + this.config.estimatedProviderCallsPerCycle >
      this.config.maxEstimatedProviderCallsPerUtcDay
    ) {
      const nextUtcDay = Date.UTC(
        new Date(input.nowMs).getUTCFullYear(),
        new Date(input.nowMs).getUTCMonth(),
        new Date(input.nowMs).getUTCDate() + 1,
      );
      return {
        allowed: false,
        reason: "daily_provider_budget",
        retryAfterMs: Math.max(1, nextUtcDay - input.nowMs),
      };
    }

    return { allowed: true };
  }

  getStatus(nowMs: number): CyclePolicyStatus {
    this.rollWindow(nowMs);
    this.rollDay(nowMs);
    return {
      windowCycles: this.cycleStarts.length,
      windowLimit: this.config.maxCyclesPerWindow,
      estimatedProviderCallsToday: this.dailyEstimatedProviderCalls,
      dailyProviderCallLimit: this.config.maxEstimatedProviderCallsPerUtcDay,
    };
  }

  private rollWindow(nowMs: number): void {
    const cutoff = nowMs - this.config.windowMs;
    while (this.cycleStarts.length > 0 && this.cycleStarts[0] <= cutoff) {
      this.cycleStarts.shift();
    }
  }

  private rollDay(nowMs: number): void {
    const nextKey = this.utcDay(nowMs);
    if (nextKey !== this.dayKey) {
      this.dayKey = nextKey;
      this.dailyEstimatedProviderCalls = 0;
    }
  }

  private utcDay(nowMs: number): string {
    return new Date(nowMs).toISOString().slice(0, 10);
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.catch(() => undefined).then(operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async awaitWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return operation;
    signal.throwIfAborted();
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = (): void => rejectAbort(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await Promise.race([operation, aborted]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }
}
