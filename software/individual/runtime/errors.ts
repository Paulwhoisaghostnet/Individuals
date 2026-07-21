export class RuntimeControlError extends Error {
  constructor(
    message: string,
    readonly code:
      | "UNKNOWN_INDIVIDUAL"
      | "ALREADY_PAUSED"
      | "NOT_PAUSED"
      | "INVALID_TUNING"
      | "RUNTIME_STOPPED"
      | "CYCLE_IN_PROGRESS"
      | "CYCLE_BUDGET_EXHAUSTED",
    readonly retryable = false,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "RuntimeControlError";
  }
}
