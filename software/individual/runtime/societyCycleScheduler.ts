import type { IndividualManifest } from "../core/model";
import type { RuntimeScheduler, RuntimeTimerHandle } from "./scheduler";
import type { CycleRunResult } from "./societyCycleExecutor";

export interface SocietyCycleSchedulerOptions {
  readonly manifests: ReadonlyMap<string, IndividualManifest>;
  readonly scheduler: RuntimeScheduler;
  readonly random: () => number;
  readonly intervalOverrideMs?: number;
  readonly canRun: (individualId: string) => boolean;
  readonly run: (individualId: string) => Promise<CycleRunResult>;
  readonly onError: (individualId: string, error: unknown) => void;
}

export class SocietyCycleScheduler {
  private readonly timers = new Map<string, RuntimeTimerHandle>();
  private active = false;

  constructor(private readonly options: SocietyCycleSchedulerOptions) {}

  start(bootstrapIndividualIds: ReadonlySet<string> = new Set()): void {
    this.active = true;
    let bootstrapIndex = 0;
    for (const individualId of this.options.manifests.keys()) {
      if (bootstrapIndividualIds.has(individualId)) {
        this.schedule(individualId, 250 + bootstrapIndex * 250);
        bootstrapIndex += 1;
      } else {
        this.schedule(individualId);
      }
    }
  }

  stop(): void {
    this.active = false;
    for (const timer of this.timers.values()) this.options.scheduler.clearTimeout(timer);
    this.timers.clear();
  }

  pause(individualId: string): void {
    this.clear(individualId);
  }

  resume(individualId: string): void {
    if (this.active) this.schedule(individualId, 1_000);
  }

  private schedule(individualId: string, overrideMs?: number): void {
    if (!this.active || !this.options.canRun(individualId)) return;
    this.clear(individualId);
    const manifest = this.options.manifests.get(individualId)!;
    const base = this.options.intervalOverrideMs ?? manifest.cadence.minimumCycleIntervalMs;
    const random = this.options.random();
    if (!Number.isFinite(random) || random < 0 || random > 1) {
      throw new Error("Runtime random source must return a number between 0 and 1.");
    }
    const delay = overrideMs ?? Math.max(1_000, Math.round(base + (random - 0.5) * 0.4 * base));
    const timer = this.options.scheduler.setTimeout(() => {
      this.timers.delete(individualId);
      void this.execute(individualId);
    }, delay);
    this.timers.set(individualId, timer);
  }

  private async execute(individualId: string): Promise<void> {
    if (!this.active || !this.options.canRun(individualId)) return;
    try {
      const result = await this.options.run(individualId);
      this.schedule(individualId, result.status === "denied" ? result.retryAfterMs : undefined);
    } catch (error) {
      this.options.onError(individualId, error);
      this.schedule(individualId);
    }
  }

  private clear(individualId: string): void {
    const timer = this.timers.get(individualId);
    if (timer !== undefined) this.options.scheduler.clearTimeout(timer);
    this.timers.delete(individualId);
  }
}
