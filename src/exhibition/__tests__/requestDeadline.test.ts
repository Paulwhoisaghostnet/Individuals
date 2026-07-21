import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RequestAbortedError,
  RequestDeadlineError,
  runWithRequestDeadline,
} from "../runtime/requestDeadline";

describe("browser request deadline", () => {
  afterEach(() => vi.useRealTimers());

  it("releases a caller and aborts an adapter that never settles", async () => {
    vi.useFakeTimers();
    let adapterSignal: AbortSignal | undefined;
    const pending = runWithRequestDeadline(
      (signal) => {
        adapterSignal = signal;
        return new Promise<string>(() => undefined);
      },
      undefined,
      1_000,
    );
    const rejection = expect(pending).rejects.toBeInstanceOf(RequestDeadlineError);

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(adapterSignal?.aborted).toBe(true);
  });

  it("propagates caller cancellation even when the adapter ignores its signal", async () => {
    const controller = new AbortController();
    const pending = runWithRequestDeadline(
      () => new Promise<string>(() => undefined),
      controller.signal,
      10_000,
    );

    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(RequestAbortedError);
  });
});
