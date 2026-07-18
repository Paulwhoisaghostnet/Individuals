import type { IndividualSnapshot, MemoryEntry } from "../model";

export interface IndividualRepository {
  load(individualId: string): Promise<IndividualSnapshot | undefined>;
  save(snapshot: IndividualSnapshot): Promise<void>;
}

export interface MemoryStore {
  recall(input: {
    individualId: string;
    limit: number;
  }): Promise<readonly MemoryEntry[]>;

  remember(entries: readonly MemoryEntry[]): Promise<void>;
}
