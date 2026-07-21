import { IndividualEngine } from "../core/engine/IndividualEngine";
import { MAX_PEERS_PER_CYCLE } from "../core/engine/portraitRouting";
import type { IndividualManifest } from "../core/model";
import type { CycleCommitter, IndividualRepository, MemoryStore } from "../core/persistence/contracts";
import { identityPackages } from "../identity-packages";
import { JournaledCyclePersistence } from "../memory/journaledCyclePersistence";
import { HealthMonitor, type HealthMonitorOptions } from "../observability/healthMonitor";
import { CyclePolicy, type CyclePolicyConfig } from "./cyclePolicy";
import {
  FileCycleBudgetStore,
  InMemoryCycleBudgetStore,
  type CycleBudgetStore,
} from "./cycleBudgetStore";
import { ConsistentStateCoordinator } from "./consistentStateCoordinator";
import {
  createDefaultEngineFactory,
  isLlmProviderConfigured,
  type RuntimeEngineFactory,
} from "./engineFactory";
import { RuntimeControlError } from "./errors";
import { PeerPortraitCohorts } from "./peerPortraitCohorts";
import { PerceptionTuningController } from "./perceptionTuningController";
import {
  FilePerceptionTuningStore,
  InMemoryPerceptionTuningStore,
  type PerceptionTuningStore,
} from "./perceptionTuningStore";
import {
  SystemRuntimeClock,
  SystemRuntimeScheduler,
  type RuntimeClock,
  type RuntimeScheduler,
} from "./scheduler";
import {
  RuntimeInitializer,
  type RecoverableRuntimePersistence,
} from "./runtimeInitializer";
import { RuntimeRevisionPublisher } from "./runtimeRevisionPublisher";
import { RuntimeOperationDeadlineRunner } from "./runtimeOperationDeadline";
import { SocietyCycleExecutor, type CycleRunResult } from "./societyCycleExecutor";
import { SocietyCycleScheduler } from "./societyCycleScheduler";
import { SocietyControls } from "./societyControls";
import { SocietyStatusReader } from "./societyStatusReader";
import type {
  ConsistentRuntimeState,
  IndividualRuntimeStatus,
  RuntimeLifecycleState,
  RuntimeSummary,
} from "./societyRuntimeTypes";

export type { RuntimeEngineFactory, RuntimeEngineFactoryContext } from "./engineFactory";
export type { CycleRunResult } from "./societyCycleExecutor";
export type {
  ConsistentRuntimeState,
  IndividualRuntimeStatus,
  RuntimeLifecycleState,
  RuntimeSummary,
} from "./societyRuntimeTypes";

export interface SocietyRuntimeOptions {
  readonly manifests?: readonly IndividualManifest[];
  readonly repository?: IndividualRepository;
  readonly memory?: MemoryStore;
  readonly dataDir?: string;
  readonly cycleIntervalOverrideMs?: number;
  readonly cycleTimeoutMs?: number;
  readonly maxRevisionSubscribers?: number;
  readonly cyclePolicy?: Partial<CyclePolicyConfig>;
  readonly scheduler?: RuntimeScheduler;
  readonly clock?: RuntimeClock;
  readonly random?: () => number;
  readonly health?: HealthMonitorOptions;
  readonly engineFactory?: RuntimeEngineFactory;
  readonly tuningStore?: PerceptionTuningStore;
  readonly cycleBudgetStore?: CycleBudgetStore;
}

const hasMethod = <T extends string>(value: unknown, method: T): value is Record<T, Function> => {
  if (typeof value !== "object" || value === null) return false;
  return method in value && typeof (value as Record<string, unknown>)[method] === "function";
};

export class SocietyRuntime {
  private readonly engines = new Map<string, IndividualEngine>();
  private readonly manifests = new Map<string, IndividualManifest>();
  private readonly paused = new Set<string>();
  private readonly repository: IndividualRepository;
  private readonly memory: MemoryStore;
  private readonly health: HealthMonitor;
  private readonly clock: RuntimeClock;
  private readonly cyclePolicy: CyclePolicy;
  private readonly tuning: PerceptionTuningController;
  private readonly initializer: RuntimeInitializer;
  private readonly operationDeadlines: RuntimeOperationDeadlineRunner;
  private readonly cohorts = new PeerPortraitCohorts();
  private readonly cycleExecutor: SocietyCycleExecutor;
  private readonly cycleScheduler: SocietyCycleScheduler;
  private readonly controls: SocietyControls;
  private readonly statusReader: SocietyStatusReader;
  private readonly revisions: RuntimeRevisionPublisher;
  private readonly stateCoordinator = new ConsistentStateCoordinator<ConsistentRuntimeState>();
  private lifecycle: RuntimeLifecycleState = "created";
  private startedAt: string | undefined;
  private lifecycleQueue: Promise<void> = Promise.resolve();
  private revisionPublicationPending = false;

