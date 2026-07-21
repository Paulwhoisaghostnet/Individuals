import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFreshnessWatchdog,
  heartbeatRequiresSnapshot,
} from "../runtime/freshness";
import { createRuntimeSnapshot } from "./runtimeFixture";

describe("live stream freshness", () => {
  afterEach(() => vi.useRealTimers());

  it("expires an open stream that produces no verified payload before its deadline", () => {
    vi.useFakeTimers();
    const recoverStaleStream = vi.fn();
    const watchdog = createFreshnessWatchdog(recoverStaleStream, 1_000);

    watchdog.touch();
    vi.advanceTimersByTime(999);
    expect(recoverStaleStream).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(recoverStaleStream).toHaveBeenCalledOnce();
  });

  it("rearms on verified traffic and cannot fire after transport cleanup", () => {
    vi.useFakeTimers();
    const recoverStaleStream = vi.fn();
    const watchdog = createFreshnessWatchdog(recoverStaleStream, 1_000);

    watchdog.touch();
    vi.advanceTimersByTime(800);
    watchdog.touch();
    vi.advanceTimersByTime(800);
    expect(recoverStaleStream).not.toHaveBeenCalled();

    watchdog.stop();
    vi.advanceTimersByTime(1_000);
    expect(recoverStaleStream).not.toHaveBeenCalled();
  });

  it("requires reconciliation when heartbeat revision or runtime incarnation differs", () => {
    const snapshot = createRuntimeSnapshot({ revision: "9" });
    const heartbeat = {
      revision: "9",
      generatedAt: "2026-07-21T18:00:09.000Z",
      startedAt: snapshot.runtime.startedAt,
    };
    expect(heartbeatRequiresSnapshot(createRuntimeSnapshot({ revision: "8" }), heartbeat)).toBe(true);
    expect(heartbeatRequiresSnapshot(undefined, heartbeat)).toBe(true);
    expect(heartbeatRequiresSnapshot(snapshot, heartbeat)).toBe(false);
    expect(heartbeatRequiresSnapshot(snapshot, {
      ...heartbeat,
      startedAt: "2026-07-21T17:30:00.000Z",
    })).toBe(true);
  });
});
