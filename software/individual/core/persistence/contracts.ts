import type { IndividualManifest, IndividualSnapshot, MemoryEntry } from "../model";

export interface IndividualRepository {
  load(
    individualId: string,
    signal?: AbortSignal,
    expectedManifest?: IndividualManifest,
  ): Promise<IndividualSnapshot | undefined>;
  save(snapshot: IndividualSnapshot, signal?: AbortSignal): Promise<void>;
}

export interface MemoryStore {
  recall(input: {
    individualId: string;
    limit: number;
  }, signal?: AbortSignal): Promise<readonly MemoryEntry[]>;

  remember(entries: readonly MemoryEntry[], signal?: AbortSignal): Promise<void>;
}

/** Atomic persistence boundary for one completed identity cycle. */
export interface CycleCommitter {
  commit(input: {
    readonly snapshot: IndividualSnapshot;
    readonly memories: readonly MemoryEntry[];
    readonly signal?: AbortSignal;
  }): Promise<void>;
}
