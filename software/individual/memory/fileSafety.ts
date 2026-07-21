import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  CorruptPersistenceError,
  InvalidPersistenceKeyError,
  PersistenceReadError,
  PersistenceSizeError,
  PersistenceWriteError,
} from "./errors";

const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export const assertPersistenceKey = (key: string): void => {
  if (!SAFE_KEY.test(key)) {
    throw new InvalidPersistenceKeyError(key);
  }
};

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error;

export const isMissingFileError = (error: unknown): boolean =>
  isNodeError(error) && error.code === "ENOENT";

const syncDirectory = async (directory: string): Promise<void> => {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (
      !isNodeError(error) ||
      !["EINVAL", "ENOTSUP", "EISDIR", "EPERM"].includes(error.code ?? "")
    ) {
      throw error;
    }
  } finally {
    await handle?.close();
  }
};

/** Removes a publication marker and durably records the directory entry change. */
export const removeFileDurably = async (
  filePath: string,
  signal?: AbortSignal,
): Promise<void> => {
  signal?.throwIfAborted();
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    return;
  }
  await syncDirectory(path.dirname(filePath));
};

export interface AtomicWriteOptions {
  readonly mode?: number;
  readonly backupCount?: number;
  readonly signal?: AbortSignal;
}

export const writeFileAtomically = async (
  targetPath: string,
  content: string,
  options: AtomicWriteOptions = {},
): Promise<void> => {
  const directory = path.dirname(targetPath);
  const tempPath = path.join(directory, `.${path.basename(targetPath)}.${randomUUID()}.tmp`);
  const mode = options.mode ?? 0o600;

  options.signal?.throwIfAborted();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  options.signal?.throwIfAborted();

  try {
    options.signal?.throwIfAborted();
    const handle = await fs.open(tempPath, "wx", mode);
    try {
      await handle.writeFile(content, "utf8");
      options.signal?.throwIfAborted();
      await handle.sync();
      options.signal?.throwIfAborted();
    } finally {
      await handle.close();
    }

    const backupCount = Math.max(0, Math.floor(options.backupCount ?? 0));
    if (backupCount > 0) {
      await rotateBackups(targetPath, backupCount);
      options.signal?.throwIfAborted();
    }

    // Rename is the publication fence. Abort is deliberately checked
    // immediately before it; after rename the durable commit must finish.
    options.signal?.throwIfAborted();
    await fs.rename(tempPath, targetPath);
    await syncDirectory(directory);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    if (options.signal?.aborted) options.signal.throwIfAborted();
    throw new PersistenceWriteError(targetPath, { cause: error });
  }
};

const rotateBackups = async (targetPath: string, backupCount: number): Promise<void> => {
  for (let index = backupCount; index >= 2; index -= 1) {
    const older = `${targetPath}.bak-${index - 1}`;
    const newer = `${targetPath}.bak-${index}`;
    try {
      await fs.rename(older, newer);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
  }

  try {
    await fs.copyFile(targetPath, `${targetPath}.bak-1`);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
};

export const quarantineCorruptFile = async (
  filePath: string,
  cause: unknown,
  now: () => number = Date.now,
): Promise<never> => {
  const quarantineDirectory = path.join(path.dirname(filePath), ".quarantine");
  const quarantinePath = path.join(
    quarantineDirectory,
    `${path.basename(filePath)}.${now()}.${randomUUID()}.corrupt`,
  );

  try {
    await fs.mkdir(quarantineDirectory, { recursive: true, mode: 0o700 });
    await fs.rename(filePath, quarantinePath);
    await syncDirectory(path.dirname(filePath));
    throw new CorruptPersistenceError(filePath, quarantinePath, { cause });
  } catch (error) {
    if (error instanceof CorruptPersistenceError) throw error;
    throw new CorruptPersistenceError(filePath, undefined, {
      cause: new AggregateError([cause, error], "Validation and quarantine both failed."),
    });
  }
};

export const readUtf8File = async (
  filePath: string,
  maxBytes = 8 * 1024 * 1024,
  signal?: AbortSignal,
): Promise<string | undefined> => {
  let handle: fs.FileHandle | undefined;
  try {
    signal?.throwIfAborted();
    handle = await fs.open(filePath, "r");
    signal?.throwIfAborted();
    const size = (await handle.stat()).size;
    signal?.throwIfAborted();
    if (size > maxBytes) throw new PersistenceSizeError(filePath, maxBytes);
    const data = await handle.readFile();
    signal?.throwIfAborted();
    if (data.byteLength > maxBytes) throw new PersistenceSizeError(filePath, maxBytes);
    return data.toString("utf8");
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    if (error instanceof PersistenceSizeError) throw error;
    if (signal?.aborted) signal.throwIfAborted();
    throw new PersistenceReadError(filePath, { cause: error });
  } finally {
    await handle?.close();
  }
};
