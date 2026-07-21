export type RuntimeTimerHandle = unknown;

export interface RuntimeScheduler {
  setTimeout(callback: () => void, delayMs: number): RuntimeTimerHandle;
  clearTimeout(handle: RuntimeTimerHandle): void;
}

export interface RuntimeClock {
  now(): Date;
}

export class SystemRuntimeScheduler implements RuntimeScheduler {
  setTimeout(callback: () => void, delayMs: number): RuntimeTimerHandle {
    return globalThis.setTimeout(callback, delayMs);
  }

  clearTimeout(handle: RuntimeTimerHandle): void {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
}

export class SystemRuntimeClock implements RuntimeClock {
  now(): Date {
    return new Date();
  }
}
