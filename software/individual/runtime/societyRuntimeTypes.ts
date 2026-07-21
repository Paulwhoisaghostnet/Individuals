import type { IndividualManifest, IndividualSnapshot, Portrait } from "../core/model";
import type { IndividualHealth } from "../observability/healthMonitor";
import type { CyclePolicyStatus } from "./cyclePolicy";

export type RuntimeLifecycleState =
  | "created"
  | "stopped"
  | "starting"
  | "running"
  | "stopping";

export interface IndividualRuntimeStatus {
  readonly manifest: IndividualManifest;
  readonly snapshot: IndividualSnapshot;
  readonly health: IndividualHealth;
  readonly isPaused: boolean;
  readonly isRunningCycle: boolean;
  readonly perceptionTuning: Readonly<Record<string, number>>;
  readonly currentPhase: "idle" | "observing" | "drawing" | "reflecting";
  /** Exact committed inputs of latestSocialPortrait; pending current-canvas drawings are excluded. */
  readonly latestPeerPortraits: readonly Portrait[];
  readonly societySize: number;
}

export interface RuntimeSummary {
  readonly lifecycle: RuntimeLifecycleState;
  readonly revision: number;
  readonly startedAt?: string;
  readonly activeCycles: number;
  readonly pausedIndividuals: number;
  readonly policy: CyclePolicyStatus;
}

export interface ConsistentRuntimeState {
  readonly statuses: readonly IndividualRuntimeStatus[];
  readonly summary: RuntimeSummary;
}
