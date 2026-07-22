import { constants as fsConstants } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { assertPersistedManifestCompatible } from "../core/manifestCompatibility";
import type { IndividualSnapshot, MemoryEntry, Portrait } from "../core/model";
import { identityPackages } from "../identity-packages";
import { IdentityQuarantinedError } from "../memory/errors";
import { FileMemoryStore } from "../memory/fileMemoryStore";
import { assertPersistenceKey } from "../memory/fileSafety";
import { validateIndividualSnapshot } from "../memory/validation";
import { validatePublicSvg } from "../security/publicSvg";
import { TimelineExportError, timelineErrorMessage } from "./errors";
import {
  createValidatedTimelineDocument,
  type ValidatedTimelineDocument,
} from "./validatedTimelineDocument";
import {
  MAX_PRIVATE_MEMORIES_PER_CYCLE,
  MAX_TIMELINE_ARTWORK_BYTES,
  MAX_TIMELINE_INDIVIDUALS,
  MAX_TIMELINE_PEER_PORTRAITS,
  MAX_TIMELINE_SELF_PORTRAITS,
  PRIVATE_MEMORY_EXPORT_ACKNOWLEDGEMENT,
  type TimelineDocument,
  type TimelineIndividual,
  type TimelineLoadOptions,
  type TimelineMemoryGroup,
  type TimelinePortrait,
} from "./timelineTypes";

const MAX_DIRECTORY_ENTRIES = 4_096;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_MEMORY_ENTRIES_TO_RECALL = 10_000;

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error;

export const resolveTimelineDataDir = (candidate?: string): string => {
  const value = candidate ?? process.env.INDIVIDUALS_DATA_DIR ?? ".data/individuals";
  if (value.length === 0 || value.length > 4_096 || value.includes("\u0000")) {
    throw new TimelineExportError(
      "INVALID_ARGUMENT",
      "dataDir must be a non-empty path no longer than 4096 characters.",
    );
  }
  return path.resolve(value);
};

