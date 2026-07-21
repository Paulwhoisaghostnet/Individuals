import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SocietyRuntime, type RuntimeEngineFactory } from "../societyRuntime";
import { InMemoryIndividualRepository, InMemoryMemoryStore } from "../../core/persistence/inMemory";
import type { CycleCommitter } from "../../core/persistence/contracts";
import { createTemplateManifest } from "../../core/template/manifest";
import { IndividualEngine } from "../../core/engine/IndividualEngine";
import { ProceduralCognitionSystem } from "../../cognition/proceduralCognition";
import { ProceduralPerceptionSystem } from "../../perception/proceduralPerception";
import { GenerativeDrawingSystem } from "../../drawing/generativeDrawing";
import { ProceduralFeedbackCompositor } from "../../social-feedback/proceduralCompositor";
import { DeterministicRelationshipAdaptationSystem } from "../../social-feedback/relationshipAdaptation";
import { StableIdGenerator } from "../../core/systemUtilities";
import { createInitialState } from "../../core/createInitialState";
import { EvidenceBodyAdaptationSystem } from "../../cognition/bodyAdaptation";
import type { IndividualSnapshot } from "../../core/model";
import { FileIndividualRepository } from "../../memory/fileRepository";
import { FileMemoryStore } from "../../memory/fileMemoryStore";
import { isLlmProviderConfigured } from "../engineFactory";
import type { CycleBudgetState, CycleBudgetStore } from "../cycleBudgetStore";
import type { RuntimeScheduler, RuntimeTimerHandle } from "../scheduler";

const deterministicFactory: RuntimeEngineFactory = (manifest, context) => {
  const ids = new StableIdGenerator();
  return new IndividualEngine(manifest, {
    cognition: new ProceduralCognitionSystem(),
    perception: new ProceduralPerceptionSystem(),
    drawing: new GenerativeDrawingSystem(ids),
    feedback: new ProceduralFeedbackCompositor(ids),
    relationships: new DeterministicRelationshipAdaptationSystem(),
    adaptation: new EvidenceBodyAdaptationSystem(),
    repository: context.repository,
    memory: context.memory,
    committer: context.committer,
    progress: context.progress,
    clock: { now: () => context.clock.now().toISOString() },
    ids,
    allowedPeerIds: context.allowedPeerIds,
  });
};

