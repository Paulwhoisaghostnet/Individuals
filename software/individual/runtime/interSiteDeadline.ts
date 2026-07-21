import {
  SystemRuntimeScheduler,
  type RuntimeScheduler,
  type RuntimeTimerHandle,
} from "./scheduler";

export type InterSiteOperation = "transport_delivery" | "message_application";

export const DEFAULT_INTER_SITE_DELIVERY_TIMEOUT_MS = 15_000;
export const DEFAULT_INTER_SITE_APPLICATION_TIMEOUT_MS = 10_000;
export const MAX_INTER_SITE_OPERATION_TIMEOUT_MS = 300_000;

const deadlineErrors = new WeakSet<object>();

export class InterSiteDeadlineExceededError extends Error {
  readonly code = "INTER_SITE_DEADLINE_EXCEEDED" as const;

  constructor(
    readonly operation: InterSiteOperation,
    readonly timeoutMs: number,
  ) {
    super(`Inter-site ${operation.replaceAll("_", " ")} exceeded its ${timeoutMs} ms deadline.`);
    this.name = "InterSiteDeadlineExceededError";
    deadlineErrors.add(this);
  }
}

/** Brand check that never invokes prototype traps on a hostile adapter error. */
export const isInterSiteDeadlineExceededError = (
  value: unknown,
): value is InterSiteDeadlineExceededError =>
  typeof value === "object" && value !== null && deadlineErrors.has(value);

export const validateInterSiteTimeout = (
  value: number | undefined,
  fallback: number,
  field: string,
): number => {
  const resolved = value ?? fallback;
  if (
    !Number.isSafeInteger(resolved) ||
    resolved < 1 ||
    resolved > MAX_INTER_SITE_OPERATION_TIMEOUT_MS
  ) {
    throw new Error(
      `${field} must be an integer between 1 and ${MAX_INTER_SITE_OPERATION_TIMEOUT_MS}.`,
    );
  }
  return resolved;
};

export interface InterSiteDeadlineRunnerOptions {
  readonly scheduler?: RuntimeScheduler;
}

/**
 * Bounds an adapter call even when the adapter ignores cancellation forever.
 *
 * The signal gives cooperative adapters an immediate cleanup path. The promise
 * completion guard is the bridge's independent containment boundary: a non-cooperative
 * adapter may continue in its own implementation, but it can no longer retain
 * the bridge's sequencing/state lock.
 */
export class InterSiteDeadlineRunner {
  private readonly scheduler: RuntimeScheduler;

  constructor(options: InterSiteDeadlineRunnerOptions = {}) {
    this.scheduler = options.scheduler ?? new SystemRuntimeScheduler();
  }

  run<T>(input: {
    readonly operation: InterSiteOperation;
    readonly timeoutMs: number;
    readonly execute: (signal: AbortSignal) => Promise<T>;
  }): Promise<T> {
    const controller = new AbortController();
    return new Promise<T>((resolve, reject) => {
      let timeoutHandle: RuntimeTimerHandle | undefined;
      let settled = false;
      const clearDeadline = (): void => {
        if (timeoutHandle !== undefined) this.scheduler.clearTimeout(timeoutHandle);
      };
      timeoutHandle = this.scheduler.setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new InterSiteDeadlineExceededError(input.operation, input.timeoutMs);
        // Reject with the bridge-owned category before notifying the adapter so
        // an adapter-controlled abort error cannot replace the deadline result.
        reject(error);
        try {
          controller.abort(error);
        } catch {
          // A hostile abort listener cannot replace the already-settled result.
        }
      }, input.timeoutMs);
      void Promise.resolve().then(async () => {
        if (settled) return;
        try {
          const value = await input.execute(controller.signal);
          if (settled) return;
          settled = true;
          clearDeadline();
          resolve(value);
        } catch (error) {
          if (settled) return;
          settled = true;
          clearDeadline();
          reject(error);
        }
      });
    });
  }
}
