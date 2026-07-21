import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { MemoryEntry } from "../core/model";
import type { MemoryStore } from "../core/persistence/contracts";
import {
  IdentityQuarantinedError,
  PersistenceConflictError,
  PersistenceQuotaError,
  PersistenceSizeError,
} from "./errors";
import {
  assertPersistenceKey,
  isMissingFileError,
  quarantineCorruptFile,
  readUtf8File,
  removeFileDurably,
  writeFileAtomically,
} from "./fileSafety";
import { retainFilesWithinQuota } from "./storageQuota";
import { validateMemoryEntries, validateMemoryEntry } from "./validation";

export interface MemoryRetentionPolicy {
  readonly maxEntriesPerIndividual: number;
  readonly maxBytesPerIndividual: number;
  readonly maxArchiveFilesPerIndividual: number;
  readonly maxArchiveBytesPerIndividual: number;
  readonly maxQuarantineFiles: number;
  readonly maxQuarantineBytes: number;
}

export interface FileMemoryStoreOptions {
  readonly retention?: Partial<MemoryRetentionPolicy>;
  readonly maxQuarantineEntriesToScan?: number;
  readonly now?: () => number;
}

export interface QuarantinedMemoryReplacement {
  readonly individualId: string;
  readonly entries: readonly MemoryEntry[];
  readonly signal?: AbortSignal;
}

type MemoryQuarantineReason =
  | "memory_invalid"
  | "memory_oversized"
  | "legacy_quarantine_artifact"
  | "administrative_recovery_incomplete";

const DEFAULT_RETENTION: MemoryRetentionPolicy = {
  maxEntriesPerIndividual: 512,
  maxBytesPerIndividual: 2 * 1024 * 1024,
  maxArchiveFilesPerIndividual: 8,
  maxArchiveBytesPerIndividual: 16 * 1024 * 1024,
  maxQuarantineFiles: 32,
  maxQuarantineBytes: 32 * 1024 * 1024,
};

