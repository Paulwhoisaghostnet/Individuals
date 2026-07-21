import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { IndividualManifest, IndividualSnapshot, MemoryEntry } from "../core/model";
import type {
  CycleCommitter,
  IndividualRepository,
  MemoryStore,
} from "../core/persistence/contracts";
import {
  PersistenceConflictError,
  PersistenceQuotaError,
  PersistenceSizeError,
} from "./errors";
import {
  FileIndividualRepository,
  type QuarantinedBackupRecovery,
  type QuarantinedSnapshotReplacement,
} from "./fileRepository";
import {
  FileMemoryStore,
  type FileMemoryStoreOptions,
  type QuarantinedMemoryReplacement,
} from "./fileMemoryStore";
import {
  assertPersistenceKey,
  isMissingFileError,
  quarantineCorruptFile,
  readUtf8File,
  writeFileAtomically,
} from "./fileSafety";
import {
  assertDirectoryWriteWithinQuota,
  listManagedFiles,
  retainFilesWithinQuota,
  type RetainedFileLimits,
} from "./storageQuota";
import { validateIndividualSnapshot, validateMemoryEntries } from "./validation";

interface CycleJournal {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly individualId: string;
  readonly cycle: number;
  readonly createdAt: string;
  readonly stage: "prepared" | "committing";
  readonly memories: readonly MemoryEntry[];
  readonly snapshot?: IndividualSnapshot;
  readonly memoryApplied: boolean;
  readonly snapshotApplied: boolean;
}

export interface CycleRecoveryReport {
  readonly recoveredTransactions: number;
  readonly abandonedTransactions: number;
}

export interface JournaledCyclePersistenceOptions {
  readonly memory?: FileMemoryStoreOptions;
  readonly now?: () => Date;
  readonly maxAbandonedJournals?: number;
  readonly maxJournalBytes?: number;
  readonly maxActiveJournals?: number;
  readonly maxActiveJournalBytes?: number;
  readonly maxAbandonedJournalBytes?: number;
  readonly maxQuarantinedJournals?: number;
  readonly maxQuarantinedJournalBytes?: number;
}

const DEFAULT_JOURNAL_LIMITS = {
  maxJournalBytes: 3 * 1024 * 1024,
  maxActiveJournals: 64,
  maxActiveJournalBytes: 64 * 1024 * 1024,
  maxAbandonedJournals: 20,
  maxAbandonedJournalBytes: 32 * 1024 * 1024,
  maxQuarantinedJournals: 20,
  maxQuarantinedJournalBytes: 32 * 1024 * 1024,
} as const;

const positiveInteger = (value: number | undefined, fallback: number, field: string): number => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return resolved;
};

const validateJournal = (value: unknown): CycleJournal => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Cycle journal root must be an object.");
  }
  const journal = value as Partial<CycleJournal>;
  if (journal.schemaVersion !== 1) throw new Error("Unsupported cycle journal schema.");
  if (typeof journal.transactionId !== "string" || journal.transactionId.length === 0) {
    throw new Error("Cycle journal transactionId is missing.");
  }
  if (typeof journal.individualId !== "string") throw new Error("Cycle journal ID is missing.");
  assertPersistenceKey(journal.individualId);
  if (!Number.isSafeInteger(journal.cycle) || (journal.cycle ?? -1) < 0) {
    throw new Error("Cycle journal number is invalid.");
  }
  if (journal.stage !== "prepared" && journal.stage !== "committing") {
    throw new Error("Cycle journal stage is invalid.");
  }
  if (typeof journal.memoryApplied !== "boolean" || typeof journal.snapshotApplied !== "boolean") {
    throw new Error("Cycle journal apply markers are invalid.");
  }
  if (typeof journal.createdAt !== "string" || !Number.isFinite(Date.parse(journal.createdAt))) {
    throw new Error("Cycle journal timestamp is invalid.");
  }
  const memories = validateMemoryEntries(journal.memories);
  if (memories.some((entry) => entry.individualId !== journal.individualId)) {
    throw new Error("Cycle journal crosses Individual identity boundaries.");
  }
  if (journal.stage === "committing") {
    const snapshot = validateIndividualSnapshot(journal.snapshot);
    if (
      snapshot.manifest.id !== journal.individualId ||
      snapshot.state.cycle !== journal.cycle
    ) {
      throw new Error("Cycle journal snapshot provenance is invalid.");
    }
  }
  return { ...journal, memories } as CycleJournal;
};

