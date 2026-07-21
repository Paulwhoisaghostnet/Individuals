import type { IndividualManifest } from "../core/model";
import type { HealthMonitor } from "../observability/healthMonitor";
import { RuntimeControlError } from "./errors";
import type { PerceptionTuningController } from "./perceptionTuningController";
import type { RuntimeInitializer } from "./runtimeInitializer";
import type { RuntimeOperationDeadlineRunner } from "./runtimeOperationDeadline";
import type { SocietyCycleScheduler } from "./societyCycleScheduler";

export interface SocietyControlsOptions {
  readonly manifests: ReadonlyMap<string, IndividualManifest>;
  readonly paused: Set<string>;
  readonly scheduler: SocietyCycleScheduler;
  readonly tuning: PerceptionTuningController;
  readonly initializer: RuntimeInitializer;
  readonly deadlines: RuntimeOperationDeadlineRunner;
  readonly health: HealthMonitor;
  readonly mutateSync: <T>(operation: () => T) => T;
  readonly mutate: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly onStateChanged: () => void;
}

/** Curatorial controls and their atomic persistence/state-change boundary. */
export class SocietyControls {
  constructor(private readonly options: SocietyControlsOptions) {}

  pause(individualId: string): void {
    this.options.mutateSync(() => {
      this.requireIndividual(individualId);
      if (this.options.paused.has(individualId)) {
        throw new RuntimeControlError(
          `Individual "${individualId}" is already paused.`,
          "ALREADY_PAUSED",
        );
      }
      this.options.paused.add(individualId);
      this.options.scheduler.pause(individualId);
      this.options.health.recordAction(individualId, "pause");
    });
    this.options.onStateChanged();
  }

  pauseAll(): void {
    for (const individualId of this.options.manifests.keys()) {
      if (!this.options.paused.has(individualId)) this.pause(individualId);
    }
  }

  resume(individualId: string): void {
    this.options.mutateSync(() => {
      this.requireIndividual(individualId);
      if (!this.options.paused.has(individualId)) {
        throw new RuntimeControlError(
          `Individual "${individualId}" is not paused.`,
          "NOT_PAUSED",
        );
      }
      this.options.paused.delete(individualId);
      try {
        this.options.scheduler.resume(individualId);
      } catch (error) {
        this.options.paused.add(individualId);
        throw error;
      }
      this.options.health.recordAction(individualId, "resume");
    });
    this.options.onStateChanged();
  }

  resumeAll(): void {
    for (const individualId of this.options.manifests.keys()) {
      if (this.options.paused.has(individualId)) this.resume(individualId);
    }
  }

  async tune(
    updates: readonly {
      readonly individualId: string;
      readonly tuning: Readonly<Record<string, number>>;
    }[],
  ): Promise<void> {
    await this.options.deadlines.run("perception_tuning", async (signal) => {
      await this.options.initializer.ensure(signal);
      const individualIds = await this.options.mutate(async () => {
        const applied = await this.options.tuning.apply(updates, signal);
        this.options.health.recordAction("society", "tune_perception_batch", {
          individualIds: applied,
          updateCount: applied.length,
        });
        return applied;
      });
      signal.throwIfAborted();
      this.options.onStateChanged();
      return individualIds;
    });
  }

  private requireIndividual(individualId: string): void {
    if (!this.options.manifests.has(individualId)) {
      throw new RuntimeControlError(
        `Unknown Individual "${individualId}".`,
        "UNKNOWN_INDIVIDUAL",
      );
    }
  }
}
