import { describe, expect, it } from "vitest";

import { InMemoryIndividualRepository, InMemoryMemoryStore } from "../../core/persistence/inMemory";
import { createTemplateManifest } from "../../core/template/manifest";
import type { PerceptionTuningMap, PerceptionTuningStore } from "../perceptionTuningStore";
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
}

describe("runtime control deadline", () => {
  it("releases the public mutation lease without applying a late tuning save", async () => {
    let announceSave!: () => void;
    let releaseSave!: () => void;
    const saveStarted = new Promise<void>((resolve) => { announceSave = resolve; });
    const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
    let saves = 0;
    let persisted: PerceptionTuningMap = {};
    const tuningStore: PerceptionTuningStore = {
      async load() { return {}; },
      async save(tunings) {
        saves += 1;
        if (saves === 1) {
          announceSave();
          await saveGate;
        }
        persisted = structuredClone(tunings);
      },
    };
    const scheduler = new ManualDeadlineScheduler();
    const runtime = new SocietyRuntime({
      manifests: [createTemplateManifest({ id: "iris" })],
      repository: new InMemoryIndividualRepository(),
      memory: new InMemoryMemoryStore(),
      tuningStore,
      scheduler,
      cycleTimeoutMs: 1_000,
    });
    const baselineRevision = runtime.getSummary().revision;

    const timedOut = runtime.tunePerception("iris", { "distortion-strength": 0.4 });
    await saveStarted;
    scheduler.fireNext(1_000);
    await expect(timedOut).rejects.toMatchObject({
      name: "RuntimeControlDeadlineExceededError",
      operation: "perception_tuning",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    // The outer consistency lease is no longer held even though the adapter's
    // serialization fence remains tied to its unresolved save.
    const afterTimeout = await runtime.getConsistentState();
    expect(afterTimeout.statuses[0].perceptionTuning).toEqual({});
    expect(afterTimeout.summary.revision).toBe(baselineRevision);

    releaseSave();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((await runtime.getStatus("iris"))?.perceptionTuning).toEqual({});
    expect(runtime.getSummary().revision).toBe(baselineRevision);

    await runtime.tunePerception("iris", { "distortion-strength": 0.6 });
    expect((await runtime.getStatus("iris"))?.perceptionTuning).toEqual({
      "distortion-strength": 0.6,
    });
    expect(persisted).toEqual({ iris: { "distortion-strength": 0.6 } });
    expect(runtime.getSummary().revision).toBe(baselineRevision + 1);
  });
});
