import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIndividualRepository } from "../fileRepository";
import { FileMemoryStore } from "../fileMemoryStore";
import { createTemplateManifest } from "../../core/template/manifest";
import { createInitialState } from "../../core/createInitialState";
import type { MemoryEntry } from "../../core/model";

const TEST_DIR = path.join(process.cwd(), ".data/test-persistence");

describe("Durable Persistence (File Repository & Memory Store)", () => {
  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it("saves and loads individual snapshots atomically across restarts", async () => {
    const snapshotsDir = path.join(TEST_DIR, "snapshots");
    const repo = new FileIndividualRepository(snapshotsDir);

    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const initialState = createInitialState(manifest, "2026-01-01T00:00:00Z");

    await repo.save({ manifest, state: initialState });

    const newRepoInstance = new FileIndividualRepository(snapshotsDir);
    const loaded = await newRepoInstance.load("iris");

    expect(loaded).toBeDefined();
    expect(loaded?.manifest.id).toBe("iris");
    expect(loaded?.state.status).toBe("idle");
  });

  it("appends and recalls memories with filtering and limits", async () => {
    const memoriesDir = path.join(TEST_DIR, "memories");
    const store = new FileMemoryStore(memoriesDir);

    const entries: MemoryEntry[] = [
      {
        id: "m1",
        individualId: "iris",
        cycle: 1,
        kind: "reflection",
        content: "Reflected on cycle 1",
        createdAt: "2026-01-01T00:00:00Z",
        relatedIndividualIds: ["morrow"],
      },
      {
        id: "m2",
        individualId: "iris",
        cycle: 2,
        kind: "summary",
        content: "Identity summary cycle 2",
        createdAt: "2026-01-01T01:00:00Z",
        relatedIndividualIds: [],
      },
    ];

    await store.remember(entries);

    const newStoreInstance = new FileMemoryStore(memoriesDir);
    const recalledAll = await newStoreInstance.recall({ individualId: "iris", limit: 10 });
    expect(recalledAll).toHaveLength(2);

    const recalledSummaries = await newStoreInstance.recall({
      individualId: "iris",
      limit: 10,
      kind: "summary",
    });
    expect(recalledSummaries).toHaveLength(1);
    expect(recalledSummaries[0].kind).toBe("summary");
  });
});