describe("SocietyRuntime", () => {
  let repository: InMemoryIndividualRepository;
  let memory: InMemoryMemoryStore;

  beforeEach(() => {
    repository = new InMemoryIndividualRepository();
    memory = new InMemoryMemoryStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects society sizes that cannot fit one complete peer cohort", () => {
    expect(() => new SocietyRuntime({
      manifests: [],
      repository,
      memory,
      engineFactory: deterministicFactory,
    })).toThrow(/between 1 and 17 Individuals/);
    expect(() => new SocietyRuntime({
      manifests: Array.from({ length: 18 }, (_, index) =>
        createTemplateManifest({ id: `individual-${index}` })),
      repository,
      memory,
      engineFactory: deterministicFactory,
    })).toThrow(/between 1 and 17 Individuals/);
  });

  it("refuses startup when persisted identity was authored by another manifest revision", async () => {
    const persisted = createTemplateManifest({ id: "iris", displayName: "Previous Iris" });
    const installed = createTemplateManifest({ id: "iris", displayName: "Installed Iris" });
    await repository.save({
      manifest: persisted,
      state: createInitialState(persisted, "2026-01-01T00:00:00.000Z"),
    });
    const runtime = new SocietyRuntime({
      manifests: [installed],
      repository,
      memory,
      engineFactory: deterministicFactory,
    });

    await expect(runtime.start()).rejects.toMatchObject({
      code: "INCOMPATIBLE_IDENTITY_STATE",
      individualId: "iris",
    });
    expect((await repository.load("iris"))?.manifest.displayName).toBe("Previous Iris");
  });

  it("runs deterministic cycles and tracks health plus transient phases", async () => {
    const runtime = new SocietyRuntime({
      manifests: [
        createTemplateManifest({ id: "iris", displayName: "Iris" }),
        createTemplateManifest({ id: "morrow", displayName: "Morrow" }),
      ],
      repository,
      memory,
      engineFactory: deterministicFactory,
    });

    expect((await runtime.runSingleCycle("iris")).status).toBe("completed");
    expect((await runtime.runSingleCycle("morrow")).status).toBe("completed");
    const irisStatus = await runtime.getStatus("iris");
    const morrowStatus = await runtime.getStatus("morrow");
    expect(irisStatus?.snapshot.state.cycle).toBe(1);
    expect(morrowStatus?.snapshot.state.cycle).toBe(1);
    expect(irisStatus?.health.state).toBe("healthy");
    expect(morrowStatus?.health.state).toBe("healthy");
    expect(irisStatus?.currentPhase).toBe("idle");
    expect(runtime.getHealthMonitor().getRecentEvents(10)).toContainEqual(
      expect.objectContaining({ type: "cycle_complete", individualId: "iris" }),
    );
  });

  it("exposes the exact consumed social cohort while routing the next canvas separately", async () => {
    const manifests = [
      createTemplateManifest({ id: "iris", displayName: "Iris" }),
      createTemplateManifest({ id: "morrow", displayName: "Morrow" }),
      createTemplateManifest({ id: "sable", displayName: "Sable" }),
    ];
    const runtime = new SocietyRuntime({
      manifests,
      repository,
      memory,
      engineFactory: deterministicFactory,
      cyclePolicy: { minimumCycleSpacingMs: 0 },
    });

    await runtime.runSingleCycle("iris");
    await runtime.runSingleCycle("morrow");
    await runtime.runSingleCycle("sable");
    await runtime.runSingleCycle("iris");

    const composed = await runtime.getStatus("iris");
    const composedIds = composed?.latestPeerPortraits.map((portrait) => portrait.id) ?? [];
    expect(composedIds).toHaveLength(2);
    expect(composed?.snapshot.state.latestSocialPortrait?.sourcePortraitIds).toEqual(composedIds);
    expect(composed?.snapshot.state.latestSocialPeerPortraits).toEqual(
      composed?.latestPeerPortraits,
    );

    // Morrow now draws from Iris's new canvas. That pending drawing must not
    // replace any source displayed with the already committed composite.
    await runtime.runSingleCycle("morrow");
    expect((await runtime.getStatus("iris"))?.latestPeerPortraits.map(
      (portrait) => portrait.id,
    )).toEqual(composedIds);

    await runtime.stop({ drain: true });
    const restarted = new SocietyRuntime({
      manifests,
      repository,
      memory,
      engineFactory: deterministicFactory,
      scheduler: {
        setTimeout: () => ({}),
        clearTimeout: () => undefined,
      },
      cyclePolicy: { minimumCycleSpacingMs: 0 },
    });
    await restarted.start();
    expect((await restarted.getStatus("iris"))?.latestPeerPortraits.map(
      (portrait) => portrait.id,
    )).toEqual(composedIds);

    // Pending routes intentionally start empty after process hydration. A new
    // peer cycle targets the hydrated current canvas; only Iris's next commit
    // promotes that pending drawing into the displayed social cohort.
    await restarted.runSingleCycle("morrow");
    expect((await restarted.getStatus("iris"))?.latestPeerPortraits.map(
      (portrait) => portrait.id,
    )).toEqual(composedIds);
    await restarted.runSingleCycle("iris");
    const next = await restarted.getStatus("iris");
    expect(next?.latestPeerPortraits).toHaveLength(1);
    expect(next?.latestPeerPortraits[0].artistId).toBe("morrow");
    expect(next?.snapshot.state.latestSocialPortrait?.sourcePortraitIds).toEqual(
      next?.latestPeerPortraits.map((portrait) => portrait.id),
    );
    await restarted.stop({ drain: true });
  });

  it("commits only the cohort captured before a concurrent peer drawing arrives", async () => {
    let releaseIris!: () => void;
    let announceIris!: () => void;
    const irisGate = new Promise<void>((resolve) => { releaseIris = resolve; });
    const irisStarted = new Promise<void>((resolve) => { announceIris = resolve; });
    class GatedIrisCognition extends ProceduralCognitionSystem {
      override async formIntent(
        input: Parameters<ProceduralCognitionSystem["formIntent"]>[0],
      ) {
        if (input.cycle === 2) {
          announceIris();
          await irisGate;
        }
        return super.formIntent(input);
      }
    }
    const gatedFactory: RuntimeEngineFactory = (manifest, context) => {
      const ids = new StableIdGenerator();
      return new IndividualEngine(manifest, {
        cognition: manifest.id === "iris"
          ? new GatedIrisCognition()
          : new ProceduralCognitionSystem(),
        perception: new ProceduralPerceptionSystem(),
        drawing: new GenerativeDrawingSystem(ids),
        feedback: new ProceduralFeedbackCompositor(ids),
        relationships: new DeterministicRelationshipAdaptationSystem(),
        adaptation: new EvidenceBodyAdaptationSystem(),
        repository: context.repository,
        memory: context.memory,
        committer: context.committer,
        progress: context.progress,
        clock: { now: () => context.clock.now().toISOString() },
        ids,
        allowedPeerIds: context.allowedPeerIds,
      });
    };
    const runtime = new SocietyRuntime({
      manifests: [
        createTemplateManifest({ id: "iris" }),
        createTemplateManifest({ id: "morrow" }),
        createTemplateManifest({ id: "sable" }),
      ],
      repository,
      memory,
      engineFactory: gatedFactory,
      cyclePolicy: { minimumCycleSpacingMs: 0, maxConcurrentCycles: 2 },
    });

    await runtime.runSingleCycle("iris");
    await runtime.runSingleCycle("morrow");
    const irisCycle = runtime.runSingleCycle("iris");
    await irisStarted;
    await runtime.runSingleCycle("sable");
    releaseIris();
    await expect(irisCycle).resolves.toEqual({ status: "completed" });

    const iris = await runtime.getStatus("iris");
    expect(iris?.latestPeerPortraits.map((portrait) => portrait.artistId)).toEqual([
      "morrow",
    ]);
    expect(iris?.snapshot.state.latestSocialPortrait?.sourcePortraitIds).toEqual(
      iris?.latestPeerPortraits.map((portrait) => portrait.id),
    );
  });

  it("publishes a nested provider fallback only after the outer cycle is stable", async () => {
    let announceSave!: () => void;
    let releaseSave!: () => void;
    const saveStarted = new Promise<void>((resolve) => { announceSave = resolve; });
    const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
    class DeferredRepository extends InMemoryIndividualRepository {
      override async save(snapshot: IndividualSnapshot, signal?: AbortSignal): Promise<void> {
        if (snapshot.state.cycle === 1) {
          announceSave();
          await saveGate;
        }
        await super.save(snapshot, signal);
      }
    }
    const runtime = new SocietyRuntime({
      manifests: [createTemplateManifest({ id: "iris", displayName: "Iris" })],
      repository: new DeferredRepository(),
      memory,
      engineFactory: deterministicFactory,
      cyclePolicy: { minimumCycleSpacingMs: 0 },
    });
    const baseline = await runtime.getConsistentState();
    let notifications = 0;
    let resolveProjection!: (value: Awaited<ReturnType<SocietyRuntime["getConsistentState"]>>) => void;
    const subscriberProjection = new Promise<
      Awaited<ReturnType<SocietyRuntime["getConsistentState"]>>
    >((resolve) => { resolveProjection = resolve; });
    const unsubscribe = runtime.subscribe(() => {
      notifications += 1;
      void runtime.getConsistentState().then(resolveProjection);
    });

    const cycle = runtime.runSingleCycle("iris");
    await saveStarted;
    runtime.reportProviderFailure({
      individualId: "iris",
      cycle: 1,
      operation: "reflect",
      provider: "test-provider",
      error: new Error("provider timed out"),
      category: "timeout",
      retryable: true,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(notifications).toBe(0);
    expect(runtime.getSummary().revision).toBe(baseline.summary.revision);
    expect(await runtime.getConsistentState()).toEqual(baseline);

    releaseSave();
    await expect(cycle).resolves.toEqual({ status: "completed" });
    const published = await subscriberProjection;
    await new Promise<void>((resolve) => setImmediate(resolve));
    unsubscribe();

    expect(notifications).toBe(1);
    expect(published.summary.revision).toBe(baseline.summary.revision + 1);
    expect(published.statuses[0]).toMatchObject({
      snapshot: { state: { cycle: 1 } },
      health: { state: "degraded", lastError: "provider_timeout" },
    });
  });

  it("validates controls and persists tuning before acknowledging it", async () => {
    const runtime = new SocietyRuntime({
      manifests: [createTemplateManifest({ id: "iris", displayName: "Iris" })],
      repository,
      memory,
      engineFactory: deterministicFactory,
    });

    runtime.pause("iris");
    expect((await runtime.getStatus("iris"))?.isPaused).toBe(true);
    runtime.resume("iris");
    expect((await runtime.getStatus("iris"))?.isPaused).toBe(false);
    await runtime.tunePerception("iris", { "distortion-strength": 0.5 });
    expect((await runtime.getStatus("iris"))?.perceptionTuning).toEqual({
      "distortion-strength": 0.5,
    });
    expect(runtime.getHealthMonitor().getRecentEvents(5)).toContainEqual(
      expect.objectContaining({
        type: "curatorial_action",
        details: expect.objectContaining({ action: "tune_perception_batch" }),
      }),
    );
    await expect(
      runtime.tunePerception("iris", { "invalid-control": 999 }),
    ).rejects.toMatchObject({ code: "INVALID_TUNING" });
  });

  it("isolates a persistence fault to one Individual without faulting peers", async () => {
    class SelectiveFailureRepository extends InMemoryIndividualRepository {
      override async save(snapshot: IndividualSnapshot): Promise<void> {
        if (snapshot.manifest.id === "iris") throw new Error("simulated snapshot storage outage");
        await super.save(snapshot);
      }
    }
    const runtime = new SocietyRuntime({
      manifests: [
        createTemplateManifest({ id: "iris", displayName: "Iris" }),
        createTemplateManifest({ id: "morrow", displayName: "Morrow" }),
      ],
      repository: new SelectiveFailureRepository(),
      memory,
      engineFactory: deterministicFactory,
    });

    expect((await runtime.runSingleCycle("iris")).status).toBe("faulted");
    expect((await runtime.runSingleCycle("morrow")).status).toBe("completed");
    expect((await runtime.getStatus("iris"))?.health.lastError).toBe("cycle_execution_failed");
    expect((await runtime.getStatus("morrow"))?.health.state).toBe("healthy");
  });

  it("falls back procedurally when configured provider construction is invalid", async () => {
    vi.stubEnv("LLM_API_KEY", "configured-but-never-logged");
    vi.stubEnv("LLM_API_BASE", "not a valid URL");
    const runtime = new SocietyRuntime({
      manifests: [createTemplateManifest({ id: "iris", displayName: "Iris" })],
      repository,
      memory,
      cyclePolicy: { minimumCycleSpacingMs: 0 },
    });
    expect((await runtime.runSingleCycle("iris")).status).toBe("completed");
    expect(runtime.getHealthMonitor().getRecentEvents(20)).toContainEqual(
      expect.objectContaining({
        type: "provider_fallback",
        individualId: "iris",
        error: "provider_configuration",
        details: expect.objectContaining({ category: "configuration", retryable: false }),
      }),
    );
    expect(JSON.stringify(runtime.getHealthMonitor().getRecentEvents(20))).not.toContain(
      "configured-but-never-logged",
    );
  });

  it("does not enable provider calls from model or base URL settings without credentials", () => {
    expect(isLlmProviderConfigured({
      LLM_API_BASE: "https://api.example/v1",
      LLM_MODEL: "model-name",
    })).toBe(false);
    expect(isLlmProviderConfigured({ LLM_API_KEY: "   " })).toBe(false);
    expect(isLlmProviderConfigured({ LLM_API_KEY_FILE: "/run/secrets/llm-key" })).toBe(true);
  });

  it("treats curator pause as process-local rather than stale snapshot authority", async () => {
    const runtime = new SocietyRuntime({
      manifests: [createTemplateManifest({ id: "iris", displayName: "Iris" })],
      repository,
      memory,
      engineFactory: deterministicFactory,
      cycleIntervalOverrideMs: 60_000,
    });
    await runtime.start();
    runtime.pause("iris");
    expect((await runtime.getStatus("iris"))?.isPaused).toBe(true);
    await runtime.stop({ drain: true });
    await runtime.start();
    expect((await runtime.getStatus("iris"))?.isPaused).toBe(false);
    await runtime.stop({ drain: true });
  });

  it("serializes admission so concurrent callers cannot exceed maxConcurrentCycles", async () => {
    let releaseBudget!: () => void;
    let announceBudget!: () => void;
    const budgetGate = new Promise<void>((resolve) => { releaseBudget = resolve; });
    const budgetStarted = new Promise<void>((resolve) => { announceBudget = resolve; });
    class GatedBudgetStore implements CycleBudgetStore {
      private first = true;
      async load(): Promise<CycleBudgetState | undefined> { return undefined; }
      async save(): Promise<void> {
        if (this.first) {
          this.first = false;
          announceBudget();
          await budgetGate;
        }
      }
    }
    let releaseCognition!: () => void;
    let announceCognition!: () => void;
    const cognitionGate = new Promise<void>((resolve) => { releaseCognition = resolve; });
    const cognitionStarted = new Promise<void>((resolve) => { announceCognition = resolve; });
    let active = 0;
    let maxActive = 0;
    class BlockingCognition extends ProceduralCognitionSystem {
      override async formIntent(
        input: Parameters<ProceduralCognitionSystem["formIntent"]>[0],
      ) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        announceCognition();
        await cognitionGate;
        try {
          return await super.formIntent(input);
        } finally {
          active -= 1;
        }
      }
    }
    const blockingFactory: RuntimeEngineFactory = (manifest, context) => {
      const ids = new StableIdGenerator();
      return new IndividualEngine(manifest, {
        cognition: new BlockingCognition(),
        perception: new ProceduralPerceptionSystem(),
        drawing: new GenerativeDrawingSystem(ids),
        feedback: new ProceduralFeedbackCompositor(ids),
        relationships: new DeterministicRelationshipAdaptationSystem(),
        adaptation: new EvidenceBodyAdaptationSystem(),
        repository: context.repository,
        memory: context.memory,
        committer: context.committer,
        progress: context.progress,
        clock: { now: () => context.clock.now().toISOString() },
        ids,
        allowedPeerIds: context.allowedPeerIds,
      });
    };
    const runtime = new SocietyRuntime({
      manifests: [
        createTemplateManifest({ id: "iris" }),
        createTemplateManifest({ id: "morrow" }),
      ],
      repository,
      memory,
      engineFactory: blockingFactory,
      cycleBudgetStore: new GatedBudgetStore(),
      cyclePolicy: {
        maxConcurrentCycles: 1,
        estimatedProviderCallsPerCycle: 1,
        minimumCycleSpacingMs: 0,
      },
    });
    const first = runtime.runSingleCycle("iris");
    const second = runtime.runSingleCycle("morrow");
    await budgetStarted;
    releaseBudget();
    await cognitionStarted;
    await Promise.resolve();
    releaseCognition();
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.status).sort()).toEqual(["completed", "denied"]);
    expect(maxActive).toBe(1);
  });

  it("faults at the cycle deadline without releasing the late-commit overlap guard", async () => {
    class ManualScheduler implements RuntimeScheduler {
      readonly timers: Array<{
        callback: () => void;
        delayMs: number;
        handle: object;
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
    let release!: () => void;
    let announced!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { announced = resolve; });
    let active = 0;
    let maxActive = 0;
    class HangingCognition extends ProceduralCognitionSystem {
      override async formIntent(
        input: Parameters<ProceduralCognitionSystem["formIntent"]>[0],
      ) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        announced();
        await gate;
        try {
          return await super.formIntent(input);
        } finally {
          active -= 1;
        }
      }
    }
    const hangingFactory: RuntimeEngineFactory = (manifest, context) => {
      const ids = new StableIdGenerator();
      return new IndividualEngine(manifest, {
        cognition: manifest.id === "iris" ? new HangingCognition() : new ProceduralCognitionSystem(),
        perception: new ProceduralPerceptionSystem(),
        drawing: new GenerativeDrawingSystem(ids),
        feedback: new ProceduralFeedbackCompositor(ids),
        relationships: new DeterministicRelationshipAdaptationSystem(),
        adaptation: new EvidenceBodyAdaptationSystem(),
        repository: context.repository,
        memory: context.memory,
        committer: context.committer,
        progress: context.progress,
        clock: { now: () => context.clock.now().toISOString() },
        ids,
        allowedPeerIds: context.allowedPeerIds,
      });
    };
    const scheduler = new ManualScheduler();
    const runtime = new SocietyRuntime({
      manifests: [
        createTemplateManifest({ id: "iris" }),
        createTemplateManifest({ id: "morrow" }),
      ],
      repository,
      memory,
      engineFactory: hangingFactory,
      scheduler,
      cycleTimeoutMs: 1_000,
      cyclePolicy: { minimumCycleSpacingMs: 0 },
    });
    const baseline = await runtime.getConsistentState();
    expect(baseline.statuses.every((status) => status.snapshot.state.cycle === 0)).toBe(true);

    const first = runtime.runSingleCycle("iris");
    await started;
    scheduler.fireNext(1_000);
    await expect(first).resolves.toEqual({ status: "faulted" });
    expect(runtime.getHealthMonitor().getRecentEvents(20)).toContainEqual(
      expect.objectContaining({
        type: "cycle_fault",
        individualId: "iris",
        error: "cycle_deadline_exceeded",
      }),
    );
    await expect(runtime.runSingleCycle("iris")).rejects.toMatchObject({
      code: "CYCLE_IN_PROGRESS",
    });
    expect(maxActive).toBe(1);
    const timedOutState = await runtime.getConsistentState();
    expect(timedOutState.summary.activeCycles).toBe(0);
    expect(timedOutState.statuses.find((status) => status.manifest.id === "iris")?.health)
      .toMatchObject({ state: "faulted", lastError: "cycle_deadline_exceeded" });
    await expect(runtime.runSingleCycle("morrow")).resolves.toEqual({ status: "completed" });

    const stopping = runtime.stop({ drain: true, timeoutMs: 1_000 });
    await new Promise<void>((resolve) => setImmediate(resolve));
    scheduler.fireNext(1_000);
    await expect(stopping).resolves.toBeUndefined();
    expect(runtime.getSummary().lifecycle).toBe("stopped");

    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((await runtime.getStatus("iris"))?.snapshot.state.cycle).toBe(0);
    expect((await runtime.getStatus("morrow"))?.snapshot.state.cycle).toBe(1);
    expect((await runtime.getStatus("iris"))?.health.lastError).toBe("cycle_deadline_exceeded");
    await expect(runtime.runSingleCycle("morrow")).rejects.toMatchObject({
      code: "RUNTIME_STOPPED",
    });
    expect(maxActive).toBe(1);
  });

  it("reconciles peer routing when a durable commit crosses its publication fence before timeout", async () => {
    class ManualScheduler implements RuntimeScheduler {
      readonly timers: Array<{
        callback: () => void;
        delayMs: number;
        handle: object;
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

    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "individuals-commit-fence-"));
    try {
      const durableMemory = new FileMemoryStore(path.join(dataDir, "memories"));
      let announceMemoryPublished!: () => void;
      let releaseSnapshotPublication!: () => void;
      const memoryPublished = new Promise<void>((resolve) => {
        announceMemoryPublished = resolve;
      });
      const snapshotPublication = new Promise<void>((resolve) => {
        releaseSnapshotPublication = resolve;
      });

      class PublicationFencedRepository
        extends FileIndividualRepository
        implements CycleCommitter
      {
        constructor() {
          super(path.join(dataDir, "snapshots"));
        }

        async commit(input: Parameters<CycleCommitter["commit"]>[0]): Promise<void> {
          await durableMemory.remember(input.memories, input.signal);
          if (input.snapshot.manifest.id === "iris" && input.snapshot.state.cycle === 2) {
            // Journaled persistence has the same point-of-no-return: after
            // durable memory publication it must finish the snapshot even if
            // the caller's deadline aborts while that final write is pending.
            announceMemoryPublished();
            await snapshotPublication;
            await this.save(input.snapshot);
            return;
          }
          input.signal?.throwIfAborted();
          await this.save(input.snapshot, input.signal);
        }
      }

      const durableRepository = new PublicationFencedRepository();
      const scheduler = new ManualScheduler();
      const runtime = new SocietyRuntime({
        manifests: [
          createTemplateManifest({ id: "iris" }),
          createTemplateManifest({ id: "morrow" }),
        ],
        repository: durableRepository,
        memory: durableMemory,
        engineFactory: deterministicFactory,
        scheduler,
        cycleTimeoutMs: 1_000,
        cyclePolicy: { minimumCycleSpacingMs: 0 },
      });

      await expect(runtime.runSingleCycle("iris")).resolves.toEqual({ status: "completed" });
      await expect(runtime.runSingleCycle("morrow")).resolves.toEqual({ status: "completed" });
      const sourceSelfPortraitId = (await durableRepository.load("iris"))
        ?.state.currentSelfPortrait?.id;
      expect(sourceSelfPortraitId).toBeTruthy();

      const irisCycle = runtime.runSingleCycle("iris");
      await memoryPublished;
      scheduler.fireNext(1_000);
      await expect(irisCycle).resolves.toEqual({ status: "faulted" });
      const deadlineRevision = runtime.getSummary().revision;
      const deadlineState = await runtime.getConsistentState();
      expect(
        deadlineState.statuses.find((status) => status.manifest.id === "iris"),
      ).toMatchObject({
        snapshot: { state: { cycle: 1 } },
        health: { state: "faulted", lastError: "cycle_deadline_exceeded" },
        latestPeerPortraits: [],
      });

      let unsubscribe = (): void => undefined;
      const reconciled = new Promise<number>((resolve) => {
        unsubscribe = runtime.subscribe((revision) => {
          if (revision > deadlineRevision) {
            unsubscribe();
            resolve(revision);
          }
        });
      });
      releaseSnapshotPublication();
      const reconciliationRevision = await reconciled;
      expect(reconciliationRevision).toBe(deadlineRevision + 1);

      const persistedIris = await durableRepository.load("iris");
      const persistedPortraitId = persistedIris?.state.currentSelfPortrait?.id;
      expect(persistedPortraitId).toBeTruthy();
      expect(persistedIris?.state.cycle).toBe(2);
      const lateCommittedStatus = await runtime.getStatus("iris");
      expect(lateCommittedStatus).toMatchObject({
        snapshot: {
          state: { currentSelfPortrait: { id: persistedPortraitId } },
        },
        health: {
          state: "faulted",
          lastError: "cycle_deadline_exceeded",
        },
      });
      const lateConsumedPortraits = lateCommittedStatus?.latestPeerPortraits ?? [];
      expect(lateConsumedPortraits).toHaveLength(1);
      expect(lateConsumedPortraits[0].sourcePortraitIds).toEqual([sourceSelfPortraitId]);
      expect(
        lateCommittedStatus?.snapshot.state.latestSocialPortrait?.sourcePortraitIds,
      ).toEqual([lateConsumedPortraits[0].id]);
      expect(
        runtime.getHealthMonitor().getRecentEvents(100).filter(
          (event) =>
            event.type === "cycle_complete" &&
            event.individualId === "iris" &&
            event.cycle === 2,
        ),
      ).toEqual([]);

      await expect(runtime.runSingleCycle("morrow")).resolves.toEqual({ status: "completed" });
      expect((await runtime.getStatus("iris"))?.latestPeerPortraits.map(
        (portrait) => portrait.id,
      )).toEqual(lateConsumedPortraits.map((portrait) => portrait.id));
      await expect(runtime.runSingleCycle("iris")).resolves.toEqual({ status: "completed" });
      const irisStatus = await runtime.getStatus("iris");
      const routedPortraits = irisStatus?.latestPeerPortraits ?? [];
      expect(routedPortraits).toHaveLength(1);
      expect(routedPortraits[0]).toMatchObject({
        artistId: "morrow",
        subjectId: "iris",
      });
      expect(routedPortraits[0].sourcePortraitIds).toEqual([persistedPortraitId]);
      expect(irisStatus?.snapshot.state.latestSocialPortrait?.sourcePortraitIds).toEqual([
        routedPortraits[0].id,
      ]);
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it("bounds revision subscribers while keeping duplicate listeners idempotent", () => {
    const runtime = new SocietyRuntime({
      manifests: [createTemplateManifest({ id: "iris" })],
      repository,
      memory,
      engineFactory: deterministicFactory,
      maxRevisionSubscribers: 2,
    });
    const first = vi.fn();
    const second = vi.fn();
    const replacement = vi.fn();
    const unsubscribeFirst = runtime.subscribe(first);
    runtime.subscribe(first);
    runtime.subscribe(second);
    expect(() => runtime.subscribe(replacement)).toThrow(/capacity is exhausted/);
    runtime.pause("iris");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribeFirst();
    expect(() => runtime.subscribe(replacement)).not.toThrow();
  });

  it("bounds a non-settling durable budget reservation without wedging later admissions", async () => {
    class DeadlineScheduler implements RuntimeScheduler {
      readonly timers: Array<{
        callback: () => void;
        delayMs: number;
        handle: object;
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
    let announceFirst!: () => void;
    let announceSecond!: () => void;
    const firstSave = new Promise<void>((resolve) => { announceFirst = resolve; });
    const secondSave = new Promise<void>((resolve) => { announceSecond = resolve; });
    let saves = 0;
    class NonSettlingBudgetStore implements CycleBudgetStore {
      async load(): Promise<CycleBudgetState | undefined> { return undefined; }
      async save(): Promise<void> {
        saves += 1;
        if (saves === 1) announceFirst();
        if (saves === 2) announceSecond();
        return new Promise<void>(() => undefined);
      }
    }
    const scheduler = new DeadlineScheduler();
    const runtime = new SocietyRuntime({
      manifests: [
        createTemplateManifest({ id: "iris" }),
        createTemplateManifest({ id: "morrow" }),
      ],
      repository,
      memory,
      engineFactory: deterministicFactory,
      scheduler,
      cycleBudgetStore: new NonSettlingBudgetStore(),
      cycleTimeoutMs: 1_000,
      cyclePolicy: {
        estimatedProviderCallsPerCycle: 1,
        minimumCycleSpacingMs: 0,
      },
    });

    const iris = runtime.runSingleCycle("iris");
    await firstSave;
    scheduler.fireNext(1_000);
    await expect(iris).resolves.toEqual({ status: "faulted" });

    const morrow = runtime.runSingleCycle("morrow");
    await secondSave;
    scheduler.fireNext(1_000);
    await expect(morrow).resolves.toEqual({ status: "faulted" });
    expect(runtime.getSummary().policy.estimatedProviderCallsToday).toBe(0);
    expect(runtime.getHealthMonitor().getHealth("iris").lastError).toBe("cycle_deadline_exceeded");
    expect(runtime.getHealthMonitor().getHealth("morrow").lastError).toBe("cycle_deadline_exceeded");
  });
});