const validateBound = (
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new TimelineExportError(
      "INVALID_ARGUMENT",
      `${field} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return resolved;
};

const readBoundedRegularFile = async (
  filePath: string,
  maxBytes: number,
  label: string,
): Promise<string | undefined> => {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(
      filePath,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new TimelineExportError("INPUT_INVALID", `${label} is not a regular file.`);
    }
    if (stat.size > maxBytes) {
      throw new TimelineExportError(
        "INPUT_BOUNDS",
        `${label} exceeds its ${maxBytes}-byte read limit.`,
      );
    }
    const content = await handle.readFile();
    if (content.byteLength > maxBytes) {
      throw new TimelineExportError(
        "INPUT_BOUNDS",
        `${label} exceeds its ${maxBytes}-byte read limit.`,
      );
    }
    return content.toString("utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    if (error instanceof TimelineExportError) throw error;
    throw new TimelineExportError("INPUT_UNAVAILABLE", `${label} could not be read.`, {
      cause: error,
    });
  } finally {
    await handle?.close();
  }
};

const parseJson = (content: string, label: string): unknown => {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new TimelineExportError("INPUT_INVALID", `${label} is not valid JSON.`, {
      cause: error,
    });
  }
};

const assertNoQuarantineMarker = async (
  dataDir: string,
  category: "snapshots" | "memories",
  individualId: string,
): Promise<void> => {
  const marker = path.join(dataDir, category, ".quarantine", `${individualId}.blocked.json`);
  try {
    await fs.lstat(marker);
    throw new TimelineExportError(
      "INPUT_INVALID",
      `${category === "snapshots" ? "Snapshot" : "Memory"} state for "${individualId}" is quarantined; export is blocked.`,
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return;
    if (error instanceof TimelineExportError) throw error;
    throw new TimelineExportError(
      "INPUT_UNAVAILABLE",
      `Quarantine state for "${individualId}" could not be checked.`,
      { cause: error },
    );
  }
};

const listSnapshotIds = async (dataDir: string): Promise<string[]> => {
  const directoryPath = path.join(dataDir, "snapshots");
  let directory: Awaited<ReturnType<typeof fs.opendir>>;
  try {
    directory = await fs.opendir(directoryPath);
  } catch (error) {
    throw new TimelineExportError(
      "INPUT_UNAVAILABLE",
      "The snapshot directory is unavailable; run the society before exporting a timeline.",
      { cause: error },
    );
  }

  const ids: string[] = [];
  let scanned = 0;
  try {
    for await (const entry of directory) {
      scanned += 1;
      if (scanned > MAX_DIRECTORY_ENTRIES) {
        throw new TimelineExportError(
          "INPUT_BOUNDS",
          `The snapshot directory contains more than ${MAX_DIRECTORY_ENTRIES} entries.`,
        );
      }
      if (entry.name.startsWith(".") || !entry.name.endsWith(".json")) continue;
      if (!entry.isFile()) {
        throw new TimelineExportError(
          "INPUT_INVALID",
          `Snapshot candidate "${entry.name}" is not a regular file.`,
        );
      }
      const id = entry.name.slice(0, -".json".length);
      try {
        assertPersistenceKey(id);
      } catch (error) {
        throw new TimelineExportError(
          "INPUT_INVALID",
          `Snapshot filename "${entry.name}" is not a valid Individual identity.`,
          { cause: error },
        );
      }
      ids.push(id);
    }
  } finally {
    await directory.close().catch(() => undefined);
  }
  if (ids.length > MAX_TIMELINE_INDIVIDUALS) {
    throw new TimelineExportError(
      "INPUT_BOUNDS",
      `At most ${MAX_TIMELINE_INDIVIDUALS} active Individuals can be exported.`,
    );
  }
  return ids.sort((left, right) => left.localeCompare(right));
};

const loadSnapshot = async (
  dataDir: string,
  individualId: string,
): Promise<IndividualSnapshot> => {
  const installedManifest = identityPackages.find(
    (manifest) => manifest.id === individualId,
  );
  if (!installedManifest) {
    throw new TimelineExportError(
      "INPUT_INVALID",
      `Snapshot "${individualId}" does not belong to an installed Individual manifest.`,
    );
  }
  await assertNoQuarantineMarker(dataDir, "snapshots", individualId);
  const label = `Snapshot "${individualId}"`;
  const content = await readBoundedRegularFile(
    path.join(dataDir, "snapshots", `${individualId}.json`),
    MAX_SNAPSHOT_BYTES,
    label,
  );
  if (content === undefined) {
    throw new TimelineExportError("INPUT_UNAVAILABLE", `${label} does not exist.`);
  }
  try {
    const snapshot = validateIndividualSnapshot(parseJson(content, label));
    if (
      snapshot.manifest.id !== individualId ||
      snapshot.state.individualId !== individualId
    ) {
      throw new Error("Identity does not match the snapshot filename.");
    }
    assertPersistedManifestCompatible(installedManifest, snapshot.manifest);
    return snapshot;
  } catch (error) {
    if (error instanceof TimelineExportError) throw error;
    throw new TimelineExportError(
      "INPUT_INVALID",
      `${label} failed validation: ${timelineErrorMessage(error)}`,
      { cause: error },
    );
  }
};

const loadPrivateMemories = async (
  dataDir: string,
  individualId: string,
): Promise<MemoryEntry[]> => {
  const label = `Private memory "${individualId}"`;
  try {
    const store = new FileMemoryStore(path.join(dataDir, "memories"));
    return [...await store.recall({
      individualId,
      limit: MAX_MEMORY_ENTRIES_TO_RECALL,
    })];
  } catch (error) {
    if (error instanceof TimelineExportError) throw error;
    if (error instanceof IdentityQuarantinedError) {
      throw new TimelineExportError(
        "INPUT_INVALID",
        `${label} is quarantined; export is blocked.`,
        { cause: error },
      );
    }
    throw new TimelineExportError(
      "INPUT_UNAVAILABLE",
      `${label} could not be loaded through the runtime persistence boundary: ${timelineErrorMessage(error)}`,
      { cause: error },
    );
  }
};

const selectSnapshotIds = (
  availableIds: readonly string[],
  requestedIds: readonly string[] | undefined,
): string[] => {
  if (!requestedIds || requestedIds.length === 0) {
    if (availableIds.length === 0) {
      throw new TimelineExportError("INPUT_UNAVAILABLE", "No active Individual snapshots were found.");
    }
    return [...availableIds];
  }
  if (requestedIds.length > MAX_TIMELINE_INDIVIDUALS) {
    throw new TimelineExportError(
      "INVALID_ARGUMENT",
      `At most ${MAX_TIMELINE_INDIVIDUALS} Individuals may be selected.`,
    );
  }
  const unique = new Set<string>();
  for (const id of requestedIds) {
    try {
      assertPersistenceKey(id);
    } catch (error) {
      throw new TimelineExportError("INVALID_ARGUMENT", `Individual ID "${id}" is invalid.`, {
        cause: error,
      });
    }
    if (unique.has(id)) {
      throw new TimelineExportError("INVALID_ARGUMENT", `Individual ID "${id}" was selected twice.`);
    }
    if (!availableIds.includes(id)) {
      throw new TimelineExportError("INPUT_UNAVAILABLE", `Snapshot "${id}" does not exist.`);
    }
    unique.add(id);
  }
  return [...unique].sort((left, right) => left.localeCompare(right));
};

interface ArtworkBudget {
  bytes: number;
}

const portraitView = (portrait: Portrait, budget: ArtworkBudget): TimelinePortrait => {
  if (portrait.artwork.format !== "svg") {
    throw new TimelineExportError(
      "ARTWORK_UNSUPPORTED",
      `Portrait "${portrait.id}" uses unsupported artwork format "${portrait.artwork.format}".`,
    );
  }
  let svg;
  try {
    svg = validatePublicSvg(portrait.artwork.content);
  } catch (error) {
    throw new TimelineExportError(
      "ARTWORK_INVALID",
      `Portrait "${portrait.id}" is not safe public SVG: ${timelineErrorMessage(error)}`,
      { cause: error },
    );
  }
  budget.bytes += Buffer.byteLength(svg, "utf8");
  if (budget.bytes > MAX_TIMELINE_ARTWORK_BYTES) {
    throw new TimelineExportError(
      "INPUT_BOUNDS",
      `Selected portrait artwork exceeds the ${MAX_TIMELINE_ARTWORK_BYTES}-byte timeline budget.`,
    );
  }
  return {
    id: portrait.id,
    role: portrait.role,
    cycle: portrait.cycle,
    artistId: portrait.artistId,
    subjectId: portrait.subjectId,
    createdAt: portrait.createdAt,
    width: portrait.artwork.width,
    height: portrait.artwork.height,
    svg,
  };
};

const groupPrivateMemories = (
  entries: readonly MemoryEntry[],
  visibleCycles: ReadonlySet<number>,
): TimelineMemoryGroup[] => {
  const groups = new Map<number, MemoryEntry[]>();
  for (const entry of entries) {
    if (!visibleCycles.has(entry.cycle)) continue;
    const group = groups.get(entry.cycle) ?? [];
    group.push(entry);
    groups.set(entry.cycle, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([cycle, group]) => {
      const ordered = group.slice().sort(
        (left, right) =>
          Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
          left.id.localeCompare(right.id),
      );
      const entriesForExport = ordered.slice(-MAX_PRIVATE_MEMORIES_PER_CYCLE);
      return {
        cycle,
        entries: entriesForExport,
        omittedCount: ordered.length - entriesForExport.length,
      };
    });
};

const individualView = async (
  snapshot: IndividualSnapshot,
  dataDir: string,
  maxSelfPortraits: number,
  maxPeerPortraits: number,
  includePrivateMemory: boolean,
  budget: ArtworkBudget,
): Promise<TimelineIndividual> => {
  const allSelfPortraits = [
    ...(snapshot.state.selfPortraitHistory ?? []),
    ...(snapshot.state.currentSelfPortrait ? [snapshot.state.currentSelfPortrait] : []),
  ].sort(
    (left, right) =>
      left.cycle - right.cycle ||
      Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
  const retainedSelfPortraits = allSelfPortraits.slice(-maxSelfPortraits);
  const selfPortraits = retainedSelfPortraits.map((portrait) => portraitView(portrait, budget));

  const socialPortrait = snapshot.state.latestSocialPortrait
    ? portraitView(snapshot.state.latestSocialPortrait, budget)
    : undefined;
  const allPeers = snapshot.state.latestSocialPeerPortraits ?? [];
  const retainedPeers = allPeers.slice(0, maxPeerPortraits);
  const peerPortraits = retainedPeers.map((portrait) => portraitView(portrait, budget));

  let privateMemoryGroups: TimelineMemoryGroup[] | undefined;
  if (includePrivateMemory) {
    const visibleCycles = new Set(selfPortraits.map((portrait) => portrait.cycle));
    privateMemoryGroups = groupPrivateMemories(
      await loadPrivateMemories(dataDir, snapshot.manifest.id),
      visibleCycles,
    );
  }

  return {
    id: snapshot.manifest.id,
    displayName: snapshot.manifest.displayName,
    cycle: snapshot.state.cycle,
    updatedAt: snapshot.state.updatedAt,
    selfPortraits,
    omittedSelfPortraitCount: allSelfPortraits.length - retainedSelfPortraits.length,
    socialPortrait,
    peerPortraits,
    omittedPeerPortraitCount: allPeers.length - retainedPeers.length,
    privateMemoryGroups,
  };
};

export const loadTimelineDocument = async (
  options: TimelineLoadOptions = {},
): Promise<ValidatedTimelineDocument> => {
  const dataDir = resolveTimelineDataDir(options.dataDir);
  const maxSelfPortraits = validateBound(
    options.maxSelfPortraits,
    MAX_TIMELINE_SELF_PORTRAITS,
    1,
    MAX_TIMELINE_SELF_PORTRAITS,
    "maxSelfPortraits",
  );
  const maxPeerPortraits = validateBound(
    options.maxPeerPortraits,
    MAX_TIMELINE_PEER_PORTRAITS,
    0,
    MAX_TIMELINE_PEER_PORTRAITS,
    "maxPeerPortraits",
  );
  const includePrivateMemory = options.privateMemoryAcknowledgement !== undefined;
  if (
    includePrivateMemory &&
    options.privateMemoryAcknowledgement !== PRIVATE_MEMORY_EXPORT_ACKNOWLEDGEMENT
  ) {
    throw new TimelineExportError(
      "INVALID_ARGUMENT",
      `Private memory export requires the exact acknowledgement: ${PRIVATE_MEMORY_EXPORT_ACKNOWLEDGEMENT}`,
    );
  }
  const generatedDate = (options.now ?? (() => new Date()))();
  if (!(generatedDate instanceof Date) || !Number.isFinite(generatedDate.getTime())) {
    throw new TimelineExportError("INVALID_ARGUMENT", "Timeline generation clock returned an invalid date.");
  }
  const generatedAt = generatedDate.toISOString();
  const availableIds = await listSnapshotIds(dataDir);
  const ids = selectSnapshotIds(availableIds, options.individualIds);
  const budget: ArtworkBudget = { bytes: 0 };
  const individuals: TimelineIndividual[] = [];
  for (const id of ids) {
    individuals.push(await individualView(
      await loadSnapshot(dataDir, id),
      dataDir,
      maxSelfPortraits,
      maxPeerPortraits,
      includePrivateMemory,
      budget,
    ));
  }
  const document: TimelineDocument = {
    generatedAt,
    sourceKind: "validated-retained-snapshots",
    includesPrivateMemory: includePrivateMemory,
    individuals,
  };
  return createValidatedTimelineDocument(document);
};
