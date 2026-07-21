export const SNAPSHOT_REQUEST_TIMEOUT_MS = 8_000;
export const CONTROL_REQUEST_TIMEOUT_MS = 15_000;

export class RequestDeadlineError extends Error {
  constructor() {
    super("The society runtime did not answer before the request deadline.");
    this.name = "RequestDeadlineError";
  }
}

export class RequestAbortedError extends Error {
  constructor() {
    super("The society runtime request was cancelled.");
    this.name = "RequestAbortedError";
  }
}

interface DeadlineTimers {
  readonly setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  readonly clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
}

const defaultTimers: DeadlineTimers = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
};

/**
 * Gives the browser-side adapter one hard deadline, including response-body
 * consumption. The race also releases callers when a test double or broken
 * adapter ignores AbortSignal; the owned signal still cancels native fetch.
 */
export async function runWithRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
  timers: DeadlineTimers = defaultTimers,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new Error("Request deadline must be a positive finite number.");
  }
  if (callerSignal?.aborted) throw new RequestAbortedError();

  const controller = new AbortController();
  let rejectAbort: ((error: RequestAbortedError) => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abortFromCaller = () => {
    controller.abort();
    rejectAbort?.(new RequestAbortedError());
  };
  callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

  let rejectDeadline: ((error: RequestDeadlineError) => void) | undefined;
  const deadlinePromise = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const timer = timers.setTimeout(() => {
    controller.abort();
    rejectDeadline?.(new RequestDeadlineError());
  }, timeoutMs);

  try {
    const result = Promise.resolve().then(() => operation(controller.signal));
    return await Promise.race([result, abortPromise, deadlinePromise]);
  } finally {
    timers.clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
    rejectAbort = undefined;
    rejectDeadline = undefined;
  }
}
