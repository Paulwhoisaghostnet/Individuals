export type CyclePhase = "idle" | "observing" | "drawing" | "reflecting";

export interface CycleRunResult {
  readonly status: "completed" | "faulted" | "denied";
  readonly retryAfterMs?: number;
}
