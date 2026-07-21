import type { RuntimeScheduler, RuntimeTimerHandle } from "./scheduler";

export type RuntimeBoundedOperation = "startup" | "state_projection" | "perception_tuning";

export class RuntimeOperationDeadlineExceededError extends Error {
  readonly code = "RUNTIME_OPERATION_DEADLINE_EXCEEDED" as const;

  constructor(
    readonly operation: RuntimeBoundedOperation,
    readonly timeoutMs: number,
  ) {
    super(`Runtime ${operation.replaceAll("_", " ")} exceeded its ${timeoutMs} ms deadline.`);
    this.name = "RuntimeOperationDeadlineExceededError";
  }
}

export class RuntimeInitializationDeadlineExceededError
  extends RuntimeOperationDeadlineExceededError
{
  constructor(timeoutMs: number) {
    super("startup", timeoutMs);
    this.name = "RuntimeInitializationDeadlineExceededError";
  }
}

export class RuntimeProjectionDeadlineExceededError
  extends RuntimeOperationDeadlineExceededError
{
  constructor(timeoutMs: number) {
    super("state_projection", timeoutMs);
    this.name = "RuntimeProjectionDeadlineExceededError";
  }
}

export class RuntimeControlDeadlineExceededError
  extends RuntimeOperationDeadlineExceededError
{
  constructor(timeoutMs: number) {
    super("perception_tuning", timeoutMs);
    this.name = "RuntimeControlDeadlineExceededError";
  }
}

const deadlineError = (
  operation: RuntimeBoundedOperation,
  timeoutMs: number,
): RuntimeOperationDeadlineExceededError => {
  switch (operation) {
    case "startup":
      return new RuntimeInitializationDeadlineExceededError(timeoutMs);
    case "state_projection":
      return new RuntimeProjectionDeadlineExceededError(timeoutMs);
    case "perception_tuning":
      return new RuntimeControlDeadlineExceededError(timeoutMs);
  }
};

/** One caller-facing deadline and AbortSignal for an entire runtime operation. */
export class RuntimeOperationDeadlineRunner {
  constructor(
    private readonly scheduler: RuntimeScheduler,
    private readonly timeoutMs: number,
  ) {}

  run<T>(
    operation: RuntimeBoundedOperation,
    execute: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    return new Promise<T>((resolve, reject) => {
      let timer: RuntimeTimerHandle | undefined;
      let settled = false;
      const clear = (): void => {
        if (timer !== undefined) this.scheduler.clearTimeout(timer);
      };
      timer = this.scheduler.setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = deadlineError(operation, this.timeoutMs);
        // Fix the public error category before notifying an adapter. Hostile
        // abort listeners cannot replace an already-settled deadline result.
        reject(error);
        try {
          controller.abort(error);
        } catch {
          // The operation is already rejected; abort-listener failure is local.
        }
      }, this.timeoutMs);

      void Promise.resolve().then(async () => {
        if (settled) return;
        try {
          const value = await execute(controller.signal);
          if (settled) return;
          settled = true;
          clear();
          resolve(value);
        } catch (error) {
          if (settled) return;
          settled = true;
          clear();
          reject(error);
        }
      });
    });
  }
}
