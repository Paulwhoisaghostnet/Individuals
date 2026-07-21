import type { IndividualEngine } from "../core/engine/IndividualEngine";
import type { IndividualManifest } from "../core/model";
import type { HealthMonitor } from "../observability/healthMonitor";
import type { CyclePolicy } from "./cyclePolicy";
import type { PerceptionTuningController } from "./perceptionTuningController";
import type { RuntimeClock } from "./scheduler";
import type { SocietyCycleExecutor } from "./societyCycleExecutor";
import type {
  ConsistentRuntimeState,
  IndividualRuntimeStatus,
  RuntimeLifecycleState,
  RuntimeSummary,
} from "./societyRuntimeTypes";

export interface SocietyStatusReaderOptions {
  readonly engines: ReadonlyMap<string, IndividualEngine>;
  readonly manifests: ReadonlyMap<string, IndividualManifest>;
  readonly health: HealthMonitor;
  readonly paused: ReadonlySet<string>;
  readonly tuning: PerceptionTuningController;
  readonly executor: SocietyCycleExecutor;
  readonly policy: CyclePolicy;
  readonly clock: RuntimeClock;
  readonly lifecycle: () => RuntimeLifecycleState;
  readonly revision: () => number;
  readonly startedAt: () => string | undefined;
}

/** Builds the read model; it never owns lifecycle, mutation, or transport. */
export class SocietyStatusReader {
  constructor(private readonly options: SocietyStatusReaderOptions) {}

  async capture(signal?: AbortSignal): Promise<ConsistentRuntimeState> {
    signal?.throwIfAborted();
    const statuses = await Promise.all(
      Array.from(this.options.engines, ([individualId, engine]) =>
        this.captureIndividual(individualId, engine, signal),
      ),
    );
    signal?.throwIfAborted();
    return { statuses, summary: this.summary() };
  }

  summary(): RuntimeSummary {
    return {
      lifecycle: this.options.lifecycle(),
      revision: this.options.revision(),
      startedAt: this.options.startedAt(),
      activeCycles: this.options.executor.activeCount,
      pausedIndividuals: this.options.paused.size,
      policy: this.options.policy.getStatus(this.options.clock.now().getTime()),
    };
  }

  private async captureIndividual(
    individualId: string,
    engine: IndividualEngine,
    signal?: AbortSignal,
  ): Promise<IndividualRuntimeStatus> {
    const snapshot = await engine.getSnapshot(signal);
    return {
      manifest: this.options.manifests.get(individualId)!,
      snapshot,
      health: this.options.health.getHealth(individualId),
      isPaused: this.options.paused.has(individualId),
      isRunningCycle: this.options.executor.isRunning(individualId),
      perceptionTuning: this.options.tuning.get(individualId),
      currentPhase: this.options.executor.phase(individualId),
      latestPeerPortraits: [...(snapshot.state.latestSocialPeerPortraits ?? [])],
      societySize: this.options.manifests.size,
    };
  }
}
