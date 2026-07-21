import type { RuntimeScheduler, RuntimeTimerHandle } from "./scheduler";
import type { CycleRunResult } from "./cycleTypes";

export interface CycleDeadlineState {
  exceeded: boolean;
  attemptedCycle: number;
}

export interface CycleDeadlineOptions {
  readonly timeoutMs: number;
  readonly scheduler: RuntimeScheduler;
  readonly onExceeded: (
    error: CycleDeadlineExceededError,
    state: Readonly<CycleDeadlineState>,
  ) => void;
}

export class CycleDeadlineExceededError extends Error {
  constructor(timeoutMs: number) {
    super(`Identity cycle exceeded its ${timeoutMs} ms execution deadline.`);
    this.name = "CycleDeadlineExceededError";
  }
}

/**
 * A hard caller-facing deadline with a separate capacity-release fence.
 *
 * Timeout aborts cooperative work and frees shared society capacity, while the
 * executor retains its per-Individual in-flight fence until the underlying
 * operation actually settles. This prevents one stuck adapter from freezing
 * every peer without allowing overlapping writes for the same identity.
 */
export class CycleDeadline {
  readonly state: CycleDeadlineState = { exceeded: false, attemptedCycle: 0 };
  readonly signal: AbortSignal;
  readonly timedResult: Promise<CycleRunResult>;

  private readonly controller = new AbortController();
  private readonly timeoutHandle: RuntimeTimerHandle;
  private capacityRelease: (() => void) | undefined;
  private capacityReleased = false;
  private finished = false;

  constructor(private readonly options: CycleDeadlineOptions) {
    this.signal = this.controller.signal;
    let resolveTimeout!: (result: CycleRunResult) => void;
    this.timedResult = new Promise<CycleRunResult>((resolve) => {
      resolveTimeout = resolve;
    });
    this.timeoutHandle = options.scheduler.setTimeout(() => {
      if (this.finished) return;
      this.finished = true;
      this.state.exceeded = true;
      const error = new CycleDeadlineExceededError(options.timeoutMs);
      this.controller.abort(error);
      this.releaseCapacity();
      options.onExceeded(error, this.state);
      resolveTimeout({ status: "faulted" });
    }, options.timeoutMs);
  }

  bindCapacityRelease(release: () => void): void {
    this.capacityRelease = release;
    if (this.state.exceeded) this.releaseCapacity();
  }

  releaseCapacity(): void {
    if (this.capacityReleased || !this.capacityRelease) return;
    this.capacityReleased = true;
    this.capacityRelease();
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.options.scheduler.clearTimeout(this.timeoutHandle);
  }
}
