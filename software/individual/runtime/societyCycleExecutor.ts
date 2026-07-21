import type { IndividualEngine } from "../core/engine/IndividualEngine";
import type { CycleProgressSink } from "../core/systems/contracts";
import type { HealthMonitor } from "../observability/healthMonitor";
import type { CyclePolicy } from "./cyclePolicy";
import { RuntimeControlError } from "./errors";
import type { PeerPortraitCohorts } from "./peerPortraitCohorts";
import type { PerceptionTuningController } from "./perceptionTuningController";
import { CycleDeadline } from "./cycleDeadline";
import type {
  RuntimeClock,
  RuntimeScheduler,
  RuntimeTimerHandle,
} from "./scheduler";
import type { CyclePhase, CycleRunResult } from "./cycleTypes";

export type { CyclePhase, CycleRunResult } from "./cycleTypes";

export interface SocietyCycleExecutorOptions {
  readonly individualIds: readonly string[];
  readonly engines: ReadonlyMap<string, IndividualEngine>;
  readonly policy: CyclePolicy;
  readonly health: HealthMonitor;
  readonly clock: RuntimeClock;
  readonly scheduler: RuntimeScheduler;
  readonly cohorts: PeerPortraitCohorts;
  readonly tuning: PerceptionTuningController;
  readonly isPaused: (individualId: string) => boolean;
  readonly onStateChanged: () => void;
  readonly beginMutation: () => () => void;
  readonly cycleTimeoutMs: number;
}

interface AdmissionResult {
  readonly result?: CycleRunResult;
  readonly execution?: CycleExecution;
}

interface CycleExecution {
  readonly result: Promise<CycleRunResult>;
  readonly settled: Promise<void>;
}