/**
 * Adapts the core's separate MemoryStore and IndividualRepository ports into a
 * recoverable unit of work. `remember()` prepares a write-ahead journal;
 * `save()` makes both memory and snapshot durable, recording every stage so a
 * restart can finish the operation idempotently.
 */
export class JournaledCyclePersistence implements IndividualRepository, MemoryStore, CycleCommitter {
  private readonly repository: FileIndividualRepository;
  private readonly memory: FileMemoryStore;
  private readonly journalDirectory: string;
  private readonly now: () => Date;
  private readonly maxJournalBytes: number;
  private readonly activeJournalLimits: RetainedFileLimits;
  private readonly abandonedJournalLimits: RetainedFileLimits;
  private readonly quarantinedJournalLimits: RetainedFileLimits;
  private readonly prepared = new Map<string, CycleJournal>();
  private recoveryPromise: Promise<CycleRecoveryReport> | undefined;
  private journalMutationQueue: Promise<void> = Promise.resolve();

  constructor(
    baseDir = ".data/individuals",
    options: JournaledCyclePersistenceOptions = {},
  ) {
    this.repository = new FileIndividualRepository(path.join(baseDir, "snapshots"));
    this.memory = new FileMemoryStore(path.join(baseDir, "memories"), options.memory);
    this.journalDirectory = path.join(baseDir, "transactions");
    this.now = options.now ?? (() => new Date());
    this.maxJournalBytes = positiveInteger(
      options.maxJournalBytes,
      DEFAULT_JOURNAL_LIMITS.maxJournalBytes,
      "maxJournalBytes",
    );
    this.activeJournalLimits = {
      maxFiles: positiveInteger(
        options.maxActiveJournals,
        DEFAULT_JOURNAL_LIMITS.maxActiveJournals,
        "maxActiveJournals",
      ),
      maxBytes: positiveInteger(
        options.maxActiveJournalBytes,
        DEFAULT_JOURNAL_LIMITS.maxActiveJournalBytes,
        "maxActiveJournalBytes",
      ),
    };
    this.abandonedJournalLimits = {
      maxFiles: positiveInteger(
        options.maxAbandonedJournals,
        DEFAULT_JOURNAL_LIMITS.maxAbandonedJournals,
        "maxAbandonedJournals",
      ),
      maxBytes: positiveInteger(
        options.maxAbandonedJournalBytes,
        DEFAULT_JOURNAL_LIMITS.maxAbandonedJournalBytes,
        "maxAbandonedJournalBytes",
      ),
    };
    this.quarantinedJournalLimits = {
      maxFiles: positiveInteger(
        options.maxQuarantinedJournals,
        DEFAULT_JOURNAL_LIMITS.maxQuarantinedJournals,
        "maxQuarantinedJournals",
      ),
      maxBytes: positiveInteger(
        options.maxQuarantinedJournalBytes,
        DEFAULT_JOURNAL_LIMITS.maxQuarantinedJournalBytes,
        "maxQuarantinedJournalBytes",
      ),
    };
  }

  async recover(signal?: AbortSignal): Promise<CycleRecoveryReport> {
    signal?.throwIfAborted();
    if (!this.recoveryPromise) {
      const attempt = this.performRecovery(signal);
      this.recoveryPromise = attempt;
      void attempt.catch(() => {
        if (this.recoveryPromise === attempt) this.recoveryPromise = undefined;
      });
    }
    return this.awaitWithAbort(this.recoveryPromise, signal);
  }

  async load(
    individualId: string,
    signal?: AbortSignal,
    expectedManifest?: IndividualManifest,
  ): Promise<IndividualSnapshot | undefined> {
    signal?.throwIfAborted();
    await this.recover(signal);
    signal?.throwIfAborted();
    return this.repository.load(individualId, signal, expectedManifest);
  }

  async recall(input: {
    individualId: string;
    limit: number;
  }, signal?: AbortSignal): Promise<readonly MemoryEntry[]> {
    signal?.throwIfAborted();
    await this.recover(signal);
    signal?.throwIfAborted();
    return this.memory.recall(input, signal);
  }

