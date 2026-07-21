import type { IndividualManifest } from "../core/model";
import { RuntimeControlError } from "./errors";
import type { PerceptionTuningMap, PerceptionTuningStore } from "./perceptionTuningStore";

export interface PerceptionTuningUpdate {
  readonly individualId: string;
  readonly tuning: Readonly<Record<string, number>>;
}

export class PerceptionTuningController {
  private readonly tunings = new Map<string, Record<string, number>>();
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly manifests: ReadonlyMap<string, IndividualManifest>,
    private readonly store: PerceptionTuningStore,
  ) {}

  async initialize(signal?: AbortSignal): Promise<void> {
    const persisted = await this.awaitWithAbort(this.store.load(signal), signal);
    const validated = Object.entries(persisted).map(([individualId, tuning]) => [
      individualId,
      this.validate(individualId, tuning, false, false),
    ] as const);
    this.tunings.clear();
    for (const [individualId, tuning] of validated) this.tunings.set(individualId, tuning);
  }

  get(individualId: string): Readonly<Record<string, number>> {
    return { ...(this.tunings.get(individualId) ?? {}) };
  }

  async apply(
    updates: readonly PerceptionTuningUpdate[],
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    const durableOperation = this.enqueue(() => this.applyExclusive(updates, signal));
    // Release the caller/state-coordinator lease at its deadline, but leave the
    // serialization queue tied to the actual adapter settlement. A later tune
    // may not overtake an orphaned save and then be overwritten by it.
    return this.awaitWithAbort(durableOperation, signal);
  }

  private async applyExclusive(
    updates: readonly PerceptionTuningUpdate[],
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    signal?.throwIfAborted();
    if (!Array.isArray(updates) || updates.length === 0 || updates.length > this.manifests.size) {
      throw new RuntimeControlError(
        "Perception updates must contain between one and the society size entries.",
        "INVALID_TUNING",
      );
    }
    const seen = new Set<string>();
    const validated = updates.map((update) => {
      if (seen.has(update.individualId)) {
        throw new RuntimeControlError(
          `Perception batch contains duplicate Individual "${update.individualId}".`,
          "INVALID_TUNING",
        );
      }
      seen.add(update.individualId);
      return {
        individualId: update.individualId,
        tuning: this.validate(update.individualId, update.tuning, true, true),
      };
    });
    const next: Record<string, Readonly<Record<string, number>>> = Object.fromEntries(
      Array.from(this.tunings, ([id, controls]) => [id, { ...controls }]),
    );
    for (const update of validated) {
      next[update.individualId] = {
        ...(next[update.individualId] ?? {}),
        ...update.tuning,
      };
    }
    await this.store.save(next, signal);
    // A non-cooperative adapter can settle after its caller timed out. Its
    // durable lease now releases, but its stale result must not mutate the live
    // tuning view.
    signal?.throwIfAborted();
    for (const update of validated) {
      this.tunings.set(update.individualId, { ...next[update.individualId] });
    }
    return validated.map((update) => update.individualId);
  }

  snapshot(): PerceptionTuningMap {
    return Object.fromEntries(
      Array.from(this.tunings, ([individualId, tuning]) => [individualId, { ...tuning }]),
    );
  }

  private validate(
    individualId: string,
    tuning: Readonly<Record<string, number>>,
    requireValue: boolean,
    controlError: boolean,
  ): Record<string, number> {
    const manifest = this.manifests.get(individualId);
    if (!manifest) {
      if (controlError) {
        throw new RuntimeControlError(`Unknown Individual "${individualId}".`, "UNKNOWN_INDIVIDUAL");
      }
      throw new Error(`Persisted tuning references unknown Individual "${individualId}".`);
    }
    if (typeof tuning !== "object" || tuning === null || Array.isArray(tuning)) {
      if (controlError) throw new RuntimeControlError("Perception tuning must be a JSON object.", "INVALID_TUNING");
      throw new Error("Persisted perception tuning must be an object.");
    }
    const definitions = new Map(manifest.perception.controls.map((control) => [control.id, control]));
    const validated: Record<string, number> = {};
    for (const [id, value] of Object.entries(tuning)) {
      const definition = definitions.get(id);
      if (!definition) this.fail(`Unknown perception control "${id}" for "${individualId}".`, controlError);
      if (!Number.isFinite(value) || value < definition!.min || value > definition!.max) {
        this.fail(`Perception control "${id}" must be between ${definition!.min} and ${definition!.max}.`, controlError);
      }
      const steps = Math.round((value - definition!.min) / definition!.step);
      const aligned = definition!.min + steps * definition!.step;
      if (Math.abs(aligned - value) > Math.max(1e-9, definition!.step * 1e-6)) {
        this.fail(`Perception control "${id}" must follow step ${definition!.step}.`, controlError);
      }
      validated[id] = value;
    }
    if (requireValue && Object.keys(validated).length === 0) {
      this.fail("At least one perception control is required.", controlError);
    }
    return validated;
  }

  private fail(message: string, controlError: boolean): never {
    if (controlError) throw new RuntimeControlError(message, "INVALID_TUNING");
    throw new Error(message);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.catch(() => undefined).then(operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async awaitWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return operation;
    signal.throwIfAborted();
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = (): void => rejectAbort(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await Promise.race([operation, aborted]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }
}