  constructor(options: SocietyRuntimeOptions = {}) {
    if ((options.repository && !options.memory) || (!options.repository && options.memory)) {
      throw new Error("Custom persistence requires both repository and memory adapters.");
    }
    if (
      options.cycleIntervalOverrideMs !== undefined &&
      (!Number.isSafeInteger(options.cycleIntervalOverrideMs) || options.cycleIntervalOverrideMs < 1_000)
    ) {
      throw new Error("cycleIntervalOverrideMs must be an integer of at least 1000 ms.");
    }
    if (
      options.cycleTimeoutMs !== undefined &&
      (!Number.isSafeInteger(options.cycleTimeoutMs) || options.cycleTimeoutMs < 1_000 || options.cycleTimeoutMs > 86_400_000)
    ) {
      throw new Error("cycleTimeoutMs must be an integer between 1000 and 86400000 ms.");
    }
    const scheduler = options.scheduler ?? new SystemRuntimeScheduler();
    const cycleTimeoutMs = options.cycleTimeoutMs ?? 120_000;
    this.operationDeadlines = new RuntimeOperationDeadlineRunner(scheduler, cycleTimeoutMs);
    this.revisions = new RuntimeRevisionPublisher(options.maxRevisionSubscribers);
    this.clock = options.clock ?? new SystemRuntimeClock();
    const providerConfigured = isLlmProviderConfigured();
    this.cyclePolicy = new CyclePolicy(
      {
        estimatedProviderCallsPerCycle: providerConfigured ? 2 : 0,
        ...options.cyclePolicy,
      },
      options.cycleBudgetStore ?? (
        options.repository
          ? new InMemoryCycleBudgetStore()
          : new FileCycleBudgetStore(options.dataDir ?? ".data/individuals")
      ),
    );

    let persistence: RecoverableRuntimePersistence | undefined;
    if (options.repository && options.memory) {
      this.repository = options.repository;
      this.memory = options.memory;
      persistence = hasMethod(options.repository, "recover")
        ? options.repository as unknown as RecoverableRuntimePersistence
        : hasMethod(options.memory, "recover")
          ? options.memory as unknown as RecoverableRuntimePersistence
          : undefined;
    } else {
      const durable = new JournaledCyclePersistence(options.dataDir ?? ".data/individuals");
      this.repository = durable;
      this.memory = durable;
      persistence = durable;
    }

    const packages = options.manifests ?? identityPackages;
    if (packages.length < 1 || packages.length > MAX_PEERS_PER_CYCLE + 1) {
      throw new Error(
        `Society runtime requires between 1 and ${MAX_PEERS_PER_CYCLE + 1} Individuals.`,
      );
    }
    for (const manifest of packages) {
      if (this.manifests.has(manifest.id)) throw new Error(`Duplicate Individual manifest ID "${manifest.id}".`);
      this.manifests.set(manifest.id, manifest);
    }
    this.health = new HealthMonitor(packages.map((manifest) => manifest.id), {
      ...options.health,
      now: options.health?.now ?? (() => this.clock.now()),
    });
    const tuningStore = options.tuningStore ?? (
      options.repository
        ? new InMemoryPerceptionTuningStore()
        : new FilePerceptionTuningStore(options.dataDir ?? ".data/individuals", () => this.clock.now())
    );
    this.tuning = new PerceptionTuningController(this.manifests, tuningStore);
    this.initializer = new RuntimeInitializer({
      persistence,
      tuning: this.tuning,
      cyclePolicy: this.cyclePolicy,
      health: this.health,
      clock: this.clock,
      scheduler,
      cycleTimeoutMs,
      onStateChanged: () => this.bumpRevision(),
    });
    this.cycleExecutor = new SocietyCycleExecutor({
      individualIds: [...this.manifests.keys()],
      engines: this.engines,
      policy: this.cyclePolicy,
      health: this.health,
      clock: this.clock,
      scheduler,
      cohorts: this.cohorts,
      tuning: this.tuning,
      isPaused: (individualId) => this.paused.has(individualId),
      onStateChanged: () => this.bumpRevision(),
      beginMutation: () => this.stateCoordinator.beginMutation(),
      cycleTimeoutMs,
    });

    const factory = options.engineFactory ?? createDefaultEngineFactory({
      onProviderFailure: (event) => this.reportProviderFailure(event),
      providerConfigured,
    });
    const committer: CycleCommitter | undefined = hasMethod(this.repository, "commit")
      ? this.repository as unknown as CycleCommitter
      : hasMethod(this.memory, "commit")
        ? this.memory as unknown as CycleCommitter
        : undefined;
    for (const manifest of packages) {
      this.engines.set(manifest.id, factory(manifest, {
        repository: this.repository,
        memory: this.memory,
        healthMonitor: this.health,
        clock: this.clock,
        committer,
        progress: this.cycleExecutor.progressSink(manifest.id),
        allowedPeerIds: [...this.manifests.keys()].filter((id) => id !== manifest.id),
      }));
    }

    this.cycleScheduler = new SocietyCycleScheduler({
      manifests: this.manifests,
      scheduler,
      random: options.random ?? Math.random,
      intervalOverrideMs: options.cycleIntervalOverrideMs,
      canRun: (id) => this.lifecycle === "running" && !this.paused.has(id),
      run: (id) => this.runSingleCycle(id),
      onError: (id, error) => {
        this.health.recordFault(id, 0, error, "scheduler_execution_failed");
        this.bumpRevision();
      },
    });
    this.controls = new SocietyControls({
      manifests: this.manifests,
      paused: this.paused,
      scheduler: this.cycleScheduler,
      tuning: this.tuning,
      initializer: this.initializer,
      deadlines: this.operationDeadlines,
      health: this.health,
      mutateSync: (operation) => this.stateCoordinator.mutateSync(operation),
      mutate: (operation) => this.stateCoordinator.mutate(operation),
      onStateChanged: () => this.bumpRevision(),
    });
    this.statusReader = new SocietyStatusReader({
      engines: this.engines,
      manifests: this.manifests,
      health: this.health,
      paused: this.paused,
      tuning: this.tuning,
      executor: this.cycleExecutor,
      policy: this.cyclePolicy,
      clock: this.clock,
      lifecycle: () => this.lifecycle,
      revision: () => this.revisions.current,
      startedAt: () => this.startedAt,
    });
  }

