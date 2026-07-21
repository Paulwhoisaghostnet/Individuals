import type { IndividualSnapshot, MemoryEntry } from "../model";
import type { IndividualRepository, MemoryStore } from "./contracts";

export class InMemoryIndividualRepository implements IndividualRepository {
  private readonly snapshots = new Map<string, IndividualSnapshot>();

  async load(individualId: string, signal?: AbortSignal): Promise<IndividualSnapshot | undefined> {
    signal?.throwIfAborted();
    return this.snapshots.get(individualId);
  }

  async save(snapshot: IndividualSnapshot, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.snapshots.set(snapshot.manifest.id, snapshot);
  }
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly entries: MemoryEntry[] = [];

  async recall(input: {
    individualId: string;
    limit: number;
  }, signal?: AbortSignal): Promise<readonly MemoryEntry[]> {
    signal?.throwIfAborted();
    return this.entries
      .filter((entry) => entry.individualId === input.individualId)
      .slice(-input.limit);
  }

  async remember(entries: readonly MemoryEntry[], signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.entries.push(...entries);
  }
}
