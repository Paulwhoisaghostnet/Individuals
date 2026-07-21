import type { PublicSocietySnapshot, SocietyHeartbeat } from "./types";

/** The server emits a heartbeat every 20 seconds; allow one missed beat before recovery. */
export const SSE_FRESHNESS_TIMEOUT_MS = 45_000;

export interface FreshnessWatchdog {
  touch(): void;
  stop(): void;
}

interface WatchdogTimers {
  readonly setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  readonly clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
}

const defaultTimers: WatchdogTimers = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
};

/**
 * A one-shot liveness deadline. Every verified SSE payload rearms it; expiry is
 * deliberately delegated to the transport so the stale socket is closed before
 * polling and bounded reconnection begin.
 */
export const createFreshnessWatchdog = (
  onStale: () => void,
  timeoutMs = SSE_FRESHNESS_TIMEOUT_MS,
  timers: WatchdogTimers = defaultTimers,
): FreshnessWatchdog => {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new Error("Freshness timeout must be a positive finite number.");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const stop = () => {
    stopped = true;
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = undefined;
  };

  return {
    touch: () => {
      if (stopped) return;
      if (timer !== undefined) timers.clearTimeout(timer);
      timer = timers.setTimeout(() => {
        timer = undefined;
        if (!stopped) onStale();
      }, timeoutMs);
    },
    stop,
  };
};

export const heartbeatRequiresSnapshot = (
  snapshot: PublicSocietySnapshot | undefined,
  heartbeat: SocietyHeartbeat,
): boolean =>
  snapshot?.revision !== heartbeat.revision ||
  snapshot.runtime.startedAt !== heartbeat.startedAt;
