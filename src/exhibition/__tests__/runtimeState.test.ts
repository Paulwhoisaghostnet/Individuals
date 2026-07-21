import { describe, expect, it } from "vitest";
import { individuals } from "../data";
import { createDefaultTuningMap } from "../perception";
import { createLocalRuntimeState } from "../runtime/localSimulation";
import { buildRuntimeView } from "../runtime/runtimeView";
import {
  boundedBackoffDelay,
  createInitialConnectionState,
  reconcileSocietySnapshot,
  selectRuntimeSource,
  snapshotConfirmsDisplayedState,
  societyConnectionReducer,
} from "../runtime/state";
import { createRuntimeSnapshot } from "./runtimeFixture";

describe("runtime source routing", () => {
  it("does not let a late poll regress cycles delivered by SSE", () => {
    const current = createRuntimeSnapshot({
      revision: "12",
      generatedAt: "2026-07-21T18:01:00.000Z",
      cycles: { iris: 12, morrow: 11, sable: 10 },
    });
    const latePoll = createRuntimeSnapshot({
      revision: "11",
      generatedAt: "2026-07-21T18:00:59.000Z",
      cycles: { iris: 11, morrow: 11, sable: 10 },
    });

    expect(reconcileSocietySnapshot(current, latePoll)).toBe(current);
    expect(snapshotConfirmsDisplayedState(current, latePoll)).toBe(false);
  });

  it("keeps stale SSE payloads degraded instead of blessing held state as current", () => {
    let state = societyConnectionReducer(createInitialConnectionState("live"), {
      type: "snapshot-received",
      snapshot: createRuntimeSnapshot({ revision: "8" }),
      transport: "polling",
    });
    state = societyConnectionReducer(state, {
      type: "snapshot-received",
      snapshot: createRuntimeSnapshot({ revision: "7" }),
      transport: "sse",
    });

    expect(state.snapshot?.revision).toBe("8");
    expect(state.connection.phase).toBe("degraded");
    expect(state.connection.snapshotCurrent).toBe(false);
    expect(state.connection.message).toContain("Stale stream state ignored");
  });

  it("accepts lower cycles only when a newer runtime instance has restarted", () => {
    const current = createRuntimeSnapshot({
      revision: "90",
      generatedAt: "2026-07-21T18:01:00.000Z",
      startedAt: "2026-07-21T17:00:00.000Z",
      cycles: { iris: 90, morrow: 90, sable: 90 },
    });
    const restarted = createRuntimeSnapshot({
      revision: "1",
      generatedAt: "2026-07-21T18:02:00.000Z",
      startedAt: "2026-07-21T18:01:30.000Z",
      cycles: { iris: 1, morrow: 1, sable: 1 },
    });

    expect(reconcileSocietySnapshot(current, restarted)).toBe(restarted);
  });

  it("does not let a delayed older runtime instance replace a newer restart", () => {
    const current = createRuntimeSnapshot({
      revision: "2",
      generatedAt: "2026-07-21T18:03:00.000Z",
      startedAt: "2026-07-21T18:01:30.000Z",
      cycles: { iris: 2, morrow: 2, sable: 2 },
    });
    const delayedOldInstance = createRuntimeSnapshot({
      revision: "200",
      generatedAt: "2026-07-21T18:04:00.000Z",
      startedAt: "2026-07-21T17:00:00.000Z",
      cycles: { iris: 200, morrow: 200, sable: 200 },
    });

    expect(reconcileSocietySnapshot(current, delayedOldInstance)).toBe(current);
  });

  it("holds the last verified live snapshot through transport degradation", () => {
    let state = createInitialConnectionState("auto");
    state = societyConnectionReducer(state, {
      type: "snapshot-received",
      snapshot: createRuntimeSnapshot(),
      transport: "sse",
    });
    state = societyConnectionReducer(state, { type: "stream-failed", attempt: 1 });
    state = societyConnectionReducer(state, { type: "fallback-activated" });

    expect(selectRuntimeSource(state, "auto")).toBe("live");
    expect(state.connection.phase).toBe("degraded");
    expect(state.connection.snapshotCurrent).toBe(false);
    expect(state.snapshot?.revision).toBe("7");
  });

  it("keeps a mismatched heartbeat degraded until its revision is reconciled", () => {
    let state = societyConnectionReducer(createInitialConnectionState("live"), {
      type: "snapshot-received",
      snapshot: createRuntimeSnapshot({ revision: "7" }),
      transport: "sse",
    });
    state = societyConnectionReducer(state, {
      type: "heartbeat",
      heartbeat: {
        revision: "8",
        generatedAt: "2026-07-21T18:00:08.000Z",
        startedAt: "2026-07-21T17:00:00.000Z",
      },
    });

    expect(state.connection.phase).toBe("degraded");
    expect(state.connection.transport).toBe("polling");
    expect(state.connection.message).toContain("reconciling");
    expect(state.connection.snapshotCurrent).toBe(false);
  });

  it("rejects a lower revision even when its timestamp and cycles look current", () => {
    const currentBase = createRuntimeSnapshot({
      revision: "12",
      generatedAt: "2026-07-21T18:01:00.000Z",
      cycles: { iris: 12, morrow: 12, sable: 12 },
    });
    const current = {
      ...currentBase,
      individuals: currentBase.individuals.map((individual, index) =>
        index === 0
          ? { ...individual, isPaused: true, perceptionTuning: { "edge-gain": 0.91 } }
          : individual,
      ),
    };
    const delayed = createRuntimeSnapshot({
      revision: "11",
      generatedAt: "2026-07-21T18:02:00.000Z",
      cycles: { iris: 12, morrow: 12, sable: 12 },
    });

    expect(reconcileSocietySnapshot(current, delayed)).toBe(current);
  });

  it("activates local simulation only when no verified live snapshot exists", () => {
    const state = societyConnectionReducer(createInitialConnectionState("auto"), {
      type: "fallback-activated",
    });

    expect(selectRuntimeSource(state, "auto")).toBe("local");
    expect(state.connection.phase).toBe("local");
    expect(state.fallbackActive).toBe(true);
  });

  it("keeps an unverified display source distinct from its intended live control target", () => {
    const connectingState = createInitialConnectionState("auto");
    const connectingView = buildRuntimeView({
      people: individuals,
      source: selectRuntimeSource(connectingState, "auto"),
      connectionState: connectingState,
      localState: createLocalRuntimeState(individuals),
      localTuning: createDefaultTuningMap(individuals),
      localOperational: false,
    });
    const fallbackState = societyConnectionReducer(connectingState, {
      type: "fallback-activated",
    });
    const fallbackView = buildRuntimeView({
      people: individuals,
      source: selectRuntimeSource(fallbackState, "auto"),
      connectionState: fallbackState,
      localState: createLocalRuntimeState(individuals),
      localTuning: createDefaultTuningMap(individuals),
      localOperational: true,
    });

    expect(connectingView.source).toBe("local");
    expect(connectingView.artworkMode).toBe("unverified-study");
    expect(connectingView.controlTarget).toBe("live");
    expect(connectingView.localFallback).toBe(false);
    expect(connectingView.cycleLabel).toBe("000");
    expect(connectingView.individuals.iris.activity).toBe("awaiting verified runtime");
    expect(connectingView.individuals.iris.isRunningCycle).toBe(false);
    expect(connectingView.tuningMap.iris["edge-gain"]).toBe(0.78);
    expect(connectingView.allPaused).toBe(true);
    expect(fallbackView.artworkMode).toBe("local-simulation");
    expect(fallbackView.controlTarget).toBe("local");
    expect(fallbackView.localFallback).toBe(true);
  });

  it("bounds reconnect backoff with controlled jitter", () => {
    expect(boundedBackoffDelay(1, () => 0.5)).toBe(1_000);
    expect(boundedBackoffDelay(5, () => 0.5)).toBe(16_000);
    expect(boundedBackoffDelay(99, () => 1)).toBeLessThanOrEqual(30_000);
  });

  it.each([
    ["degraded", "live · degraded", "degraded state"],
    ["paused", "live · paused", "cycles are paused"],
  ] as const)(
    "reports a connected runtime that is %s without claiming healthy live operation",
    (runtimeStatus, sourceLabel, descriptionFragment) => {
      let connectionState = createInitialConnectionState("live");
      connectionState = societyConnectionReducer(connectionState, {
        type: "snapshot-received",
        snapshot: createRuntimeSnapshot({ runtimeStatus }),
        transport: "sse",
      });

      const view = buildRuntimeView({
        people: individuals,
        source: "live",
        connectionState,
        localState: createLocalRuntimeState(individuals),
        localTuning: createDefaultTuningMap(individuals),
        localOperational: false,
      });

      expect(view.sourceLabel).toBe(sourceLabel);
      expect(view.sourceDescription).toContain(descriptionFragment);
    },
  );

  it("distinguishes a held last-live image from a freshly verified polling snapshot", () => {
    let connectionState = societyConnectionReducer(createInitialConnectionState("live"), {
      type: "snapshot-received",
      snapshot: createRuntimeSnapshot({ revision: "7" }),
      transport: "sse",
    });
    connectionState = societyConnectionReducer(connectionState, {
      type: "stream-failed",
      attempt: 1,
    });
    const heldView = buildRuntimeView({
      people: individuals,
      source: "live",
      connectionState,
      localState: createLocalRuntimeState(individuals),
      localTuning: createDefaultTuningMap(individuals),
      localOperational: false,
    });

    connectionState = societyConnectionReducer(connectionState, {
      type: "snapshot-received",
      snapshot: createRuntimeSnapshot({ revision: "8" }),
      transport: "polling",
    });
    const pollingView = buildRuntimeView({
      people: individuals,
      source: "live",
      connectionState,
      localState: createLocalRuntimeState(individuals),
      localTuning: createDefaultTuningMap(individuals),
      localOperational: false,
    });

    expect(heldView.sourceLabel).toBe("last live · reconnecting");
    expect(pollingView.sourceLabel).toBe("live · polling");
    expect(connectionState.connection.snapshotCurrent).toBe(true);
  });
});