  async start(): Promise<void> {
    return this.exclusiveLifecycle(() => this.startExclusive());
  }

  private async startExclusive(): Promise<void> {
    if (this.lifecycle === "running") return;
    if (this.lifecycle !== "created" && this.lifecycle !== "stopped") {
      throw new Error(`Cannot start a runtime while it is ${this.lifecycle}.`);
    }
    if (this.cycleExecutor.inFlightCount > 0) {
      throw new Error("Cannot start the runtime while a commissioning cycle is still in flight.");
    }
    this.lifecycle = "starting";
    try {
      await this.operationDeadlines.run("startup", (signal) => this.startWithinDeadline(signal));
    } catch (error) {
      this.cycleScheduler.stop();
      this.lifecycle = "stopped";
      this.startedAt = undefined;
      this.health.recordStateChange("stopped", { startup: "failed" });
      this.bumpRevision();
      throw error;
    }
  }

  private async startWithinDeadline(signal: AbortSignal): Promise<void> {
    await this.initializer.ensure(signal);
    const snapshots = await Promise.all(
      Array.from(this.engines.values(), (engine) => engine.getSnapshot(signal)),
    );
    signal.throwIfAborted();
    this.cohorts.hydrate(snapshots);
    // Curatorial pause is an explicitly process-local control. Snapshot status
    // records cycle progress, not durable operator intent.
    this.paused.clear();
    const bootstrapIds = new Set(
      snapshots
        .filter((snapshot) => !snapshot.state.currentSelfPortrait)
        .map((snapshot) => snapshot.manifest.id),
    );
    this.startedAt = this.clock.now().toISOString();
    this.lifecycle = "running";
    this.bumpRevision();
    this.health.recordStateChange("running");
    // Use this startup operation's signal and remaining time. Starting a
    // nested projection deadline here would reset the clock and permit startup
    // to run for multiples of the configured bound.
    await this.captureConsistentState(signal);
    signal.throwIfAborted();
    this.cycleScheduler.start(bootstrapIds);
  }

