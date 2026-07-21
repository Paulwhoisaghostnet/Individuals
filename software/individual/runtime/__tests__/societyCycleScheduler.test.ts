import { describe, expect, it } from "vitest";

import { createTemplateManifest } from "../../core/template/manifest";
import type { RuntimeScheduler, RuntimeTimerHandle } from "../scheduler";
import { SocietyCycleScheduler } from "../societyCycleScheduler";

class FakeScheduler implements RuntimeScheduler {
  readonly scheduled: Array<{ callback: () => void; delayMs: number; handle: object }> = [];
  readonly cleared = new Set<object>();

  setTimeout(callback: () => void, delayMs: number): RuntimeTimerHandle {
    const handle = {};
    this.scheduled.push({ callback, delayMs, handle });
    return handle;
  }

  clearTimeout(handle: RuntimeTimerHandle): void {
    this.cleared.add(handle as object);
  }
}

describe("SocietyCycleScheduler", () => {
  it("stagger-starts only missing portraits and leaves persisted identities on authored cadence", () => {
    const fake = new FakeScheduler();
    const manifests = new Map([
      ["iris", createTemplateManifest({ id: "iris" })],
      ["morrow", createTemplateManifest({ id: "morrow" })],
    ]);
    const scheduler = new SocietyCycleScheduler({
      manifests,
      scheduler: fake,
      random: () => 0.5,
      canRun: () => true,
      run: async () => ({ status: "completed" }),
      onError: () => undefined,
    });

    scheduler.start(new Set(["iris"]));
    expect(fake.scheduled.map(({ delayMs }) => delayMs)).toEqual([250, 60_000]);
    scheduler.pause("iris");
    expect(fake.cleared.has(fake.scheduled[0].handle)).toBe(true);
    scheduler.stop();
  });
});