  /** Production-facing administrative boundary; ordinary cycle paths cannot clear blocks. */
  replaceQuarantinedSnapshot(input: QuarantinedSnapshotReplacement): Promise<void> {
    return this.repository.replaceQuarantinedSnapshot(input);
  }

  /** Production-facing backup recovery with exact installed-manifest verification. */
  recoverSnapshotFromBackup(
    input: QuarantinedBackupRecovery,
  ): Promise<IndividualSnapshot> {
    return this.repository.recoverFromBackup(input);
  }

  /** Production-facing active-memory replacement; journal recovery remains separate. */
  replaceQuarantinedMemories(input: QuarantinedMemoryReplacement): Promise<void> {
    return this.memory.replaceQuarantinedMemories(input);
  }

  async remember(entries: readonly MemoryEntry[], signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.recover(signal);
    signal?.throwIfAborted();
    if (entries.length === 0) return;
    const validated = validateMemoryEntries(entries);
    const individualIds = new Set(validated.map((entry) => entry.individualId));
    const cycles = new Set(validated.map((entry) => entry.cycle));
    if (individualIds.size !== 1 || cycles.size !== 1) {
      throw new PersistenceConflictError(
        "A cycle transaction may contain memories for only one Individual and one cycle.",
      );
    }
    const individualId = validated[0].individualId;
    const cycle = validated[0].cycle;
    this.assertMemoriesFitJournal(validated);
    const prior = this.prepared.get(individualId);
    if (prior) {
      if (prior.cycle === cycle && JSON.stringify(prior.memories) === JSON.stringify(validated)) {
        return;
      }
      throw new PersistenceConflictError(
        `Individual "${individualId}" already has a prepared cycle transaction.`,
      );
    }

    const journal: CycleJournal = {
      schemaVersion: 1,
      transactionId: randomUUID(),
      individualId,
      cycle,
      createdAt: this.now().toISOString(),
      stage: "prepared",
      memories: validated,
      memoryApplied: false,
      snapshotApplied: false,
    };
    await this.writeJournal(journal, signal);
    this.prepared.set(individualId, journal);
  }

  async save(snapshot: IndividualSnapshot, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.recover(signal);
    signal?.throwIfAborted();
    const validated = validateIndividualSnapshot(snapshot);
    const individualId = validated.manifest.id;
    const prepared = this.prepared.get(individualId);
    if (!prepared) {
      await this.repository.save(validated, signal);
      return;
    }
    if (prepared.cycle !== validated.state.cycle) {
      throw new PersistenceConflictError(
        `Prepared memory cycle ${prepared.cycle} does not match snapshot cycle ${validated.state.cycle}.`,
      );
    }

    const committing: CycleJournal = {
      ...prepared,
      stage: "committing",
      snapshot: validated,
    };
    try {
      await this.writeJournal(committing, signal);
      await this.applyJournal(committing, signal);
      this.prepared.delete(individualId);
    } catch (error) {
      // An abort before the memory publication fence moves the journal to the
      // bounded abandoned set. Release the matching in-process legacy fence as
      // well so a later cycle is not blocked until restart.
      if (signal?.aborted) this.prepared.delete(individualId);
      throw error;
    }
  }

  async commit(input: {
    readonly snapshot: IndividualSnapshot;
    readonly memories: readonly MemoryEntry[];
    readonly signal?: AbortSignal;
  }): Promise<void> {
    input.signal?.throwIfAborted();
    await this.recover(input.signal);
    input.signal?.throwIfAborted();
    const snapshot = validateIndividualSnapshot(input.snapshot);
    const memories = validateMemoryEntries(input.memories);
    this.assertMemoriesFitJournal(memories);
    const individualId = snapshot.manifest.id;
    if (
      memories.some(
        (memory) =>
          memory.individualId !== individualId || memory.cycle !== snapshot.state.cycle,
      )
    ) {
      throw new PersistenceConflictError(
        "Committed memories must belong to the snapshot Individual and cycle.",
      );
    }
    const prior = this.prepared.get(individualId);
    if (prior) {
      throw new PersistenceConflictError(
        `Individual "${individualId}" already has a legacy prepared transaction.`,
      );
    }
    const journal: CycleJournal = {
      schemaVersion: 1,
      transactionId: randomUUID(),
      individualId,
      cycle: snapshot.state.cycle,
      createdAt: this.now().toISOString(),
      stage: "committing",
      memories,
      snapshot,
      memoryApplied: false,
      snapshotApplied: false,
    };
    await this.writeJournal(journal, input.signal);
    await this.applyJournal(journal, input.signal);
  }

