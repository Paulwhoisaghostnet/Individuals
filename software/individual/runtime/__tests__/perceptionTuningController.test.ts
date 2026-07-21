import { describe, expect, it } from "vitest";

import { createTemplateManifest } from "../../core/template/manifest";
import { PerceptionTuningController } from "../perceptionTuningController";
import type { PerceptionTuningMap, PerceptionTuningStore } from "../perceptionTuningStore";

class ControlledStore implements PerceptionTuningStore {
  readonly saves: PerceptionTuningMap[] = [];
  blockFirst = false;
  failNext = false;
  private releaseFirst: (() => void) | undefined;
  firstSaveStarted: Promise<void> = Promise.resolve();
  private announceFirst: (() => void) | undefined;

  constructor() {
    this.resetGate();
  }

  async load(): Promise<PerceptionTuningMap> {
    return {};
  }

  async save(tunings: PerceptionTuningMap): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("simulated tuning persistence failure");
    }
    if (this.blockFirst && this.saves.length === 0) {
      this.announceFirst?.();
      await new Promise<void>((resolve) => {
        this.releaseFirst = resolve;
      });
    }
    this.saves.push(structuredClone(tunings));
  }

  release(): void {
    this.releaseFirst?.();
  }

  private resetGate(): void {
    this.firstSaveStarted = new Promise<void>((resolve) => {
      this.announceFirst = resolve;
    });
  }
}

const controllerFor = (store: PerceptionTuningStore): PerceptionTuningController => {
  const manifests = new Map([
    ["iris", createTemplateManifest({ id: "iris" })],
    ["morrow", createTemplateManifest({ id: "morrow" })],
  ]);
  return new PerceptionTuningController(manifests, store);
};

describe("PerceptionTuningController transactions", () => {
  it("serializes concurrent saves so the second mutation includes the first", async () => {
    const store = new ControlledStore();
    store.blockFirst = true;
    const controller = controllerFor(store);
    const first = controller.apply([
      { individualId: "iris", tuning: { "distortion-strength": 0.4 } },
    ]);
    await store.firstSaveStarted;
    const second = controller.apply([
      { individualId: "morrow", tuning: { "distortion-strength": 0.6 } },
    ]);
    store.release();
    await Promise.all([first, second]);

    expect(store.saves).toHaveLength(2);
    expect(store.saves[1]).toEqual({
      iris: { "distortion-strength": 0.4 },
      morrow: { "distortion-strength": 0.6 },
    });
    expect(controller.snapshot()).toEqual(store.saves[1]);
  });

  it("does not mutate memory on save failure and keeps the queue usable", async () => {
    const store = new ControlledStore();
    store.failNext = true;
    const controller = controllerFor(store);
    await expect(controller.apply([
      { individualId: "iris", tuning: { "distortion-strength": 0.4 } },
    ])).rejects.toThrow(/persistence failure/);
    expect(controller.get("iris")).toEqual({});

    await controller.apply([
      { individualId: "morrow", tuning: { "distortion-strength": 0.6 } },
    ]);
    expect(controller.snapshot()).toEqual({
      morrow: { "distortion-strength": 0.6 },
    });
  });

  it("keeps serialization tied to late adapter settlement without late in-memory mutation", async () => {
    let releaseFirst!: () => void;
    let announceFirst!: () => void;
    let announceSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { announceFirst = resolve; });
    const secondStarted = new Promise<void>((resolve) => { announceSecond = resolve; });
    let saveCalls = 0;
    let persisted: PerceptionTuningMap = {};
    const store: PerceptionTuningStore = {
      async load() { return {}; },
      async save(tunings) {
        saveCalls += 1;
        if (saveCalls === 1) {
          announceFirst();
          await firstGate;
        } else {
          announceSecond();
        }
        persisted = structuredClone(tunings);
      },
    };
    const controller = controllerFor(store);
    const controllerAbort = new AbortController();
    const first = controller.apply(
      [{ individualId: "iris", tuning: { "distortion-strength": 0.4 } }],
      controllerAbort.signal,
    );
    await firstStarted;
    controllerAbort.abort(new Error("curator request deadline"));
    await expect(first).rejects.toThrow(/curator request deadline/);

    const second = controller.apply([
      { individualId: "morrow", tuning: { "distortion-strength": 0.6 } },
    ]);
    let secondAnnounced = false;
    void secondStarted.then(() => { secondAnnounced = true; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(secondAnnounced).toBe(false);

    releaseFirst();
    await secondStarted;
    await second;
    expect(saveCalls).toBe(2);
    expect(controller.snapshot()).toEqual({
      morrow: { "distortion-strength": 0.6 },
    });
    expect(persisted).toEqual(controller.snapshot());
  });
});