  async stop(options: { drain?: boolean; timeoutMs?: number } = {}): Promise<void> {
    return this.exclusiveLifecycle(() => this.stopExclusive(options));
  }

  private async stopExclusive(options: { drain?: boolean; timeoutMs?: number }): Promise<void> {
    if (this.lifecycle === "stopped" && this.cycleExecutor.inFlightCount === 0) return;
    this.lifecycle = "stopping";
    this.cycleScheduler.stop();
    if (options.drain !== false && this.cycleExecutor.inFlightCount > 0) {
      await this.cycleExecutor.drain(Math.max(1, Math.floor(options.timeoutMs ?? 30_000)));
    }
    this.lifecycle = "stopped";
    this.startedAt = undefined;
    this.bumpRevision();
    this.health.recordStateChange("stopped", { activeCycles: this.cycleExecutor.inFlightCount });
  }

  pause(individualId: string): void {
    this.controls.pause(individualId);
  }

  pauseAll(): void {
    this.controls.pauseAll();
  }

  resume(individualId: string): void {
    this.controls.resume(individualId);
  }

  resumeAll(): void {
    this.controls.resumeAll();
  }

  async tunePerception(individualId: string, tuning: Readonly<Record<string, number>>): Promise<void> {
    await this.tunePerceptions([{ individualId, tuning }]);
  }

  async tunePerceptions(updates: readonly { individualId: string; tuning: Readonly<Record<string, number>> }[]): Promise<void> {
    await this.controls.tune(updates);
  }

  async runSingleCycle(individualId: string): Promise<CycleRunResult> {
    this.assertIndividual(individualId);
    this.assertCyclesAllowed();
    if (!await this.initializer.forCycle(individualId)) return { status: "faulted" };
    this.assertCyclesAllowed();
    return this.cycleExecutor.run(individualId);
  }

  async getStatus(individualId: string): Promise<IndividualRuntimeStatus | undefined> {
    if (!this.manifests.has(individualId)) return undefined;
    return (await this.getConsistentState()).statuses.find(
      (status) => status.manifest.id === individualId,
    );
  }

  async getAllStatuses(): Promise<readonly IndividualRuntimeStatus[]> {
    return (await this.getConsistentState()).statuses;
  }

  async getConsistentState(): Promise<ConsistentRuntimeState> {
    return this.operationDeadlines.run(
      "state_projection",
      (signal) => this.captureConsistentState(signal),
    );
  }

  private async captureConsistentState(signal: AbortSignal): Promise<ConsistentRuntimeState> {
    await this.initializer.ensure(signal);
    signal.throwIfAborted();
    return this.stateCoordinator.read(() => this.statusReader.capture(signal), signal);
  }

  getSummary(): RuntimeSummary {
    return this.statusReader.summary();
  }

  getHealthMonitor(): HealthMonitor {
    return this.health;
  }

  getSocietySize(): number {
    return this.manifests.size;
  }

  subscribe(listener: (revision: number) => void): () => void {
    return this.revisions.subscribe(listener);
  }

  reportProviderFailure(input: {
    individualId: string;
    cycle: number;
    operation: "form_intent" | "reflect";
    provider?: string;
    error: unknown;
    category?: string;
    retryable?: boolean;
  }): void {
    this.stateCoordinator.mutateSync(() => {
      this.assertIndividual(input.individualId);
      this.health.recordProviderFallback(input);
    });
    this.bumpRevision();
  }

  private assertCyclesAllowed(): void {
    if (this.lifecycle !== "created" && this.lifecycle !== "running") {
      throw new RuntimeControlError(
        `Cannot run an identity cycle while the runtime is ${this.lifecycle}.`,
        "RUNTIME_STOPPED",
      );
    }
  }

  private assertIndividual(individualId: string): IndividualManifest {
    const manifest = this.manifests.get(individualId);
    if (!manifest) throw new RuntimeControlError(`Unknown Individual "${individualId}".`, "UNKNOWN_INDIVIDUAL");
    return manifest;
  }

  private bumpRevision(): void {
    if (this.revisionPublicationPending) return;
    const deferred = this.stateCoordinator.notifyWhenStable(() => {
      this.revisionPublicationPending = false;
      this.revisions.bump();
    });
    if (deferred) this.revisionPublicationPending = true;
  }

  private exclusiveLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycleQueue.catch(() => undefined).then(operation);
    this.lifecycleQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

}
