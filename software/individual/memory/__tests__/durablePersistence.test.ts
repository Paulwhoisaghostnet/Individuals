import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileIndividualRepository } from "../fileRepository";
import { FileMemoryStore } from "../fileMemoryStore";
import { JournaledCyclePersistence } from "../journaledCyclePersistence";
import { IdentityQuarantinedError } from "../errors";
import { createTemplateManifest } from "../../core/template/manifest";
import { createInitialState } from "../../core/createInitialState";
import type {
  ArtworkDescriptor,
  IndividualSnapshot,
  MemoryEntry,
  Portrait,
} from "../../core/model";
import { buildSocialFeedbackEvidence } from "../../core/socialEvidence";
import {
  DEFAULT_ART_PRACTICE,
  defaultRenderingDescriptor,
} from "../../drawing/figureDescriptor";
import { validateIndividualSnapshot } from "../validation";
import { SocietyRuntime } from "../../runtime/societyRuntime";

const TEST_DIR = path.join(
  os.tmpdir(),
  `individuals-persistence-${process.pid}-${randomUUID()}`,
);

const socialSnapshot = (): IndividualSnapshot => {
  const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
  const visual = manifest.identity.idealPhysicalForm.visualSpecification!;
  const descriptor: ArtworkDescriptor = {
    schemaVersion: 1,
    figure: visual.figure,
    rendering: defaultRenderingDescriptor(),
    features: [{ label: "recognizable face", prominence: 0.8 }],
    omittedFeatures: [],
    styleName: "persisted contour",
    primitives: ["line"],
    confidence: 0.8,
    anatomy: visual.anatomy,
    practice: DEFAULT_ART_PRACTICE,
  };
  const source: Portrait = {
    id: "iris--1--self",
    cycle: 1,
    artistId: "iris",
    subjectId: "iris",
    role: "self",
    createdAt: "2026-01-01T00:00:01Z",
    artwork: { format: "svg", width: 800, height: 1000, content: "<svg></svg>" },
    descriptor,
    sourcePortraitIds: [],
  };
  const peerDescriptor: ArtworkDescriptor = {
    ...descriptor,
    figure: { ...descriptor.figure, shoulderWidth: 0.61, postureLean: 0.08 },
    confidence: 0.72,
  };
  const peer: Portrait = {
    id: "morrow--2--peer--iris",
    cycle: 2,
    artistId: "morrow",
    subjectId: "iris",
    role: "peer",
    createdAt: "2026-01-01T00:00:02Z",
    artwork: { format: "svg", width: 800, height: 1000, content: "<svg></svg>" },
    descriptor: peerDescriptor,
    observationEvidence: {
      modelId: "morrow-lens-v1",
      tuning: { strength: 0.5 },
      source: descriptor,
      perceived: peerDescriptor,
      effects: [],
    },
    sourcePortraitIds: [source.id],
  };
  const evidence = buildSocialFeedbackEvidence({
    subjectId: "iris",
    portraits: [peer],
    sourceSelfPortrait: source,
    idealFigure: visual.figure,
  });
  const current: Portrait = {
    ...source,
    id: "iris--2--self",
    cycle: 2,
    createdAt: "2026-01-01T00:00:03Z",
  };
  const social: Portrait = {
    id: "iris--2--social",
    cycle: 2,
    artistId: "collective",
    subjectId: "iris",
    role: "social",
    createdAt: "2026-01-01T00:00:03Z",
    artwork: { format: "svg", width: 800, height: 1000, content: "<svg></svg>" },
    descriptor: evidence.consensus,
    socialEvidence: evidence,
    sourcePortraitIds: [peer.id],
  };
  return {
    manifest,
    state: {
      ...createInitialState(manifest, "2026-01-01T00:00:00Z"),
      cycle: 2,
      currentSelfPortrait: current,
      selfPortraitHistory: [source],
      latestSocialPortrait: social,
      latestSocialPeerPortraits: [peer],
      updatedAt: "2026-01-01T00:00:03Z",
    },
  };
};