  private async performRecovery(signal?: AbortSignal): Promise<CycleRecoveryReport> {
    signal?.throwIfAborted();
    await fs.mkdir(this.journalDirectory, { recursive: true, mode: 0o700 });
    signal?.throwIfAborted();
    await this.maintainJournalResidue();
    signal?.throwIfAborted();
    const activeJournals = await listManagedFiles(
      this.journalDirectory,
      (name) => name.endsWith(".journal.json"),
      "active transaction journals",
    );
    if (activeJournals.length > this.activeJournalLimits.maxFiles) {
      throw new PersistenceQuotaError(
        "active transaction journals",
        this.activeJournalLimits.maxFiles,
        "files",
      );
    }
    const oversized = activeJournals.find((file) => file.size > this.maxJournalBytes);
    if (oversized) {
      await this.quarantineJournal(
        oversized.path,
        new PersistenceSizeError(oversized.path, this.maxJournalBytes),
      );
    }
    const activeBytes = activeJournals.reduce((total, file) => total + file.size, 0);
    if (activeBytes > this.activeJournalLimits.maxBytes) {
      throw new PersistenceQuotaError(
        "active transaction journals",
        this.activeJournalLimits.maxBytes,
      );
    }
    let recoveredTransactions = 0;
    let abandonedTransactions = 0;

    for (const file of activeJournals.sort((left, right) => left.name.localeCompare(right.name))) {
      signal?.throwIfAborted();
      const journalPath = file.path;
      let content: string | undefined;
      try {
        content = await readUtf8File(journalPath, this.maxJournalBytes, signal);
      } catch (error) {
        if (error instanceof PersistenceSizeError) {
          await this.quarantineJournal(journalPath, error);
        }
        throw error;
      }
      if (content === undefined) continue;
      let journal: CycleJournal | undefined;
      try {
        journal = validateJournal(JSON.parse(content));
      } catch (error) {
        await this.quarantineJournal(journalPath, error);
      }
      if (!journal) continue;

      if (journal.stage === "prepared") {
        signal?.throwIfAborted();
        await this.abandonJournal(journalPath, journal);
        abandonedTransactions += 1;
        continue;
      }

      signal?.throwIfAborted();
      // Recovery of a validated committing journal is a transaction repair.
      // Once begun it completes independently; caller cancellation may detach
      // from the wait but must not convert committed intent into abandonment.
      await this.applyJournal(journal);
      recoveredTransactions += 1;
    }

    return { recoveredTransactions, abandonedTransactions };
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

  private async applyJournal(initial: CycleJournal, signal?: AbortSignal): Promise<void> {
    const snapshot = initial.snapshot;
    if (!snapshot) throw new Error("Committing journal has no snapshot.");
    let journal = initial;

    if (!journal.memoryApplied) {
      if (signal?.aborted) {
        await this.abandonJournal(this.journalPath(journal.individualId), journal);
        signal.throwIfAborted();
      }
      try {
        await this.memory.remember(journal.memories, signal);
      } catch (error) {
        if (signal?.aborted) {
          await this.abandonJournal(this.journalPath(journal.individualId), journal);
          signal.throwIfAborted();
        }
        throw error;
      }
      journal = { ...journal, memoryApplied: true };
      // Once memory is durable, cancellation cannot roll the transaction back;
      // complete the snapshot and markers so recovery never exposes a partial
      // identity cycle.
      await this.writeJournal(journal);
    }
    if (!journal.snapshotApplied) {
      await this.repository.save(snapshot);
      journal = { ...journal, snapshotApplied: true };
      await this.writeJournal(journal);
    }
    await this.deleteJournal(this.journalPath(journal.individualId));
  }

  private async abandonJournal(journalPath: string, journal: CycleJournal): Promise<void> {
    await this.exclusiveJournalMutation(async () => {
      const abandonedDirectory = path.join(this.journalDirectory, "abandoned");
      await fs.mkdir(abandonedDirectory, { recursive: true, mode: 0o700 });
      let journalBytes: number;
      try {
        journalBytes = (await fs.stat(journalPath)).size;
      } catch (error) {
        if (isMissingFileError(error)) {
          await this.maintainAbandonedJournals();
          return;
        }
        throw error;
      }
      await retainFilesWithinQuota({
        directory: abandonedDirectory,
        accepts: (name) => name.endsWith(".json"),
        scope: "abandoned transaction journals",
        limits: this.abandonedJournalLimits,
        reserveFiles: 1,
        reserveBytes: journalBytes,
      });
      const destination = path.join(
        abandonedDirectory,
        `${String(this.now().getTime()).padStart(16, "0")}-${journal.transactionId}.json`,
      );
      try {
        await fs.rename(journalPath, destination);
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
      }
    });
  }

  private journalPath(individualId: string): string {
    assertPersistenceKey(individualId);
    return path.join(this.journalDirectory, `${individualId}.journal.json`);
  }

  private async writeJournal(journal: CycleJournal, signal?: AbortSignal): Promise<void> {
    const content = `${JSON.stringify(journal, null, 2)}\n`;
    const contentBytes = Buffer.byteLength(content, "utf8");
    if (contentBytes > this.maxJournalBytes) {
      throw new PersistenceQuotaError("transaction journal", this.maxJournalBytes);
    }
    const targetPath = this.journalPath(journal.individualId);
    await this.exclusiveJournalMutation(async () => {
      signal?.throwIfAborted();
      await fs.mkdir(this.journalDirectory, { recursive: true, mode: 0o700 });
      await assertDirectoryWriteWithinQuota({
        directory: this.journalDirectory,
        targetName: path.basename(targetPath),
        contentBytes,
        accepts: (name) => name.endsWith(".journal.json"),
        scope: "active transaction journals",
        limits: this.activeJournalLimits,
      });
      signal?.throwIfAborted();
      await writeFileAtomically(targetPath, content, { signal });
    });
  }

  private assertMemoriesFitJournal(memories: readonly MemoryEntry[]): void {
    let bytes = 3;
    for (const memory of memories) {
      bytes += Buffer.byteLength(JSON.stringify(memory), "utf8") + 2;
      if (bytes > this.maxJournalBytes) {
        throw new PersistenceQuotaError("transaction journal", this.maxJournalBytes);
      }
    }
  }

  private async deleteJournal(journalPath: string): Promise<void> {
    await this.exclusiveJournalMutation(async () => {
      try {
        await fs.unlink(journalPath);
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
      }
    });
  }

  private async quarantineJournal(filePath: string, cause: unknown): Promise<never> {
    return this.exclusiveJournalMutation(async () => {
      let quarantineError: unknown;
      try {
        await quarantineCorruptFile(filePath, cause);
      } catch (error) {
        quarantineError = error;
      }
      try {
        await this.maintainQuarantinedJournals();
      } catch {
        // The original corruption remains the primary startup fault. A quota
        // cleanup failure prevents subsequent journal writes from passing their
        // own bounded preflight.
      }
      throw quarantineError;
    });
  }

  private async maintainJournalResidue(): Promise<void> {
    await Promise.all([
      this.maintainAbandonedJournals(),
      this.maintainQuarantinedJournals(),
    ]);
  }

  private maintainAbandonedJournals(): Promise<unknown> {
    return retainFilesWithinQuota({
      directory: path.join(this.journalDirectory, "abandoned"),
      accepts: (name) => name.endsWith(".json"),
      scope: "abandoned transaction journals",
      limits: this.abandonedJournalLimits,
    });
  }

  private maintainQuarantinedJournals(): Promise<unknown> {
    return retainFilesWithinQuota({
      directory: path.join(this.journalDirectory, ".quarantine"),
      accepts: (name) => name.endsWith(".corrupt"),
      scope: "transaction journal quarantine",
      limits: this.quarantinedJournalLimits,
    });
  }

  private exclusiveJournalMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.journalMutationQueue.catch(() => undefined).then(operation);
    this.journalMutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