const validateRetention = (
  input: Partial<MemoryRetentionPolicy> | undefined,
): MemoryRetentionPolicy => {
  const retention = { ...DEFAULT_RETENTION, ...input };
  for (const [field, value] of Object.entries(retention)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Memory retention field "${field}" must be a positive integer.`);
    }
  }
  return retention;
};

export class FileMemoryStore implements MemoryStore {
  private readonly retention: MemoryRetentionPolicy;
  private readonly maxQuarantineEntriesToScan: number;
  private readonly now: () => number;
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly baseDir = ".data/individuals/memories",
    options: FileMemoryStoreOptions = {},
  ) {
    this.retention = validateRetention(options.retention);
    const requestedScanLimit = options.maxQuarantineEntriesToScan ?? 4_096;
    this.maxQuarantineEntriesToScan = Number.isSafeInteger(requestedScanLimit)
      ? Math.max(1, requestedScanLimit)
      : 4_096;
    this.now = options.now ?? Date.now;
  }

  private filePath(individualId: string): string {
    assertPersistenceKey(individualId);
    return path.join(this.baseDir, `${individualId}.json`);
  }

  private quarantineMarkerPath(individualId: string): string {
    assertPersistenceKey(individualId);
    return path.join(this.baseDir, ".quarantine", `${individualId}.blocked.json`);
  }

  private async pathEntryExists(filePath: string, signal?: AbortSignal): Promise<boolean> {
    signal?.throwIfAborted();
    try {
      await fs.lstat(filePath);
      signal?.throwIfAborted();
      return true;
    } catch (error) {
      if (isMissingFileError(error)) return false;
      if (signal?.aborted) signal.throwIfAborted();
      throw error;
    }
  }

  private async hasQuarantineMarker(
    individualId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      return (
        await readUtf8File(this.quarantineMarkerPath(individualId), 8 * 1024, signal)
      ) !== undefined;
    } catch {
      if (signal?.aborted) signal.throwIfAborted();
      throw new IdentityQuarantinedError(individualId);
    }
  }

  private async hasLegacyQuarantineArtifact(
    individualId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const quarantineDirectory = path.dirname(this.quarantineMarkerPath(individualId));
    const prefix = `${individualId}.json.`;
    signal?.throwIfAborted();
    try {
      const directory = await fs.opendir(quarantineDirectory);
      let scannedEntries = 0;
      for await (const entry of directory) {
        signal?.throwIfAborted();
        scannedEntries += 1;
        if (scannedEntries > this.maxQuarantineEntriesToScan) {
          throw new IdentityQuarantinedError(individualId);
        }
        if (
          entry.name.startsWith(prefix) &&
          entry.name.endsWith(".corrupt") &&
          entry.name.length > prefix.length + ".corrupt".length
        ) {
          return true;
        }
      }
      return false;
    } catch (error) {
      if (isMissingFileError(error)) return false;
      if (signal?.aborted) signal.throwIfAborted();
      throw new IdentityQuarantinedError(individualId);
    }
  }

  private async writeQuarantineMarker(
    individualId: string,
    reason: MemoryQuarantineReason,
    signal?: AbortSignal,
  ): Promise<void> {
    const timestamp = this.now();
    const marker = {
      schemaVersion: 1,
      individualId,
      blockedAtEpochMs: Number.isFinite(timestamp)
        ? Math.max(0, Math.floor(timestamp))
        : 0,
      reason,
    };
    try {
      await writeFileAtomically(
        this.quarantineMarkerPath(individualId),
        `${JSON.stringify(marker)}\n`,
        { signal },
      );
    } catch {
      if (signal?.aborted) signal.throwIfAborted();
      throw new IdentityQuarantinedError(individualId);
    }
  }

  private async materializeLegacyQuarantineMarker(
    individualId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (!(await this.hasLegacyQuarantineArtifact(individualId, signal))) return false;
    await this.writeQuarantineMarker(individualId, "legacy_quarantine_artifact", signal);
    return true;
  }

  private async assertMemoryAvailable(
    individualId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (await this.hasQuarantineMarker(individualId, signal)) {
      throw new IdentityQuarantinedError(individualId);
    }
    if (
      !(await this.pathEntryExists(this.filePath(individualId), signal)) &&
      (await this.materializeLegacyQuarantineMarker(individualId, signal))
    ) {
      throw new IdentityQuarantinedError(individualId);
    }
  }

  private async loadEntries(
    individualId: string,
    signal?: AbortSignal,
  ): Promise<MemoryEntry[]> {
    const targetPath = this.filePath(individualId);
    await this.assertMemoryAvailable(individualId, signal);
    let data: string | undefined;
    try {
      data = await readUtf8File(
        targetPath,
        this.retention.maxBytesPerIndividual,
        signal,
      );
    } catch (error) {
      if (error instanceof PersistenceSizeError) {
        return this.quarantineMemoryFile(
          individualId,
          targetPath,
          "memory_oversized",
          error,
          signal,
        );
      }
      throw error;
    }
    if (data === undefined) return [];

    try {
      const entries = validateMemoryEntries(JSON.parse(data));
      if (entries.some((entry) => entry.individualId !== individualId)) {
        throw new Error("Memory file contains entries for another Individual.");
      }
      return entries;
    } catch (error) {
      return this.quarantineMemoryFile(
        individualId,
        targetPath,
        "memory_invalid",
        error,
        signal,
      );
    }
  }

  async recall(input: {
    individualId: string;
    limit: number;
    kind?: MemoryEntry["kind"];
  }, signal?: AbortSignal): Promise<readonly MemoryEntry[]> {
    signal?.throwIfAborted();
    assertPersistenceKey(input.individualId);
    if (!Number.isSafeInteger(input.limit) || input.limit < 0 || input.limit > 10_000) {
      throw new Error("Memory recall limit must be an integer between 0 and 10000.");
    }
    await this.assertMemoryAvailable(input.individualId, signal);
    await this.maintainAuxiliaryStorage(input.individualId);
    signal?.throwIfAborted();
    if (input.limit === 0) return [];

    const entries = await this.loadEntries(input.individualId, signal);
    signal?.throwIfAborted();
    const filtered = input.kind
      ? entries.filter((entry) => entry.kind === input.kind)
      : entries;
    return filtered.slice(-input.limit);
  }

  async remember(entries: readonly MemoryEntry[], signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (entries.length === 0) return;

    const grouped = new Map<string, MemoryEntry[]>();
    for (const rawEntry of entries) {
      const entry = validateMemoryEntry(rawEntry);
      assertPersistenceKey(entry.individualId);
      const group = grouped.get(entry.individualId) ?? [];
      group.push(entry);
      grouped.set(entry.individualId, group);
    }

    await Promise.all(
      Array.from(grouped, ([individualId, additions]) =>
        this.enqueueWrite(individualId, () => this.appendEntries(individualId, additions, signal)),
      ),
    );
  }

  private enqueueWrite(individualId: string, operation: () => Promise<void>): Promise<void> {
    const prior = this.writeQueues.get(individualId) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(operation);
    this.writeQueues.set(individualId, next);
    void next.then(
      () => {
        if (this.writeQueues.get(individualId) === next) this.writeQueues.delete(individualId);
      },
      () => {
        if (this.writeQueues.get(individualId) === next) this.writeQueues.delete(individualId);
      },
    );
    return next;
  }

  private async appendEntries(
    individualId: string,
    additions: readonly MemoryEntry[],
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    await this.assertMemoryAvailable(individualId, signal);
    await this.maintainAuxiliaryStorage(individualId);
    signal?.throwIfAborted();
    this.assertIncomingBatchWithinQuota(additions);
    const existing = await this.loadEntries(individualId, signal);
    signal?.throwIfAborted();
    const byId = new Map(existing.map((entry) => [entry.id, entry]));
    const combined = [...existing];

    for (const entry of additions) {
      const duplicate = byId.get(entry.id);
      if (duplicate) {
        if (JSON.stringify(duplicate) !== JSON.stringify(entry)) {
          throw new PersistenceConflictError(
            `Memory ID "${entry.id}" already exists with different content.`,
          );
        }
        continue;
      }
      byId.set(entry.id, entry);
      combined.push(entry);
    }

    const { retained, retainedContent, archived } = this.applyRetention(combined);
    let publicationSignal = signal;
    if (archived.length > 0) {
      await this.archive(individualId, archived, signal);
      // Publishing an archive begins the retention transaction. Complete the
      // corresponding retained set even if cancellation arrives afterward.
      publicationSignal = undefined;
    }
    await writeFileAtomically(this.filePath(individualId), retainedContent, {
      backupCount: 1,
      signal: publicationSignal,
    });
  }

  /**
   * Explicit administrative recovery boundary for an Individual's active
   * memory. The validated replacement is durable before the block is removed.
   */
  async replaceQuarantinedMemories(input: QuarantinedMemoryReplacement): Promise<void> {
    await this.enqueueWrite(input.individualId, async () => {
      input.signal?.throwIfAborted();
      const targetPath = this.filePath(input.individualId);
      let hasMarker = await this.hasQuarantineMarker(input.individualId, input.signal);
      if (!hasMarker && !(await this.pathEntryExists(targetPath, input.signal))) {
        hasMarker = await this.materializeLegacyQuarantineMarker(
          input.individualId,
          input.signal,
        );
      }
      if (!hasMarker) {
        throw new PersistenceConflictError(
          `Durable memory for "${input.individualId}" is not quarantined.`,
        );
      }
      const entries = validateMemoryEntries(input.entries);
      if (entries.some((entry) => entry.individualId !== input.individualId)) {
        throw new PersistenceConflictError(
          "Replacement memories cross the quarantined Individual boundary.",
        );
      }
      const { archived, retainedContent } = this.applyRetention(entries);
      if (archived.length > 0) {
        throw new PersistenceQuotaError(
          "administrative memory replacement",
          this.retention.maxBytesPerIndividual,
        );
      }
      try {
        await writeFileAtomically(targetPath, retainedContent, {
          backupCount: 0,
          signal: input.signal,
        });
        await removeFileDurably(
          this.quarantineMarkerPath(input.individualId),
          input.signal,
        );
      } catch {
        if (input.signal?.aborted) input.signal.throwIfAborted();
        await this.writeQuarantineMarker(
          input.individualId,
          "administrative_recovery_incomplete",
        );
        throw new IdentityQuarantinedError(input.individualId);
      }
    });
  }

  private applyRetention(entries: readonly MemoryEntry[]): {
    retained: MemoryEntry[];
    retainedContent: string;
    archived: MemoryEntry[];
  } {
    let splitIndex = Math.max(0, entries.length - this.retention.maxEntriesPerIndividual);
    let retained = entries.slice(splitIndex);
    let retainedContent = this.serializeEntries(retained);

    while (
      retained.length > 1 &&
      Buffer.byteLength(retainedContent, "utf8") > this.retention.maxBytesPerIndividual
    ) {
      splitIndex += 1;
      retained = entries.slice(splitIndex);
      retainedContent = this.serializeEntries(retained);
    }

    if (Buffer.byteLength(retainedContent, "utf8") > this.retention.maxBytesPerIndividual) {
      throw new PersistenceQuotaError(
        "active memory",
        this.retention.maxBytesPerIndividual,
      );
    }

    return {
      retained: [...retained],
      retainedContent,
      archived: entries.slice(0, splitIndex),
    };
  }

  private async archive(
    individualId: string,
    entries: readonly MemoryEntry[],
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const archiveDirectory = path.join(this.baseDir, "archives", individualId);
    await fs.mkdir(archiveDirectory, { recursive: true, mode: 0o700 });
    const content = this.serializeEntries(entries);
    const contentBytes = Buffer.byteLength(content, "utf8");
    await retainFilesWithinQuota({
      directory: archiveDirectory,
      accepts: (name) => name.endsWith(".json"),
      scope: `memory archives for ${individualId}`,
      limits: {
        maxFiles: this.retention.maxArchiveFilesPerIndividual,
        maxBytes: this.retention.maxArchiveBytesPerIndividual,
      },
      reserveFiles: 1,
      reserveBytes: contentBytes,
    });
    signal?.throwIfAborted();
    const archivePath = path.join(
      archiveDirectory,
      `${String(this.now()).padStart(16, "0")}-${entries[0]?.cycle ?? 0}-${entries.at(-1)?.cycle ?? 0}-${randomUUID()}.json`,
    );
    await writeFileAtomically(archivePath, content, { signal });
  }

  private serializeEntries(entries: readonly MemoryEntry[]): string {
    return `${JSON.stringify(entries, null, 2)}\n`;
  }

  private assertIncomingBatchWithinQuota(entries: readonly MemoryEntry[]): void {
    let bytes = 3;
    for (const entry of entries) {
      bytes += Buffer.byteLength(JSON.stringify(entry), "utf8") + 2;
      if (bytes > this.retention.maxBytesPerIndividual) {
        throw new PersistenceQuotaError(
          "memory write batch",
          this.retention.maxBytesPerIndividual,
        );
      }
    }
  }

  private async maintainAuxiliaryStorage(individualId: string): Promise<void> {
    const archiveDirectory = path.join(this.baseDir, "archives", individualId);
    const backupPrefix = `${individualId}.json.bak-`;
    await Promise.all([
      retainFilesWithinQuota({
        directory: archiveDirectory,
        accepts: (name) => name.endsWith(".json"),
        scope: `memory archives for ${individualId}`,
        limits: {
          maxFiles: this.retention.maxArchiveFilesPerIndividual,
          maxBytes: this.retention.maxArchiveBytesPerIndividual,
        },
      }),
      retainFilesWithinQuota({
        directory: this.baseDir,
        accepts: (name) =>
          name.startsWith(backupPrefix) && /^\d+$/.test(name.slice(backupPrefix.length)),
        scope: `memory backups for ${individualId}`,
        limits: { maxFiles: 1, maxBytes: this.retention.maxBytesPerIndividual },
      }),
      this.maintainQuarantine(),
    ]);
  }

  private maintainQuarantine(): Promise<unknown> {
    return retainFilesWithinQuota({
      directory: path.join(this.baseDir, ".quarantine"),
      accepts: (name) => name.endsWith(".corrupt"),
      scope: "memory quarantine",
      limits: {
        maxFiles: this.retention.maxQuarantineFiles,
        maxBytes: this.retention.maxQuarantineBytes,
      },
    });
  }

  private async quarantineMemoryFile(
    individualId: string,
    filePath: string,
    reason: MemoryQuarantineReason,
    cause: unknown,
    signal?: AbortSignal,
  ): Promise<never> {
    await this.writeQuarantineMarker(individualId, reason, signal);
    try {
      await quarantineCorruptFile(filePath, cause, this.now);
    } catch {
      // quarantineCorruptFile reports success by throwing its typed corruption
      // error. Either way, the durable block remains the public authority.
    }
    try {
      await this.maintainQuarantine();
    } catch {
      // Preserve the primary corruption signal. A failed quota cleanup remains
      // visible on the next bounded maintenance pass and blocks new writes.
    }
    throw new IdentityQuarantinedError(individualId);
  }
}