/** Owns cycle admission and execution without owning runtime lifecycle or scheduling. */
export class SocietyCycleExecutor {
  private readonly running = new Set<string>();
  private readonly inFlight = new Map<string, CycleExecution>();
  private readonly phases = new Map<string, CyclePhase>();
  private admissionQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: SocietyCycleExecutorOptions) {
    for (const individualId of options.individualIds) {
      this.phases.set(individualId, "idle");
    }
  }

  progressSink(individualId: string): CycleProgressSink {
    return {
      report: (event) => {
        if (
          event.individualId === individualId &&
          (event.phase === "idle" || this.running.has(individualId)) &&
          this.phases.get(individualId) !== event.phase
        ) {
          this.phases.set(individualId, event.phase);
          this.options.onStateChanged();
        }
      },
    };
  }

  async run(individualId: string): Promise<CycleRunResult> {
    const deadline = this.createDeadline(individualId);
    const admissionPromise = this.exclusiveAdmission(async (): Promise<AdmissionResult> => {
      deadline.signal.throwIfAborted();
      if (this.options.isPaused(individualId)) {
        throw new RuntimeControlError(
          `Individual "${individualId}" is paused.`,
          "ALREADY_PAUSED",
        );
      }
      if (this.inFlight.has(individualId)) {
        throw new RuntimeControlError(
          `Individual "${individualId}" already has a cycle in progress.`,
          "CYCLE_IN_PROGRESS",
          true,
          250,
        );
      }

      const mutationEnded = this.options.beginMutation();
      let capacityReleased = false;
      const releaseCapacity = (): void => {
        if (capacityReleased) return;
        capacityReleased = true;
        this.running.delete(individualId);
        this.phases.set(individualId, "idle");
        mutationEnded();
      };
      deadline.bindCapacityRelease(releaseCapacity);
      try {
        const authorization = await this.options.policy.tryReserve({
          individualId,
          nowMs: this.options.clock.now().getTime(),
          runningCycles: this.running.size,
          signal: deadline.signal,
        });
        deadline.signal.throwIfAborted();
        if (!authorization.allowed) {
          this.options.health.recordBudgetDenied(individualId, {
            reason: authorization.reason ?? "policy",
            retryAfterMs: authorization.retryAfterMs ?? 0,
          });
          releaseCapacity();
          deadline.finish();
          this.options.onStateChanged();
          return {
            result: { status: "denied", retryAfterMs: authorization.retryAfterMs },
          };
        }

        // executeCycle marks `running` synchronously before its first await.
        // The whole admission path remains serialized until the task is
        // registered, so concurrent callers cannot exceed the global limit.
        const execution = this.startExecution(individualId, deadline);
        this.inFlight.set(individualId, execution);
        const removeInFlight = (): void => {
          if (this.inFlight.get(individualId) === execution) {
            this.inFlight.delete(individualId);
          }
        };
        void execution.settled.then(removeInFlight, removeInFlight);
        return { execution };
      } catch (error) {
        releaseCapacity();
        deadline.finish();
        throw error;
      }
    });
    const admission = await Promise.race([
      admissionPromise.catch((error): AdmissionResult => {
        deadline.finish();
        if (deadline.state.exceeded) return { result: { status: "faulted" } };
        throw error;
      }),
      deadline.timedResult.then((result): AdmissionResult => ({ result })),
    ]);

    if (admission.result) return admission.result;
    return admission.execution!.result;
  }

  isRunning(individualId: string): boolean {
    return this.running.has(individualId);
  }

  phase(individualId: string): CyclePhase {
    return this.phases.get(individualId) ?? "idle";
  }

  get activeCount(): number {
    return this.running.size;
  }

  get inFlightCount(): number {
    return this.inFlight.size;
  }

  async drain(timeoutMs: number): Promise<void> {
    if (this.inFlight.size === 0) return;
    let handle: RuntimeTimerHandle | undefined;
    const timeout = new Promise<void>((resolve) => {
      handle = this.options.scheduler.setTimeout(resolve, timeoutMs);
    });
    await Promise.race([
      Promise.allSettled([...this.inFlight.values()].map((execution) => execution.settled))
        .then(() => undefined),
      timeout,
    ]);
    if (handle !== undefined) this.options.scheduler.clearTimeout(handle);
  }

  private startExecution(individualId: string, deadline: CycleDeadline): CycleExecution {
    const underlying = this.executeCycle(individualId, deadline.state, deadline.signal);
    const finalized = underlying.finally(() => {
      deadline.finish();
      // Queue the final publication while the normal execution lease is still
      // held. Releasing capacity then publishes one coalesced, stable revision.
      // A deadline may already have released the lease; in that case this is
      // the required late-settlement reconciliation revision.
      this.options.onStateChanged();
      deadline.releaseCapacity();
    });
    return {
      result: Promise.race([finalized, deadline.timedResult]),
      settled: finalized.then(() => undefined),
    };
  }

  private createDeadline(individualId: string): CycleDeadline {
    return new CycleDeadline({
      timeoutMs: this.options.cycleTimeoutMs,
      scheduler: this.options.scheduler,
      onExceeded: (timeoutError, state) => {
        this.options.health.recordDeadlineExceeded(
          individualId,
          state.attemptedCycle,
          timeoutError,
        );
        this.options.onStateChanged();
      },
    });
  }

  private async executeCycle(
    individualId: string,
    deadline: { exceeded: boolean; attemptedCycle: number },
    signal: AbortSignal,
  ): Promise<CycleRunResult> {
    const engine = this.options.engines.get(individualId);
    if (!engine) {
      throw new RuntimeControlError(
        `Unknown Individual "${individualId}".`,
        "UNKNOWN_INDIVIDUAL",
      );
    }
    this.running.add(individualId);
    const startTime = this.options.clock.now().getTime();
    try {
      const snapshot = await engine.getSnapshot(signal);
      signal.throwIfAborted();
      deadline.attemptedCycle = snapshot.state.cycle + 1;
      this.options.health.recordStart(individualId, deadline.attemptedCycle);
      const input = this.options.cohorts.cycleInput(
        individualId,
        snapshot.state.currentSelfPortrait?.id,
      );
      const record = await engine.runCycle({
        ...input,
        perceptionTuning: this.options.tuning.get(individualId),
        signal,
      });
      // Returning from runCycle is the engine's commit acknowledgement. Some
      // durable adapters deliberately finish a transaction after cancellation
      // once its publication fence has been crossed. Reconcile that committed
      // record before interpreting the caller-facing deadline; otherwise the
      // persisted canvas and the peer-routing cohort diverge.
      this.options.cohorts.apply(record);
      if (!deadline.exceeded) {
        this.options.health.recordComplete(
          individualId,
          record.cycle,
          this.options.clock.now().getTime() - startTime,
        );
      }
      return { status: deadline.exceeded ? "faulted" : "completed" };
    } catch (error) {
      if (!deadline.exceeded) {
        this.options.health.recordFault(individualId, deadline.attemptedCycle, error);
      }
      return { status: "faulted" };
    } finally {
      this.running.delete(individualId);
    }
  }

  private exclusiveAdmission<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.admissionQueue.catch(() => undefined).then(operation);
    this.admissionQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
