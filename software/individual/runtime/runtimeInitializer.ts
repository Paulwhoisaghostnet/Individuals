import type { HealthMonitor } from "../observability/healthMonitor";
import type { CyclePolicy } from "./cyclePolicy";
import type { PerceptionTuningController } from "./perceptionTuningController";
import type {
  RuntimeClock,
  RuntimeScheduler,
  RuntimeTimerHandle,
} from "./scheduler";

export { RuntimeInitializationDeadlineExceededError } from "./runtimeOperationDeadline";

export interface RecoverableRuntimePersistence {
  recover(signal?: AbortSignal): Promise<{
    readonly recoveredTransactions: number;
    readonly abandonedTransactions: number;
  }>;
}

export interface RuntimeInitializerOptions {
  readonly persistence?: RecoverableRuntimePersistence;
  readonly tuning: PerceptionTuningController;
  readonly cyclePolicy: CyclePolicy;
  readonly health: HealthMonitor;
  readonly clock: RuntimeClock;
  readonly scheduler: RuntimeScheduler;
  readonly cycleTimeoutMs: number;
  readonly onStateChanged: () => void;
}

/** Owns one-time recovery/config loading and its bounded cycle admission wait. */
export class RuntimeInitializer {
  private initialization: Promise<void> | undefined;

  constructor(private readonly options: RuntimeInitializerOptions) {}

  async ensure(signal?: AbortSignal): Promise<void> {
    if (!this.initialization) {
      const attempt = this.initialize(signal);
      this.initialization = attempt;
      void attempt.catch(() => {
        if (this.initialization === attempt) this.initialization = undefined;
      });
    }
    const attempt = this.initialization;
    try {
      return await this.awaitWithAbort(attempt, signal);
    } catch (error) {
      // The initialization coroutine receives the same signal and checks it
      // before every later state mutation. Detach an aborted, non-cooperative
      // adapter attempt so a retry can start fresh; the old attempt cannot
      // clear or mutate a newer epoch when it eventually settles.
      if (signal?.aborted && this.initialization === attempt) {
        this.initialization = undefined;
      }
      throw error;
    }
  }

  async forCycle(individualId: string): Promise<boolean> {
    const controller = new AbortController();
    let timeoutHandle: RuntimeTimerHandle | undefined;
    const timeout = new Promise<false>((resolve) => {
      timeoutHandle = this.options.scheduler.setTimeout(() => {
        const error = new Error("Cycle initialization exceeded its deadline.");
        error.name = "CycleDeadlineExceededError";
        controller.abort(error);
        this.options.health.recordDeadlineExceeded(individualId, 0, error);
        this.options.onStateChanged();
        resolve(false);
      }, this.options.cycleTimeoutMs);
    });
    try {
      return await Promise.race([
        this.ensure(controller.signal).then(
          () => true as const,
          (error) => {
            if (controller.signal.aborted) return false as const;
            throw error;
          },
        ),
        timeout,
      ]);
    } finally {
      if (timeoutHandle !== undefined) this.options.scheduler.clearTimeout(timeoutHandle);
    }
  }

  private async initialize(signal?: AbortSignal): Promise<void> {
    if (this.options.persistence) {
      const recovery = await this.options.persistence.recover(signal);
      signal?.throwIfAborted();
      if (recovery.recoveredTransactions > 0 || recovery.abandonedTransactions > 0) {
        this.options.health.recordRecovery(recovery);
      }
    }
    await this.options.tuning.initialize(signal);
    signal?.throwIfAborted();
    await this.options.cyclePolicy.initialize(this.options.clock.now().getTime(), signal);
    signal?.throwIfAborted();
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
