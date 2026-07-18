import type { IndividualSnapshot, MemoryEntry } from "../model";
import type { IndividualRepository, MemoryStore } from "./contracts";

export class InMemoryIndividualRepository implements IndividualRepository {
  private readonly snapshots = new Map<string, IndividualSnapshot>();

  async load(individualId: string): Promise<IndividualSnapshot | undefined> {
    return this.snapshots.get(individualId);
  }

  async save(snapshot: IndividualSnapshot): Promise<void> {
    this.snapshots.set(snapshot.manifest.id, snapshot);
  }
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly entries: MemoryEntry[] = [];

  async recall(input: {
    individualId: string;
    limit: number;
  }): Promise<readonly MemoryEntry[]> {
    return this.entries
      .filter((entry) => entry.individualId === input.individualId)
      .slice(-input.limit);
  }

  async remember(entries: readonly MemoryEntry[]): Promise<void> {
    this.entries.push(...entries);
  }
}
