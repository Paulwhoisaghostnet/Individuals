import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createInitialState } from "../../core/createInitialState";
import type { MemoryEntry } from "../../core/model";
import { createTemplateManifest } from "../../core/template/manifest";
import { CorruptPersistenceError, PersistenceQuotaError } from "../errors";
import { FileMemoryStore } from "../fileMemoryStore";
import { JournaledCyclePersistence } from "../journaledCyclePersistence";

const TEST_DIR = path.join(
  os.tmpdir(),
  `individuals-storage-quota-${process.pid}-${randomUUID()}`,
);

const memoryEntry = (
  cycle: number,
  individualId = "iris",
  content = `Reflection ${cycle}`,
): MemoryEntry => ({
  id: `${individualId}--${cycle}--memory`,
  individualId,
  cycle,
  kind: "reflection",
  content,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, cycle)).toISOString(),
  relatedIndividualIds: [],
});

const usage = async (
  directory: string,
  accepts: (name: string) => boolean = () => true,
): Promise<{ files: number; bytes: number }> => {
  try {
    const names = (await fs.readdir(directory)).filter(accepts);
    const sizes = await Promise.all(
      names.map(async (name) => (await fs.stat(path.join(directory, name))).size),
    );
    return { files: names.length, bytes: sizes.reduce((total, size) => total + size, 0) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { files: 0, bytes: 0 };
    throw error;
  }
};

describe("durable storage quotas", () => {
  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it("bounds active memory, backups, archives, and memory quarantine across repeated cycles", async () => {
    const memoriesDirectory = path.join(TEST_DIR, "memories");
    const archiveDirectory = path.join(memoriesDirectory, "archives", "iris");
    const quarantineDirectory = path.join(memoriesDirectory, ".quarantine");
    await fs.mkdir(archiveDirectory, { recursive: true });
    await fs.mkdir(quarantineDirectory, { recursive: true });
    await fs.writeFile(path.join(archiveDirectory, "oversized-existing.json"), "x".repeat(4_000));
    await fs.writeFile(path.join(memoriesDirectory, "iris.json.bak-1"), "x".repeat(4_000));
    for (let index = 0; index < 5; index += 1) {
      await fs.writeFile(
        path.join(quarantineDirectory, `${index}.corrupt`),
        "q".repeat(300),
      );
    }

    const activeBytes = 1_200;
    const archiveBytes = 1_000;
    const quarantineBytes = 500;
    const store = new FileMemoryStore(memoriesDirectory, {
      retention: {
        maxEntriesPerIndividual: 2,
        maxBytesPerIndividual: activeBytes,
        maxArchiveFilesPerIndividual: 8,
        maxArchiveBytesPerIndividual: archiveBytes,
        maxQuarantineFiles: 2,
        maxQuarantineBytes: quarantineBytes,
      },
    });

    await store.recall({ individualId: "iris", limit: 0 });
    expect(await usage(archiveDirectory, (name) => name.endsWith(".json"))).toEqual({
      files: 0,
      bytes: 0,
    });
    expect(await usage(memoriesDirectory, (name) => name.startsWith("iris.json.bak-")))
      .toEqual({ files: 0, bytes: 0 });

    for (let cycle = 1; cycle <= 30; cycle += 1) {
      await store.remember([memoryEntry(cycle, "iris", `cycle-${cycle}-${"x".repeat(180)}`)]);
    }

    const active = await usage(memoriesDirectory, (name) => name === "iris.json");
    const backups = await usage(
      memoriesDirectory,
      (name) => name.startsWith("iris.json.bak-"),
    );
    const archives = await usage(archiveDirectory, (name) => name.endsWith(".json"));
    const quarantine = await usage(
      quarantineDirectory,
      (name) => name.endsWith(".corrupt"),
    );
    expect(active.files).toBe(1);
    expect(active.bytes).toBeLessThanOrEqual(activeBytes);
    expect(backups.files).toBeLessThanOrEqual(1);
    expect(backups.bytes).toBeLessThanOrEqual(activeBytes);
    expect(archives.files).toBeLessThanOrEqual(8);
    expect(archives.bytes).toBeLessThanOrEqual(archiveBytes);
    expect(quarantine.files).toBeLessThanOrEqual(2);
    expect(quarantine.bytes).toBeLessThanOrEqual(quarantineBytes);
    expect((await store.recall({ individualId: "iris", limit: 10 })).map((entry) => entry.cycle))
      .toEqual([29, 30]);
  });

  it("rejects a memory batch before creating active or archive files", async () => {
    const memoriesDirectory = path.join(TEST_DIR, "memories");
    const store = new FileMemoryStore(memoriesDirectory, {
      retention: {
        maxEntriesPerIndividual: 4,
        maxBytesPerIndividual: 256,
        maxArchiveFilesPerIndividual: 2,
        maxArchiveBytesPerIndividual: 512,
        maxQuarantineFiles: 2,
        maxQuarantineBytes: 512,
      },
    });

    await expect(
      store.remember([memoryEntry(1, "iris", "x".repeat(300))]),
    ).rejects.toBeInstanceOf(PersistenceQuotaError);
    expect(await usage(memoriesDirectory, (name) => name === "iris.json")).toEqual({
      files: 0,
      bytes: 0,
    });
    expect(await usage(path.join(memoriesDirectory, "archives", "iris"))).toEqual({
      files: 0,
      bytes: 0,
    });
  });

  it("bounds pre-existing journal residue and quarantines an oversized active journal", async () => {
    const transactions = path.join(TEST_DIR, "transactions");
    const abandoned = path.join(transactions, "abandoned");
    const quarantine = path.join(transactions, ".quarantine");
    await fs.mkdir(abandoned, { recursive: true });
    await fs.mkdir(quarantine, { recursive: true });
    for (let index = 0; index < 6; index += 1) {
      await fs.writeFile(path.join(abandoned, `${index}.json`), "a".repeat(300));
      await fs.writeFile(path.join(quarantine, `${index}.corrupt`), "q".repeat(300));
    }
    await fs.writeFile(
      path.join(transactions, "iris.journal.json"),
      "j".repeat(2_000),
    );

    const persistence = new JournaledCyclePersistence(TEST_DIR, {
      maxJournalBytes: 512,
      maxActiveJournals: 4,
      maxActiveJournalBytes: 2_048,
      maxAbandonedJournals: 2,
      maxAbandonedJournalBytes: 500,
      maxQuarantinedJournals: 2,
      maxQuarantinedJournalBytes: 500,
    });
    await expect(persistence.recover()).rejects.toBeInstanceOf(CorruptPersistenceError);

    expect(await usage(transactions, (name) => name.endsWith(".journal.json"))).toEqual({
      files: 0,
      bytes: 0,
    });
    const abandonedUsage = await usage(abandoned, (name) => name.endsWith(".json"));
    const quarantineUsage = await usage(quarantine, (name) => name.endsWith(".corrupt"));
    expect(abandonedUsage.files).toBeLessThanOrEqual(2);
    expect(abandonedUsage.bytes).toBeLessThanOrEqual(500);
    expect(quarantineUsage.files).toBeLessThanOrEqual(2);
    expect(quarantineUsage.bytes).toBeLessThanOrEqual(500);
  });

  it("bounds abandoned journals while recovering many incomplete cycles", async () => {
    const transactions = path.join(TEST_DIR, "transactions");
    await fs.mkdir(transactions, { recursive: true });
    for (let cycle = 1; cycle <= 12; cycle += 1) {
      const individualId = `individual-${cycle}`;
      await fs.writeFile(
        path.join(transactions, `${individualId}.journal.json`),
        `${JSON.stringify({
          schemaVersion: 1,
          transactionId: `transaction-${cycle}`,
          individualId,
          cycle,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, cycle)).toISOString(),
          stage: "prepared",
          memories: [memoryEntry(cycle, individualId)],
          memoryApplied: false,
          snapshotApplied: false,
        }, null, 2)}\n`,
      );
    }

    const persistence = new JournaledCyclePersistence(TEST_DIR, {
      maxJournalBytes: 4_096,
      maxActiveJournals: 16,
      maxActiveJournalBytes: 64 * 1024,
      maxAbandonedJournals: 3,
      maxAbandonedJournalBytes: 1_600,
    });
    await expect(persistence.recover()).resolves.toEqual({
      recoveredTransactions: 0,
      abandonedTransactions: 12,
    });
    const active = await usage(transactions, (name) => name.endsWith(".journal.json"));
    const retained = await usage(
      path.join(transactions, "abandoned"),
      (name) => name.endsWith(".json"),
    );
    expect(active).toEqual({ files: 0, bytes: 0 });
    expect(retained.files).toBeLessThanOrEqual(3);
    expect(retained.bytes).toBeLessThanOrEqual(1_600);
  });

  it("fails an oversized journal before publishing transaction or identity state", async () => {
    const persistence = new JournaledCyclePersistence(TEST_DIR, {
      maxJournalBytes: 512,
      maxActiveJournals: 2,
      maxActiveJournalBytes: 1_024,
    });
    const manifest = createTemplateManifest({ id: "iris" });
    const snapshot = {
      manifest,
      state: createInitialState(manifest, "2026-01-01T00:00:00.000Z"),
    };

    await expect(persistence.commit({
      snapshot,
      memories: [memoryEntry(0)],
    })).rejects.toBeInstanceOf(PersistenceQuotaError);
    expect(await usage(
      path.join(TEST_DIR, "transactions"),
      (name) => name.endsWith(".journal.json"),
    )).toEqual({ files: 0, bytes: 0 });
    expect(await persistence.load("iris")).toBeUndefined();
    expect(await persistence.recall({ individualId: "iris", limit: 10 })).toEqual([]);
  });
});
