import * as fs from "node:fs/promises";
import * as path from "node:path";

import { PersistenceQuotaError } from "./errors";
import { isMissingFileError } from "./fileSafety";

const DEFAULT_MAX_SCANNED_ENTRIES = 4_096;

export interface RetainedFileLimits {
  readonly maxFiles: number;
  readonly maxBytes: number;
  readonly maxScannedEntries?: number;
}

export interface ManagedFile {
  readonly name: string;
  readonly path: string;
  readonly size: number;
  readonly modifiedAt: number;
}

export interface FileRetentionResult {
  readonly files: number;
  readonly bytes: number;
  readonly deletedFiles: number;
}

const validateLimits = (limits: RetainedFileLimits): void => {
  const fields: Array<readonly [string, number]> = [
    ["maxFiles", limits.maxFiles],
    ["maxBytes", limits.maxBytes],
  ];
  if (limits.maxScannedEntries !== undefined) {
    fields.push(["maxScannedEntries", limits.maxScannedEntries]);
  }
  for (const [field, value] of fields) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Storage retention ${field} must be a positive integer.`);
    }
  }
};

export const listManagedFiles = async (
  directory: string,
  accepts: (name: string) => boolean,
  scope: string,
  maxScannedEntries = DEFAULT_MAX_SCANNED_ENTRIES,
): Promise<ManagedFile[]> => {
  const files: ManagedFile[] = [];
  let directoryHandle: Awaited<ReturnType<typeof fs.opendir>> | undefined;
  try {
    directoryHandle = await fs.opendir(directory);
    let scanned = 0;
    for await (const entry of directoryHandle) {
      scanned += 1;
      if (scanned > maxScannedEntries) {
        throw new PersistenceQuotaError(scope, maxScannedEntries, "files");
      }
      if (!entry.isFile() || !accepts(entry.name)) continue;
      const filePath = path.join(directory, entry.name);
      try {
        const metadata = await fs.stat(filePath);
        if (!metadata.isFile()) continue;
        files.push({
          name: entry.name,
          path: filePath,
          size: metadata.size,
          modifiedAt: metadata.mtimeMs,
        });
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
      }
    }
    directoryHandle = undefined;
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  } finally {
    await directoryHandle?.close().catch(() => undefined);
  }
  return files;
};

const oldestFirst = (left: ManagedFile, right: ManagedFile): number =>
  left.modifiedAt - right.modifiedAt || left.name.localeCompare(right.name);

/**
 * Deletes only caller-selected auxiliary files until both count and aggregate
 * byte limits are satisfied. Active snapshots and current memory files are
 * never candidates. Incoming reservation lets a writer make room before it
 * publishes another archive or forensic record.
 */
export const retainFilesWithinQuota = async (input: {
  readonly directory: string;
  readonly accepts: (name: string) => boolean;
  readonly scope: string;
  readonly limits: RetainedFileLimits;
  readonly reserveFiles?: number;
  readonly reserveBytes?: number;
}): Promise<FileRetentionResult> => {
  validateLimits(input.limits);
  const reserveFiles = input.reserveFiles ?? 0;
  const reserveBytes = input.reserveBytes ?? 0;
  if (!Number.isSafeInteger(reserveFiles) || reserveFiles < 0) {
    throw new Error("Storage reserveFiles must be a non-negative integer.");
  }
  if (!Number.isSafeInteger(reserveBytes) || reserveBytes < 0) {
    throw new Error("Storage reserveBytes must be a non-negative integer.");
  }
  if (reserveFiles > input.limits.maxFiles) {
    throw new PersistenceQuotaError(input.scope, input.limits.maxFiles, "files");
  }
  if (reserveBytes > input.limits.maxBytes) {
    throw new PersistenceQuotaError(input.scope, input.limits.maxBytes);
  }

  const files = (await listManagedFiles(
    input.directory,
    input.accepts,
    input.scope,
    input.limits.maxScannedEntries,
  )).sort(oldestFirst);
  let bytes = files.reduce((total, file) => total + file.size, 0);
  let deletedFiles = 0;

  while (
    files.length + reserveFiles > input.limits.maxFiles ||
    bytes + reserveBytes > input.limits.maxBytes
  ) {
    const expired = files.shift();
    if (!expired) break;
    try {
      await fs.unlink(expired.path);
      bytes -= expired.size;
      deletedFiles += 1;
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      bytes -= expired.size;
    }
  }

  return { files: files.length, bytes, deletedFiles };
};

/** Checks a replacement/new active file without deleting any active state. */
export const assertDirectoryWriteWithinQuota = async (input: {
  readonly directory: string;
  readonly targetName: string;
  readonly contentBytes: number;
  readonly accepts: (name: string) => boolean;
  readonly scope: string;
  readonly limits: RetainedFileLimits;
}): Promise<void> => {
  validateLimits(input.limits);
  if (!Number.isSafeInteger(input.contentBytes) || input.contentBytes < 0) {
    throw new Error("Storage contentBytes must be a non-negative integer.");
  }
  if (input.contentBytes > input.limits.maxBytes) {
    throw new PersistenceQuotaError(input.scope, input.limits.maxBytes);
  }
  const files = await listManagedFiles(
    input.directory,
    input.accepts,
    input.scope,
    input.limits.maxScannedEntries,
  );
  const replaced = files.find((file) => file.name === input.targetName);
  const nextFiles = files.length + (replaced ? 0 : 1);
  const nextBytes = files.reduce((total, file) => total + file.size, 0)
    - (replaced?.size ?? 0)
    + input.contentBytes;
  if (nextFiles > input.limits.maxFiles) {
    throw new PersistenceQuotaError(input.scope, input.limits.maxFiles, "files");
  }
  if (nextBytes > input.limits.maxBytes) {
    throw new PersistenceQuotaError(input.scope, input.limits.maxBytes);
  }
};
