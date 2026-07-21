import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  assertPersistedManifestCompatible,
  IncompatibleIdentityStateError,
} from "../core/manifestCompatibility";
import type { IndividualManifest, IndividualSnapshot } from "../core/model";
import type { IndividualRepository } from "../core/persistence/contracts";
import {
  IdentityQuarantinedError,
  PersistenceConflictError,
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
import { validateIndividualSnapshot } from "./validation";

export interface FileIndividualRepositoryOptions {
  readonly backupCount?: number;
  readonly maxQuarantineEntriesToScan?: number;
  readonly now?: () => number;
}

export interface QuarantinedSnapshotReplacement {
  readonly individualId: string;
  readonly snapshot: IndividualSnapshot;
  readonly installedManifest: IndividualManifest;
  readonly signal?: AbortSignal;
}

export interface QuarantinedBackupRecovery {
  readonly individualId: string;
  readonly installedManifest: IndividualManifest;
  readonly backupIndex?: number;
  readonly signal?: AbortSignal;
}

type QuarantineReason =
  | "snapshot_invalid"
  | "snapshot_oversized"
  | "manifest_incompatible"
  | "legacy_quarantine_artifact"
  | "administrative_recovery_incomplete";

/**
 * Latest-snapshot repository with explicit corruption semantics.
 *
 * A missing file means an Individual has never been persisted. Invalid JSON,
 * incompatible schemas, malformed state, and filesystem errors are not treated
 * as absence: malformed files are quarantined and an error is raised.
 */
export class FileIndividualRepository implements IndividualRepository {
  private readonly backupCount: number;
  private readonly maxQuarantineEntriesToScan: number;
  private readonly now: () => number;

  constructor(
    private readonly baseDir = ".data/individuals/snapshots",
    options: FileIndividualRepositoryOptions = {},
  ) {
    this.backupCount = Math.max(0, Math.floor(options.backupCount ?? 2));
    const requestedScanLimit = options.maxQuarantineEntriesToScan ?? 4_096;
    this.maxQuarantineEntriesToScan = Number.isSafeInteger(requestedScanLimit)
      ? Math.max(1, requestedScanLimit)
      : 4_096;
    this.now = options.now ?? Date.now;
  }

  private filePath(id: string): string {
    assertPersistenceKey(id);
    return path.join(this.baseDir, `${id}.json`);
  }

  private quarantineMarkerPath(id: string): string {
    assertPersistenceKey(id);
    return path.join(this.baseDir, ".quarantine", `${id}.blocked.json`);
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
          // The absence of an artifact cannot be established within the bounded
          // forensic scan, so identity recovery must remain an explicit act.
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
      // An unreadable quarantine directory is never proof of a clean first boot.
      throw new IdentityQuarantinedError(individualId);
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
      // An unreadable marker can never be interpreted as permission to reset.
      throw new IdentityQuarantinedError(individualId);
    }
  }

  private async assertNotQuarantined(
    individualId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (await this.hasQuarantineMarker(individualId, signal)) {
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

  private async assertNoUnmarkedLegacyQuarantine(
    individualId: string,
    activeSnapshotExists: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    if (
      !activeSnapshotExists &&
      (await this.materializeLegacyQuarantineMarker(individualId, signal))
    ) {
      throw new IdentityQuarantinedError(individualId);
    }
  }

  private async writeQuarantineMarker(
    individualId: string,
    reason: QuarantineReason,
    signal?: AbortSignal,
  ): Promise<void> {
    const timestamp = this.now();
    const blockedAtEpochMs = Number.isFinite(timestamp)
      ? Math.max(0, Math.floor(timestamp))
      : 0;
    const marker = {
      schemaVersion: 1,
      individualId,
      blockedAtEpochMs,
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

  private async quarantineAndBlock(
    individualId: string,
    targetPath: string,
    reason: QuarantineReason,
    cause: unknown,
    signal?: AbortSignal,
  ): Promise<never> {
    // Publish the durable block before moving the invalid snapshot. A crash at
    // any later point remains fail-closed rather than looking like first boot.
    await this.writeQuarantineMarker(individualId, reason, signal);
    try {
      await quarantineCorruptFile(targetPath, cause, this.now);
    } catch {
      throw new IdentityQuarantinedError(individualId);
    }
    throw new IdentityQuarantinedError(individualId);
  }

  async load(
    individualId: string,
    signal?: AbortSignal,
    expectedManifest?: IndividualManifest,
  ): Promise<IndividualSnapshot | undefined> {
    const targetPath = this.filePath(individualId);
    await this.assertNotQuarantined(individualId, signal);
    let data: string | undefined;
    try {
      data = await readUtf8File(targetPath, 2 * 1024 * 1024, signal);
    } catch (error) {
      if (error instanceof PersistenceSizeError) {
        return this.quarantineAndBlock(
          individualId,
          targetPath,
          "snapshot_oversized",
          error,
          signal,
        );
      }
      throw error;
    }
    if (data === undefined) {
      await this.assertNoUnmarkedLegacyQuarantine(individualId, false, signal);
      return undefined;
    }

    try {
      const snapshot = validateIndividualSnapshot(JSON.parse(data));
      if (snapshot.manifest.id !== individualId) {
        throw new Error(
          `Snapshot ID "${snapshot.manifest.id}" does not match requested ID "${individualId}".`,
        );
      }
      if (expectedManifest) {
        assertPersistedManifestCompatible(expectedManifest, snapshot.manifest);
      }
      return snapshot;
    } catch (error) {
      return this.quarantineAndBlock(
        individualId,
        targetPath,
        error instanceof IncompatibleIdentityStateError
          ? "manifest_incompatible"
          : "snapshot_invalid",
        error,
        signal,
      );
    }
  }

  async save(snapshot: IndividualSnapshot, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const validated = validateIndividualSnapshot(snapshot);
    const targetPath = this.filePath(validated.manifest.id);
    await this.assertNotQuarantined(validated.manifest.id, signal);
    await this.assertNoUnmarkedLegacyQuarantine(
      validated.manifest.id,
      await this.pathEntryExists(targetPath, signal),
      signal,
    );
    await writeFileAtomically(targetPath, `${JSON.stringify(validated, null, 2)}\n`, {
      backupCount: this.backupCount,
      signal,
    });
  }

  /**
   * Explicit administrative recovery/migration boundary. The replacement must
   * already be fully validated and authored by the currently installed
   * manifest. The block is removed only after the new snapshot is durable.
   */
  async replaceQuarantinedSnapshot(
    input: QuarantinedSnapshotReplacement,
  ): Promise<void> {
    input.signal?.throwIfAborted();
    const targetPath = this.filePath(input.individualId);
    let hasMarker = await this.hasQuarantineMarker(input.individualId, input.signal);
    if (
      !hasMarker &&
      !(await this.pathEntryExists(targetPath, input.signal))
    ) {
      hasMarker = await this.materializeLegacyQuarantineMarker(
        input.individualId,
        input.signal,
      );
    }
    if (!hasMarker) {
      throw new PersistenceConflictError(
        `Durable identity "${input.individualId}" is not quarantined.`,
      );
    }
    const validated = validateIndividualSnapshot(input.snapshot);
    if (
      validated.manifest.id !== input.individualId ||
      validated.state.individualId !== input.individualId
    ) {
      throw new PersistenceConflictError(
        "Replacement snapshot does not match the quarantined Individual.",
      );
    }
    assertPersistedManifestCompatible(input.installedManifest, validated.manifest);
    try {
      await writeFileAtomically(targetPath, `${JSON.stringify(validated, null, 2)}\n`, {
        // Never rotate a possibly corrupt file left behind by a failed move into
        // the trusted backup set during administrative replacement.
        backupCount: 0,
        signal: input.signal,
      });
      await removeFileDurably(
        this.quarantineMarkerPath(input.individualId),
        input.signal,
      );
    } catch {
      if (input.signal?.aborted) input.signal.throwIfAborted();
      // The marker remains authoritative if either publication step fails.
      await this.writeQuarantineMarker(
        input.individualId,
        "administrative_recovery_incomplete",
      );
      throw new IdentityQuarantinedError(input.individualId);
    }
  }

  /**
   * Explicit administrative recovery from a retained backup. Recovery still
   * crosses the quarantine replacement boundary and therefore requires an
   * exact match with the currently installed manifest.
   */
  async recoverFromBackup(input: QuarantinedBackupRecovery): Promise<IndividualSnapshot> {
    const backupIndex = input.backupIndex ?? 1;
    if (!Number.isSafeInteger(backupIndex) || backupIndex < 1 || backupIndex > this.backupCount) {
      throw new Error(`backupIndex must be between 1 and ${this.backupCount}.`);
    }
    input.signal?.throwIfAborted();
    const targetPath = this.filePath(input.individualId);
    const backupPath = `${targetPath}.bak-${backupIndex}`;
    let data: string | undefined;
    try {
      data = await readUtf8File(backupPath, 2 * 1024 * 1024, input.signal);
    } catch (error) {
      if (error instanceof PersistenceSizeError) {
        return quarantineCorruptFile(backupPath, error, this.now);
      }
      throw error;
    }
    if (data === undefined) {
      throw new Error(`No backup ${backupIndex} exists for "${input.individualId}".`);
    }

    let snapshot: IndividualSnapshot;
    try {
      snapshot = validateIndividualSnapshot(JSON.parse(data));
    } catch (error) {
      return quarantineCorruptFile(backupPath, error, this.now);
    }
    if (snapshot.manifest.id !== input.individualId) {
      return quarantineCorruptFile(
        backupPath,
        new Error("Backup identity does not match the requested Individual."),
        this.now,
      );
    }
    await this.replaceQuarantinedSnapshot({
      individualId: input.individualId,
      snapshot,
      installedManifest: input.installedManifest,
      signal: input.signal,
    });
    return snapshot;
  }
}
