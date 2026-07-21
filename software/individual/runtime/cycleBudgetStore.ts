import * as path from "node:path";

import { quarantineCorruptFile, readUtf8File, writeFileAtomically } from "../memory/fileSafety";

export interface CycleBudgetState {
  readonly schemaVersion: 1;
  readonly utcDay: string;
  readonly estimatedProviderCalls: number;
}

export interface CycleBudgetStore {
  load(signal?: AbortSignal): Promise<CycleBudgetState | undefined>;
  save(state: CycleBudgetState, signal?: AbortSignal): Promise<void>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const validateCycleBudgetState = (raw: unknown): CycleBudgetState => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Cycle budget state must be an object.");
  }
  const state = raw as Record<string, unknown>;
  const expected = new Set(["schemaVersion", "utcDay", "estimatedProviderCalls"]);
  const unexpected = Object.keys(state).find((key) => !expected.has(key));
  if (unexpected) throw new Error(`Cycle budget contains unsupported field "${unexpected}".`);
  if (state.schemaVersion !== 1) throw new Error("Unsupported cycle budget schema.");
  if (typeof state.utcDay !== "string" || !DAY.test(state.utcDay)) {
    throw new Error("Cycle budget UTC day is invalid.");
  }
  if (
    !Number.isSafeInteger(state.estimatedProviderCalls) ||
    (state.estimatedProviderCalls as number) < 0 ||
    (state.estimatedProviderCalls as number) > 1_000_000_000
  ) {
    throw new Error("Cycle budget call count is invalid.");
  }
  return raw as CycleBudgetState;
};

export class FileCycleBudgetStore implements CycleBudgetStore {
  private readonly filePath: string;

  constructor(dataDir = ".data/individuals") {
    this.filePath = path.join(dataDir, "runtime", "provider-budget.json");
  }

  async load(signal?: AbortSignal): Promise<CycleBudgetState | undefined> {
    const content = await readUtf8File(this.filePath, 16 * 1024, signal);
    if (content === undefined) return undefined;
    try {
      return validateCycleBudgetState(JSON.parse(content));
    } catch (error) {
      return quarantineCorruptFile(this.filePath, error);
    }
  }

  async save(state: CycleBudgetState, signal?: AbortSignal): Promise<void> {
    const validated = validateCycleBudgetState(state);
    await writeFileAtomically(this.filePath, `${JSON.stringify(validated, null, 2)}\n`, {
      backupCount: 2,
      signal,
    });
  }
}

export class InMemoryCycleBudgetStore implements CycleBudgetStore {
  private state: CycleBudgetState | undefined;

  async load(signal?: AbortSignal): Promise<CycleBudgetState | undefined> {
    signal?.throwIfAborted();
    return this.state ? { ...this.state } : undefined;
  }

  async save(state: CycleBudgetState, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.state = { ...validateCycleBudgetState(state) };
  }
}