const replaceSocial = (
  snapshot: IndividualSnapshot,
  portrait: Portrait,
): IndividualSnapshot => ({
  ...snapshot,
  state: { ...snapshot.state, latestSocialPortrait: portrait },
});

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

  it("blocks silent amnesia until quarantined memory is explicitly replaced", async () => {
    const memoriesDir = path.join(TEST_DIR, "quarantined-memories");
    await fs.mkdir(memoriesDir, { recursive: true });
    await fs.writeFile(path.join(memoriesDir, "iris.json"), '[{"id":', "utf8");
    const store = new FileMemoryStore(memoriesDir, { now: () => 41 });

    await expect(
      store.recall({ individualId: "iris", limit: 10 }),
    ).rejects.toMatchObject({
      code: "PERSISTENCE_QUARANTINED",
      individualId: "iris",
    });
    const quarantineDir = path.join(memoriesDir, ".quarantine");
    const quarantined = await fs.readdir(quarantineDir);
    expect(quarantined).toContain("iris.blocked.json");
    expect(quarantined.filter((name) => name.endsWith(".corrupt"))).toHaveLength(1);
    expect(JSON.parse(await fs.readFile(
      path.join(quarantineDir, "iris.blocked.json"),
      "utf8",
    ))).toEqual({
      schemaVersion: 1,
      individualId: "iris",
      blockedAtEpochMs: 41,
      reason: "memory_invalid",
    });

    const replacement: MemoryEntry = {
      id: "m-recovered",
      individualId: "iris",
      cycle: 7,
      kind: "summary",
      content: "A curator-validated memory replacement.",
      createdAt: "2026-01-01T07:00:00Z",
      relatedIndividualIds: [],
    };
    const restarted = new FileMemoryStore(memoriesDir);
    await expect(restarted.remember([replacement])).rejects.toMatchObject({
      code: "PERSISTENCE_QUARANTINED",
    });
    await restarted.replaceQuarantinedMemories({
      individualId: "iris",
      entries: [replacement],
    });
    expect(await new FileMemoryStore(memoriesDir).recall({
      individualId: "iris",
      limit: 10,
    })).toEqual([replacement]);
    expect(await fs.readdir(quarantineDir)).not.toContain("iris.blocked.json");
  });

  it("fails closed when legacy memory quarantine discovery exceeds its bounded scan", async () => {
    const memoriesDir = path.join(TEST_DIR, "bounded-memory-quarantine");
    const quarantineDir = path.join(memoriesDir, ".quarantine");
    await fs.mkdir(quarantineDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(quarantineDir, "unrelated-a.corrupt"), "damaged"),
      fs.writeFile(path.join(quarantineDir, "unrelated-b.corrupt"), "damaged"),
    ]);
    const store = new FileMemoryStore(memoriesDir, {
      maxQuarantineEntriesToScan: 1,
    });

    await expect(
      store.recall({ individualId: "iris", limit: 10 }),
    ).rejects.toBeInstanceOf(IdentityQuarantinedError);
  });

  it("quarantines malformed snapshots instead of treating identity damage as absence", async () => {
    const snapshotsDir = path.join(TEST_DIR, "snapshots");
    await fs.mkdir(snapshotsDir, { recursive: true });
    await fs.writeFile(path.join(snapshotsDir, "iris.json"), '{"manifest":', "utf8");
    const repo = new FileIndividualRepository(snapshotsDir, { now: () => 42 });

    const failure = await repo.load("iris").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(IdentityQuarantinedError);
    expect((failure as Error).message).not.toContain(snapshotsDir);
    expect((failure as Error & { cause?: unknown }).cause).toBeUndefined();
    const quarantined = await fs.readdir(path.join(snapshotsDir, ".quarantine"));
    expect(quarantined.filter((name) => name.endsWith(".corrupt"))).toHaveLength(1);
    expect(quarantined).toContain("iris.blocked.json");
    const marker = JSON.parse(await fs.readFile(
      path.join(snapshotsDir, ".quarantine", "iris.blocked.json"),
      "utf8",
    )) as Record<string, unknown>;
    expect(marker).toEqual({
      schemaVersion: 1,
      individualId: "iris",
      blockedAtEpochMs: 42,
      reason: "snapshot_invalid",
    });
    expect(JSON.stringify(marker)).not.toContain(snapshotsDir);

    const restarted = new FileIndividualRepository(snapshotsDir);
    await expect(restarted.load("iris")).rejects.toMatchObject({
      code: "PERSISTENCE_QUARANTINED",
    });
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    await expect(restarted.save({
      manifest,
      state: createInitialState(manifest, "2026-01-01T00:00:00Z"),
    })).rejects.toMatchObject({ code: "PERSISTENCE_QUARANTINED" });
  });

  it("materializes a durable block for a pre-marker quarantine artifact", async () => {
    const snapshotsDir = path.join(TEST_DIR, "legacy-quarantine-snapshots");
    const quarantineDir = path.join(snapshotsDir, ".quarantine");
    await fs.mkdir(quarantineDir, { recursive: true });
    await fs.writeFile(
      path.join(quarantineDir, "iris.json.1700000000000.legacy.corrupt"),
      '{"manifest":',
      "utf8",
    );

    const repo = new FileIndividualRepository(snapshotsDir, { now: () => 46 });
    await expect(repo.load("iris")).rejects.toMatchObject({
      code: "PERSISTENCE_QUARANTINED",
      individualId: "iris",
    });
    const markerPath = path.join(quarantineDir, "iris.blocked.json");
    expect(JSON.parse(await fs.readFile(markerPath, "utf8"))).toEqual({
      schemaVersion: 1,
      individualId: "iris",
      blockedAtEpochMs: 46,
      reason: "legacy_quarantine_artifact",
    });

    const installed = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const restarted = new FileIndividualRepository(snapshotsDir);
    await expect(restarted.load("iris")).rejects.toMatchObject({
      code: "PERSISTENCE_QUARANTINED",
    });
    await expect(restarted.save({
      manifest: installed,
      state: createInitialState(installed, "2026-01-01T00:00:00Z"),
    })).rejects.toMatchObject({ code: "PERSISTENCE_QUARANTINED" });
  });

  it("fails closed when legacy quarantine discovery exceeds its bounded scan", async () => {
    const snapshotsDir = path.join(TEST_DIR, "bounded-legacy-quarantine-snapshots");
    const quarantineDir = path.join(snapshotsDir, ".quarantine");
    await fs.mkdir(quarantineDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(quarantineDir, "unrelated-a.corrupt"), "damaged"),
      fs.writeFile(path.join(quarantineDir, "unrelated-b.corrupt"), "damaged"),
    ]);

    const repository = new FileIndividualRepository(snapshotsDir, {
      maxQuarantineEntriesToScan: 1,
    });

    await expect(repository.load("iris")).rejects.toBeInstanceOf(
      IdentityQuarantinedError,
    );
  });

  it("quarantines state authored by a different installed identity manifest", async () => {
    const snapshotsDir = path.join(TEST_DIR, "snapshots");
    const persistedManifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const repo = new FileIndividualRepository(snapshotsDir, { now: () => 43 });
    await repo.save({
      manifest: persistedManifest,
      state: createInitialState(persistedManifest, "2026-01-01T00:00:00Z"),
    });
    const installedManifest = {
      ...persistedManifest,
      identity: {
        ...persistedManifest.identity,
        idealPhysicalForm: {
          ...persistedManifest.identity.idealPhysicalForm,
          surface: "A materially different installed physical surface.",
        },
      },
    };

    await expect(
      repo.load("iris", undefined, installedManifest),
    ).rejects.toBeInstanceOf(IdentityQuarantinedError);
    const quarantined = await fs.readdir(path.join(snapshotsDir, ".quarantine"));
    expect(quarantined.filter((name) => name.endsWith(".corrupt"))).toHaveLength(1);
    expect(quarantined).toContain("iris.blocked.json");
    await expect(
      new FileIndividualRepository(snapshotsDir).load("iris", undefined, installedManifest),
    ).rejects.toMatchObject({ code: "PERSISTENCE_QUARANTINED" });
  });

  it("clears a quarantine block only through validated administrative replacement", async () => {
    const snapshotsDir = path.join(TEST_DIR, "snapshots");
    await fs.mkdir(snapshotsDir, { recursive: true });
    await fs.writeFile(path.join(snapshotsDir, "iris.json"), '{"manifest":', "utf8");
    const repo = new FileIndividualRepository(snapshotsDir, { now: () => 44 });
    await expect(repo.load("iris")).rejects.toMatchObject({
      code: "PERSISTENCE_QUARANTINED",
    });

    const installed = createTemplateManifest({ id: "iris", displayName: "Installed Iris" });
    const incompatible = createTemplateManifest({ id: "iris", displayName: "Previous Iris" });
    await expect(repo.replaceQuarantinedSnapshot({
      individualId: "iris",
      snapshot: {
        manifest: incompatible,
        state: createInitialState(incompatible, "2026-01-01T00:00:00Z"),
      },
      installedManifest: installed,
    })).rejects.toMatchObject({ code: "INCOMPATIBLE_IDENTITY_STATE" });
    await expect(repo.load("iris")).rejects.toMatchObject({
      code: "PERSISTENCE_QUARANTINED",
    });

    await repo.replaceQuarantinedSnapshot({
      individualId: "iris",
      snapshot: {
        manifest: installed,
        state: createInitialState(installed, "2026-01-01T00:00:00Z"),
      },
      installedManifest: installed,
    });
    const restarted = new FileIndividualRepository(snapshotsDir);
    expect((await restarted.load("iris", undefined, installed))?.manifest.displayName).toBe(
      "Installed Iris",
    );
    expect(await fs.readdir(path.join(snapshotsDir, ".quarantine"))).not.toContain(
      "iris.blocked.json",
    );
  });

  it("recovers a backup only through exact-manifest administrative replacement", async () => {
    const snapshotsDir = path.join(TEST_DIR, "backup-recovery-snapshots");
    const installed = createTemplateManifest({ id: "iris", displayName: "Installed Iris" });
    const repository = new FileIndividualRepository(snapshotsDir, {
      backupCount: 1,
      now: () => 47,
    });
    const initial = createInitialState(installed, "2026-01-01T00:00:00Z");
    await repository.save({ manifest: installed, state: initial });
    await repository.save({
      manifest: installed,
      state: { ...initial, cycle: 1, updatedAt: "2026-01-01T00:00:01Z" },
    });
    await fs.writeFile(path.join(snapshotsDir, "iris.json"), '{"manifest":', "utf8");
    await expect(repository.load("iris")).rejects.toMatchObject({
      code: "PERSISTENCE_QUARANTINED",
    });

    const incompatible = createTemplateManifest({ id: "iris", displayName: "Another Iris" });
    await expect(repository.recoverFromBackup({
      individualId: "iris",
      installedManifest: incompatible,
    })).rejects.toMatchObject({ code: "INCOMPATIBLE_IDENTITY_STATE" });
    await expect(repository.load("iris")).rejects.toMatchObject({
      code: "PERSISTENCE_QUARANTINED",
    });

    const recovered = await repository.recoverFromBackup({
      individualId: "iris",
      installedManifest: installed,
    });
    expect(recovered.state.cycle).toBe(0);
    expect((await repository.load("iris", undefined, installed))?.state.cycle).toBe(0);
    expect(await fs.readdir(path.join(snapshotsDir, ".quarantine"))).not.toContain(
      "iris.blocked.json",
    );
  });

  it("keeps a restarted runtime blocked after manifest-incompatible state is quarantined", async () => {
    const dataDir = path.join(TEST_DIR, "runtime-restart");
    const snapshotsDir = path.join(dataDir, "snapshots");
    const persisted = createTemplateManifest({ id: "iris", displayName: "Previous Iris" });
    const installed = createTemplateManifest({ id: "iris", displayName: "Installed Iris" });
    await new FileIndividualRepository(snapshotsDir, { now: () => 45 }).save({
      manifest: persisted,
      state: createInitialState(persisted, "2026-01-01T00:00:00Z"),
    });

    const firstRuntime = new SocietyRuntime({ manifests: [installed], dataDir });
    await expect(firstRuntime.start()).rejects.toMatchObject({
      code: "PERSISTENCE_QUARANTINED",
      individualId: "iris",
    });
    const restartedRuntime = new SocietyRuntime({ manifests: [installed], dataDir });
    await expect(restartedRuntime.start()).rejects.toMatchObject({
      code: "PERSISTENCE_QUARANTINED",
      individualId: "iris",
    });
    expect(await fs.readdir(path.join(snapshotsDir, ".quarantine"))).toContain(
      "iris.blocked.json",
    );
  });

  it("commits snapshot and memory through the recoverable cycle boundary", async () => {
    const persistence = new JournaledCyclePersistence(TEST_DIR);
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const memoryEntry: MemoryEntry = {
      id: "iris--0--reflection",
      individualId: "iris",
      cycle: 0,
      kind: "reflection",
      content: "A first durable thought.",
      createdAt: "2026-01-01T00:00:00Z",
      relatedIndividualIds: [],
    };
    await persistence.commit({ snapshot: { manifest, state }, memories: [memoryEntry] });

    const restarted = new JournaledCyclePersistence(TEST_DIR);
    expect((await restarted.load("iris"))?.state.cycle).toBe(0);
    expect(await restarted.recall({ individualId: "iris", limit: 10 })).toEqual([memoryEntry]);
  });

  it("exposes memory recovery through the production journaled adapter", async () => {
    const memoriesDir = path.join(TEST_DIR, "memories");
    await fs.mkdir(memoriesDir, { recursive: true });
    await fs.writeFile(path.join(memoriesDir, "iris.json"), "not-json", "utf8");
    const persistence = new JournaledCyclePersistence(TEST_DIR);
    await expect(
      persistence.recall({ individualId: "iris", limit: 10 }),
    ).rejects.toMatchObject({ code: "PERSISTENCE_QUARANTINED" });

    const recovered: MemoryEntry = {
      id: "iris--3--reviewed",
      individualId: "iris",
      cycle: 3,
      kind: "reflection",
      content: "Reviewed recovery through the production adapter.",
      createdAt: "2026-01-01T03:00:00Z",
      relatedIndividualIds: [],
    };
    await persistence.replaceQuarantinedMemories({
      individualId: "iris",
      entries: [recovered],
    });
    expect(await persistence.recall({ individualId: "iris", limit: 10 })).toEqual([
      recovered,
    ]);
  });

  it("refuses to open a durable transaction after its cycle fence is aborted", async () => {
    const persistence = new JournaledCyclePersistence(TEST_DIR);
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const controller = new AbortController();
    controller.abort(new Error("expired cycle fence"));
    await expect(persistence.commit({
      snapshot: { manifest, state },
      memories: [{
        id: "iris--0--aborted",
        individualId: "iris",
        cycle: 0,
        kind: "reflection",
        content: "This must never become durable.",
        createdAt: "2026-01-01T00:00:00Z",
        relatedIndividualIds: [],
      }],
      signal: controller.signal,
    })).rejects.toThrow(/expired cycle fence/);
    expect(await persistence.load("iris")).toBeUndefined();
    expect(await persistence.recall({ individualId: "iris", limit: 10 })).toEqual([]);
  });

  it("bounds active memory and creates collision-free rotated archives at the same clock tick", async () => {
    const memoriesDir = path.join(TEST_DIR, "memories");
    const store = new FileMemoryStore(memoriesDir, {
      now: () => 100,
      retention: {
        maxEntriesPerIndividual: 2,
        maxBytesPerIndividual: 100_000,
        maxArchiveFilesPerIndividual: 8,
      },
    });
    for (let cycle = 1; cycle <= 5; cycle += 1) {
      await store.remember([{
        id: `m-${cycle}`,
        individualId: "iris",
        cycle,
        kind: "reflection",
        content: `cycle ${cycle}`,
        createdAt: `2026-01-01T00:00:0${cycle}Z`,
        relatedIndividualIds: [],
      }]);
    }
    expect(await store.recall({ individualId: "iris", limit: 10 })).toHaveLength(2);
    const archives = await fs.readdir(path.join(memoriesDir, "archives", "iris"));
    expect(archives).toHaveLength(3);
    expect(new Set(archives).size).toBe(3);
  });

  it("rejects unknown persisted fields and non-finite embodied geometry", async () => {
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const unknown = structuredClone({ manifest, state }) as unknown as {
      state: Record<string, unknown>;
    };
    unknown.state.unexpectedPrivateState = "must not survive";
    expect(() => validateIndividualSnapshot(unknown)).toThrow(/unsupported field/);

    const nonFinite = structuredClone({ manifest, state }) as unknown as {
      state: { selfConcept: { physicalSelf: { bodyBelief: Record<string, number> } } };
    };
    nonFinite.state.selfConcept.physicalSelf.bodyBelief.torsoWidth = Number.POSITIVE_INFINITY;
    expect(() => validateIndividualSnapshot(nonFinite)).toThrow(/finite number/);
  });

  it("bounds persisted self-portrait history to the engine retention window", () => {
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const portrait = (cycle: number) => ({
      id: `iris--${cycle}--self`,
      cycle,
      artistId: "iris",
      subjectId: "iris",
      role: "self" as const,
      createdAt: `2026-01-01T00:00:${String(cycle).padStart(2, "0")}Z`,
      artwork: { format: "svg" as const, width: 100, height: 100, content: "<svg></svg>" },
      sourcePortraitIds: [] as string[],
    });
    const snapshot = {
      manifest,
      state: {
        ...state,
        cycle: 10,
        currentSelfPortrait: portrait(10),
        selfPortraitHistory: Array.from({ length: 9 }, (_, index) => portrait(index + 1)),
      },
    };
    expect(() => validateIndividualSnapshot(snapshot)).toThrow(/at most 8/);
  });

  it.each([
    [
      "consensus",
      (snapshot: IndividualSnapshot) => {
        const social = snapshot.state.latestSocialPortrait!;
        const evidence = social.socialEvidence!;
        const consensus = {
          ...evidence.consensus,
          figure: {
            ...evidence.consensus.figure,
            shoulderWidth: evidence.consensus.figure.shoulderWidth + 0.01,
          },
        };
        return replaceSocial(snapshot, {
          ...social,
          descriptor: consensus,
          socialEvidence: { ...evidence, consensus },
        });
      },
    ],
    [
      "comparison delta",
      (snapshot: IndividualSnapshot) => {
        const social = snapshot.state.latestSocialPortrait!;
        const evidence = social.socialEvidence!;
        const [first, ...rest] = evidence.comparisonToSelf;
        return replaceSocial(snapshot, {
          ...social,
          socialEvidence: {
            ...evidence,
            comparisonToSelf: [{ ...first, delta: first.delta + 0.01 }, ...rest],
          },
        });
      },
    ],
    [
      "confidence",
      (snapshot: IndividualSnapshot) => {
        const social = snapshot.state.latestSocialPortrait!;
        return replaceSocial(snapshot, {
          ...social,
          socialEvidence: {
            ...social.socialEvidence!,
            confidence: social.socialEvidence!.confidence + 0.01,
          },
        });
      },
    ],
    [
      "descriptor",
      (snapshot: IndividualSnapshot) => {
        const social = snapshot.state.latestSocialPortrait!;
        return replaceSocial(snapshot, {
          ...social,
          descriptor: {
            ...social.descriptor!,
            confidence: social.descriptor!.confidence + 0.01,
          },
        });
      },
    ],
    [
      "source IDs",
      (snapshot: IndividualSnapshot) => {
        const social = snapshot.state.latestSocialPortrait!;
        return replaceSocial(snapshot, {
          ...social,
          sourcePortraitIds: [...social.sourcePortraitIds, "invented-peer-portrait"],
        });
      },
    ],
    [
      "nested perception source",
      (snapshot: IndividualSnapshot) => {
        const social = snapshot.state.latestSocialPortrait!;
        const evidence = social.socialEvidence!;
        const [first, ...rest] = evidence.contributions;
        const perception = first.perceptionEvidence!;
        const contribution = {
          ...first,
          perceptionEvidence: {
            ...perception,
            source: {
              ...perception.source,
              figure: {
                ...perception.source.figure,
                torsoWidth: perception.source.figure.torsoWidth + 0.01,
              },
            },
          },
        };
        return replaceSocial(snapshot, {
          ...social,
          socialEvidence: {
            ...evidence,
            contributions: [contribution, ...rest],
          },
        });
      },
    ],
  ] as const)("quarantines persisted social evidence with fabricated %s", async (_label, mutate) => {
    const snapshotsDir = path.join(TEST_DIR, "snapshots");
    await fs.mkdir(snapshotsDir, { recursive: true });
    await fs.writeFile(
      path.join(snapshotsDir, "iris.json"),
      JSON.stringify(mutate(socialSnapshot())),
      "utf8",
    );
    const repo = new FileIndividualRepository(snapshotsDir, { now: () => 99 });

    await expect(repo.load("iris")).rejects.toBeInstanceOf(IdentityQuarantinedError);
    const quarantined = await fs.readdir(path.join(snapshotsDir, ".quarantine"));
    expect(quarantined.filter((name) => name.endsWith(".corrupt"))).toHaveLength(1);
    expect(quarantined).toContain("iris.blocked.json");
  });

  it("validates a retained social cohort against the exact peer portrait provenance", () => {
    const valid = socialSnapshot();
    expect(() => validateIndividualSnapshot(valid)).not.toThrow();

    const [peer] = valid.state.latestSocialPeerPortraits!;
    const wrongSource: IndividualSnapshot = {
      ...valid,
      state: {
        ...valid.state,
        latestSocialPeerPortraits: [{
          ...peer,
          sourcePortraitIds: [valid.state.currentSelfPortrait!.id],
        }],
      },
    };
    expect(() => validateIndividualSnapshot(wrongSource)).toThrow(
      /social peer portrait provenance/,
    );

    const alteredDrawing: IndividualSnapshot = {
      ...valid,
      state: {
        ...valid.state,
        latestSocialPeerPortraits: [{
          ...peer,
          descriptor: {
            ...peer.descriptor!,
            confidence: peer.descriptor!.confidence - 0.01,
          },
        }],
      },
    };
    expect(() => validateIndividualSnapshot(alteredDrawing)).toThrow(
      /non-canonical social claims/,
    );
  });

  it("continues to validate legacy social snapshots that predate retained source artwork", () => {
    const snapshot = socialSnapshot();
    const { latestSocialPeerPortraits: _legacyOmission, ...legacyState } = snapshot.state;
    expect(_legacyOmission).toHaveLength(1);
    expect(() => validateIndividualSnapshot({ ...snapshot, state: legacyState })).not.toThrow();
  });
});
