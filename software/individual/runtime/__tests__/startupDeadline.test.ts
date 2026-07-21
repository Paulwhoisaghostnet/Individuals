import { describe, expect, it } from "vitest";

import { InMemoryIndividualRepository, InMemoryMemoryStore } from "../../core/persistence/inMemory";
import { createTemplateManifest } from "../../core/template/manifest";
import type { RuntimeScheduler, RuntimeTimerHandle } from "../scheduler";
import { SocietyRuntime } from "../societyRuntime";

class ManualDeadlineScheduler implements RuntimeScheduler {
  private readonly timers: Array<{
    readonly callback: () => void;
    readonly delayMs: number;
    readonly handle: object;
    cleared: boolean;
    fired: boolean;
  }> = [];

  setTimeout(callback: () => void, delayMs: number): RuntimeTimerHandle {
    const timer = { callback, delayMs, handle: {}, cleared: false, fired: false };
    this.timers.push(timer);
    return timer.handle;
  }

  clearTimeout(handle: RuntimeTimerHandle): void {
    const timer = this.timers.find((candidate) => candidate.handle === handle);
    if (timer) timer.cleared = true;
  }

  fireNext(delayMs: number): void {
    const timer = this.timers.find(
      (candidate) => !candidate.cleared && !candidate.fired && candidate.delayMs === delayMs,
    );
    if (!timer) throw new Error(`No active ${delayMs} ms timer.`);
    timer.fired = true;
    timer.callback();
  }

  activeTimerCount(delayMs: number): number {
    return this.timers.filter(
      (timer) => !timer.cleared && !timer.fired && timer.delayMs === delayMs,
    ).length;
  }
}

describe("runtime initialization deadline", () => {
  it("fails startup in bounded time when recovery never settles, including retries", async () => {
    let announceRecovery!: () => void;
    const recoveryStarted = new Promise<void>((resolve) => { announceRecovery = resolve; });
    class NonSettlingRecoveryRepository extends InMemoryIndividualRepository {
      calls = 0;
      async recover(): Promise<{ recoveredTransactions: number; abandonedTransactions: number }> {
        this.calls += 1;
        announceRecovery();
        return new Promise(() => undefined);
      }
    }

    const scheduler = new ManualDeadlineScheduler();
    const repository = new NonSettlingRecoveryRepository();
    const runtime = new SocietyRuntime({
      manifests: [createTemplateManifest({ id: "iris" })],
      repository,
      memory: new InMemoryMemoryStore(),
      scheduler,
      cycleTimeoutMs: 1_000,
    });

    const firstStart = runtime.start();
    await recoveryStarted;
    scheduler.fireNext(1_000);
    await expect(firstStart).rejects.toMatchObject({
      name: "RuntimeInitializationDeadlineExceededError",
    });
    expect(runtime.getSummary().lifecycle).toBe("stopped");

    const retry = runtime.start();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(repository.calls).toBe(2);
    scheduler.fireNext(1_000);
    await expect(retry).rejects.toMatchObject({
      name: "RuntimeInitializationDeadlineExceededError",
    });
    expect(runtime.getSummary().lifecycle).toBe("stopped");
  });

  it.each([1, 2])(
    "uses one startup deadline when repository load %i never settles",
    async (hangOnLoad) => {
      let announceLoad!: () => void;
      const loadStarted = new Promise<void>((resolve) => { announceLoad = resolve; });
      class SelectivelyHangingRepository extends InMemoryIndividualRepository {
        calls = 0;

        override async load(
          ...args: Parameters<InMemoryIndividualRepository["load"]>
        ): ReturnType<InMemoryIndividualRepository["load"]> {
          this.calls += 1;
          if (this.calls === hangOnLoad) {
            announceLoad();
            return new Promise(() => undefined);
          }
          return super.load(...args);
        }
      }

      const scheduler = new ManualDeadlineScheduler();
      const runtime = new SocietyRuntime({
        manifests: [createTemplateManifest({ id: "iris" })],
        repository: new SelectivelyHangingRepository(),
        memory: new InMemoryMemoryStore(),
        scheduler,
        cycleTimeoutMs: 1_000,
      });

      const starting = runtime.start();
      await loadStarted;
      expect(scheduler.activeTimerCount(1_000)).toBe(1);
      scheduler.fireNext(1_000);
      await expect(starting).rejects.toMatchObject({
        name: "RuntimeInitializationDeadlineExceededError",
        operation: "startup",
      });
      expect(runtime.getSummary().lifecycle).toBe("stopped");
    },
  );

  it("bounds an external state projection when repository load ignores cancellation", async () => {
    let announceLoad!: () => void;
    const loadStarted = new Promise<void>((resolve) => { announceLoad = resolve; });
    class NonSettlingLoadRepository extends InMemoryIndividualRepository {
      override async load(): Promise<never> {
        announceLoad();
        return new Promise(() => undefined);
      }
    }
    const scheduler = new ManualDeadlineScheduler();
    const runtime = new SocietyRuntime({
      manifests: [createTemplateManifest({ id: "iris" })],
      repository: new NonSettlingLoadRepository(),
      memory: new InMemoryMemoryStore(),
      scheduler,
      cycleTimeoutMs: 1_000,
    });

    const projection = runtime.getConsistentState();
    await loadStarted;
    scheduler.fireNext(1_000);
    await expect(projection).rejects.toMatchObject({
      name: "RuntimeProjectionDeadlineExceededError",
      operation: "state_projection",
    });
    expect(runtime.getSummary().lifecycle).toBe("created");
  });
});
