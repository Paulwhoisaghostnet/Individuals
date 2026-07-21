import { createDefaultTuning } from "../perception";
import type { ExhibitionIndividual } from "../types";
import {
  SOCIETY_API_VERSION,
  type PublicArtworkReference,
  type PublicEmbodiment,
  type PublicIndividualRuntime,
  type PublicPeerArtwork,
  type PublicSocietySnapshot,
  type RuntimeConfig,
  type SocietyControlResponse,
  type SocietyHeartbeat,
} from "./types";

const DEFAULT_CONFIG: RuntimeConfig = {
  apiBasePath: "/api/v1",
  mode: "auto",
  localFallbackAfterMs: 3_000,
  pollIntervalMs: 8_000,
};

// One Individual can observe at most 16 peer canvases per causal cycle.
// A local society therefore contains at most 17 members; larger networks are
// composed as distinct sites rather than silently overloading one cycle.
const MAX_INDIVIDUALS = 17;
const MAX_TUNING_KEYS = 64;
const ARTWORK_ID_PATTERN = /^[0-9a-f]{40}$/;
const REVISION_PATTERN = /^(0|[1-9][0-9]{0,15})$/;
const PUBLIC_TEXT_CONTROLS = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertAllowedKeys = (
  record: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
): void => {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(record).find((key) => !allowedSet.has(key));
  if (unexpected) throw new RuntimePayloadError(`${context} contains unexpected field ${unexpected}`);
};

const readString = (
  record: Record<string, unknown>,
  key: string,
  { max = 2_000, optional = false }: { readonly max?: number; readonly optional?: boolean } = {},
): string | undefined => {
  const value = record[key];
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string") throw new RuntimePayloadError(`${key} must be a string`);
  const normalized = value.replace(PUBLIC_TEXT_CONTROLS, " ").trim();
  if (normalized.length === 0 || normalized.length > max) {
    throw new RuntimePayloadError(`${key} must contain between 1 and ${max} characters`);
  }
  return normalized;
};

const readBoolean = (record: Record<string, unknown>, key: string): boolean => {
  const value = record[key];
  if (typeof value !== "boolean") throw new RuntimePayloadError(`${key} must be a boolean`);
  return value;
};

const readNumber = (
  record: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  integer = false,
): number => {
  const value = record[key];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new RuntimePayloadError(`${key} must be a valid number`);
  }
  return value;
};

const readIsoDate = (
  record: Record<string, unknown>,
  key: string,
  optional = false,
): string | undefined => {
  const value = readString(record, key, { max: 64, optional });
  if (value === undefined) return undefined;
  const parsed = Date.parse(value);
  const normalized = value.replace(
    /(?:\.(\d{1,3}))?Z$/,
    (_match, fraction: string | undefined) => `.${(fraction ?? "").padEnd(3, "0")}Z`,
  );
  if (
    !ISO_TIMESTAMP_PATTERN.test(value) ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString() !== normalized
  ) {
    throw new RuntimePayloadError(`${key} must be a canonical UTC timestamp`);
  }
  return value;
};

const readRevision = (record: Record<string, unknown>, key = "revision"): string => {
  const revision = readString(record, key, { max: 16 })!;
  const numeric = Number(revision);
  if (!REVISION_PATTERN.test(revision) || !Number.isSafeInteger(numeric)) {
    throw new RuntimePayloadError(`${key} must be a canonical non-negative integer`);
  }
  return revision;
};

const isSameOriginPath = (value: string): boolean =>
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\") &&
  !value.includes("#") &&
  !/[\u0000-\u0020]/.test(value);

export class RuntimePayloadError extends Error {
  constructor(message: string) {
    super(`Invalid society runtime payload: ${message}`);
    this.name = "RuntimePayloadError";
  }
}

const parseArtwork = (candidate: unknown): PublicArtworkReference => {
  if (!isRecord(candidate)) throw new RuntimePayloadError("portrait must be an object");
  assertAllowedKeys(candidate, ["id", "cycle", "format", "url", "width", "height", "createdAt"], "portrait");
  const format = readString(candidate, "format", { max: 32 });
  if (format !== "svg") {
    throw new RuntimePayloadError("portrait format is unsupported");
  }
  const id = readString(candidate, "id", { max: 40 })!;
  if (!ARTWORK_ID_PATTERN.test(id)) {
    throw new RuntimePayloadError("portrait id must be a 40-character lowercase digest");
  }
  const url = readString(candidate, "url", { max: 128 });
  if (url !== `/api/v1/portraits/${id}.svg`) {
    throw new RuntimePayloadError("portrait url must match its canonical public artifact route");
  }

  return {
    id,
    cycle: readNumber(candidate, "cycle", 0, 10_000_000, true),
    format,
    url,
    width: readNumber(candidate, "width", 1, 16_384, true),
    height: readNumber(candidate, "height", 1, 16_384, true),
    createdAt: readIsoDate(candidate, "createdAt")!,
  };
};

const parsePortraits = (
  candidate: unknown,
): PublicIndividualRuntime["portraits"] => {
  if (!isRecord(candidate)) throw new RuntimePayloadError("portraits must be an object");
  assertAllowedKeys(candidate, ["self", "social", "peers"], "portraits");
  if (!Array.isArray(candidate.peers) || candidate.peers.length > MAX_INDIVIDUALS - 1) {
    throw new RuntimePayloadError("portraits.peers must be a bounded array");
  }
  const peers: PublicPeerArtwork[] = candidate.peers.map((entry) => {
    if (!isRecord(entry)) throw new RuntimePayloadError("peer portrait must be an object");
    assertAllowedKeys(entry, ["artistId", "artwork"], "peer portrait");
    return {
      artistId: readString(entry, "artistId", { max: 80 })!,
      artwork: parseArtwork(entry.artwork),
    };
  });
  if (new Set(peers.map(({ artistId }) => artistId)).size !== peers.length) {
    throw new RuntimePayloadError("peer portrait artist ids must be unique");
  }
  return {
    ...(candidate.self === undefined ? {} : { self: parseArtwork(candidate.self) }),
    ...(candidate.social === undefined ? {} : { social: parseArtwork(candidate.social) }),
    peers,
  };
};

const parseStringList = (candidate: unknown, key: string, maximum: number): readonly string[] => {
  if (!Array.isArray(candidate) || candidate.length > maximum) {
    throw new RuntimePayloadError(`${key} must be a bounded array`);
  }
  return candidate.map((value) => {
    if (typeof value !== "string") throw new RuntimePayloadError(`${key} entries must be strings`);
    const normalized = value.trim();
    if (!normalized || normalized.length > 240) {
      throw new RuntimePayloadError(`${key} entries must contain between 1 and 240 characters`);
    }
    return normalized;
  });
};

const parseEmbodiment = (candidate: unknown): PublicEmbodiment => {
  if (!isRecord(candidate)) throw new RuntimePayloadError("embodiment must be an object");
  assertAllowedKeys(
    candidate,
    ["description", "similarity", "perceivedDifferences", "nextBodilyAdjustment"],
    "embodiment",
  );
  return {
    description: readString(candidate, "description", { max: 2_000 })!,
    similarity: readNumber(candidate, "similarity", 0, 1),
    perceivedDifferences: parseStringList(candidate.perceivedDifferences, "perceivedDifferences", 16),
    ...(candidate.nextBodilyAdjustment === undefined
      ? {}
      : {
          nextBodilyAdjustment: readString(candidate, "nextBodilyAdjustment", { max: 1_000 })!,
        }),
  };
};

const parseTuning = (candidate: unknown): Readonly<Record<string, number>> => {
  if (!isRecord(candidate)) throw new RuntimePayloadError("perceptionTuning must be an object");
  if (Object.keys(candidate).length > MAX_TUNING_KEYS) {
    throw new RuntimePayloadError(`perceptionTuning must contain at most ${MAX_TUNING_KEYS} controls`);
  }
  const tuning: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const [key, rawValue] of Object.entries(candidate)) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(key)) {
      throw new RuntimePayloadError("perceptionTuning contains an invalid control id");
    }
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || Math.abs(rawValue) > 10_000) {
      throw new RuntimePayloadError(`perceptionTuning.${key} must be finite`);
    }
    tuning[key] = rawValue;
  }
  return tuning;
};

const parseIndividual = (candidate: unknown): PublicIndividualRuntime => {
  if (!isRecord(candidate)) throw new RuntimePayloadError("individual must be an object");
  assertAllowedKeys(
    candidate,
    [
      "id",
      "displayName",
      "cycle",
      "status",
      "isPaused",
      "isRunningCycle",
      "updatedAt",
      "publicReflection",
      "embodiment",
      "perceptionTuning",
      "portraits",
    ],
    "individual",
  );
  const status = readString(candidate, "status", { max: 24 });
  if (
    status !== "idle" &&
    status !== "observing" &&
    status !== "drawing" &&
    status !== "reflecting" &&
    status !== "paused"
  ) {
    throw new RuntimePayloadError("individual status is unsupported");
  }
  const isPaused = readBoolean(candidate, "isPaused");
  const isRunningCycle = readBoolean(candidate, "isRunningCycle");
  if ((status === "paused") !== isPaused) {
    throw new RuntimePayloadError("individual pause fields are inconsistent");
  }

  return {
    id: readString(candidate, "id", { max: 80 })!,
    displayName: readString(candidate, "displayName", { max: 120 })!,
    cycle: readNumber(candidate, "cycle", 0, 10_000_000, true),
    status,
    isPaused,
    isRunningCycle,
    updatedAt: readIsoDate(candidate, "updatedAt")!,
    ...(candidate.publicReflection === undefined
      ? {}
      : { publicReflection: readString(candidate, "publicReflection", { max: 2_000 })! }),
    embodiment: parseEmbodiment(candidate.embodiment),
    perceptionTuning: parseTuning(candidate.perceptionTuning),
    portraits: parsePortraits(candidate.portraits),
  };
};

export const parseSocietySnapshot = (candidate: unknown): PublicSocietySnapshot => {
  if (!isRecord(candidate)) throw new RuntimePayloadError("root must be an object");
  assertAllowedKeys(candidate, ["apiVersion", "revision", "generatedAt", "runtime", "individuals"], "root");
  if (candidate.apiVersion !== SOCIETY_API_VERSION) {
    throw new RuntimePayloadError(`apiVersion must be ${SOCIETY_API_VERSION}`);
  }
  if (!isRecord(candidate.runtime)) throw new RuntimePayloadError("runtime must be an object");
  assertAllowedKeys(candidate.runtime, ["mode", "status", "startedAt"], "runtime");
  if (candidate.runtime.mode !== "live") throw new RuntimePayloadError("runtime.mode must be live");
  const runtimeStatus = readString(candidate.runtime, "status", { max: 24 });
  if (runtimeStatus !== "running" && runtimeStatus !== "paused" && runtimeStatus !== "degraded") {
    throw new RuntimePayloadError("runtime.status is unsupported");
  }
  if (
    !Array.isArray(candidate.individuals) ||
    candidate.individuals.length === 0 ||
    candidate.individuals.length > MAX_INDIVIDUALS
  ) {
    throw new RuntimePayloadError(`individuals must contain between 1 and ${MAX_INDIVIDUALS} entries`);
  }
  const parsedIndividuals = candidate.individuals.map(parseIndividual);
  if (new Set(parsedIndividuals.map(({ id }) => id)).size !== parsedIndividuals.length) {
    throw new RuntimePayloadError("individual ids must be unique");
  }
  const allPaused = parsedIndividuals.every(({ isPaused }) => isPaused);
  if (
    (runtimeStatus === "paused" && !allPaused) ||
    (runtimeStatus === "running" && allPaused)
  ) {
    throw new RuntimePayloadError("runtime status is inconsistent with Individual pause state");
  }
  const generatedAt = readIsoDate(candidate, "generatedAt")!;
  const startedAt = readIsoDate(candidate.runtime, "startedAt")!;
  if (Date.parse(startedAt) > Date.parse(generatedAt)) {
    throw new RuntimePayloadError("runtime.startedAt cannot follow snapshot generatedAt");
  }

  return {
    apiVersion: SOCIETY_API_VERSION,
    revision: readRevision(candidate),
    generatedAt,
    runtime: {
      mode: "live",
      status: runtimeStatus,
      startedAt,
    },
    individuals: parsedIndividuals,
  };
};

/**
 * Validates API tuning against the exact local exhibition identity definitions.
 * Missing controls use manifest defaults; unknown or out-of-bounds controls reject
 * the snapshot instead of silently changing an Individual's configured vision.
 */
export const normalizeSnapshotForExhibition = (
  snapshot: PublicSocietySnapshot,
  people: readonly ExhibitionIndividual[],
): PublicSocietySnapshot => {
  const expectedIds = new Set(people.map(({ id }) => id));
  if (
    snapshot.individuals.length !== expectedIds.size ||
    snapshot.individuals.some(({ id }) => !expectedIds.has(id))
  ) {
    throw new RuntimePayloadError("runtime society membership does not match this exhibition build");
  }
  const runtimeById = new Map(snapshot.individuals.map((individual) => [individual.id, individual]));
  if (runtimeById.size !== snapshot.individuals.length) {
    throw new RuntimePayloadError("runtime society contains duplicate Individual IDs");
  }
  const normalizedById = new Map<string, PublicIndividualRuntime>();

  for (const person of people) {
    const runtime = runtimeById.get(person.id);
    if (!runtime) throw new RuntimePayloadError(`required Individual ${person.id} is missing`);
    if (runtime.displayName !== person.name) {
      throw new RuntimePayloadError(`display name for ${person.id} does not match this exhibition build`);
    }
    const controls = new Map(person.perceptionModel.controls.map((control) => [control.id, control]));
    for (const [controlId, value] of Object.entries(runtime.perceptionTuning)) {
      const control = controls.get(controlId);
      if (!control || value < control.min || value > control.max) {
        throw new RuntimePayloadError(`perception tuning for ${person.id}.${controlId} is invalid`);
      }
    }
    // Self and social portraits are authored by this Individual's current
    // cycle. Peer inputs are authored on each observer's independent cadence,
    // so their cycle numbers must retain that provenance and need not equal
    // the subject's cycle.
    if (
      runtime.portraits.self?.cycle !== undefined &&
      runtime.portraits.self.cycle !== runtime.cycle
    ) {
      throw new RuntimePayloadError(`self portrait cycle for ${person.id} does not match its public state`);
    }
    if (
      runtime.portraits.social?.cycle !== undefined &&
      runtime.portraits.social.cycle !== runtime.cycle
    ) {
      throw new RuntimePayloadError(`social portrait cycle for ${person.id} does not match its public state`);
    }
    if (Boolean(runtime.portraits.social) !== (runtime.portraits.peers.length > 0)) {
      throw new RuntimePayloadError(`social portrait bundle for ${person.id} is incomplete`);
    }
    if (
      runtime.portraits.peers.some(
        ({ artistId }) => artistId === person.id || !expectedIds.has(artistId),
      )
    ) {
      throw new RuntimePayloadError(`peer portrait provenance for ${person.id} is invalid`);
    }
    normalizedById.set(person.id, {
      ...runtime,
      perceptionTuning: {
        ...createDefaultTuning(person.perceptionModel),
        ...runtime.perceptionTuning,
      },
    });
  }

  return {
    ...snapshot,
    individuals: people.map(({ id }) => normalizedById.get(id)!),
  };
};

export const parseHeartbeat = (candidate: unknown): SocietyHeartbeat => {
  if (!isRecord(candidate)) throw new RuntimePayloadError("heartbeat must be an object");
  assertAllowedKeys(candidate, ["revision", "generatedAt", "startedAt"], "heartbeat");
  const generatedAt = readIsoDate(candidate, "generatedAt")!;
  const startedAt = readIsoDate(candidate, "startedAt")!;
  if (Date.parse(startedAt) > Date.parse(generatedAt)) {
    throw new RuntimePayloadError("heartbeat startedAt cannot follow generatedAt");
  }
  return {
    revision: readRevision(candidate),
    generatedAt,
    startedAt,
  };
};

export const parseControlResponse = (candidate: unknown): SocietyControlResponse => {
  if (!isRecord(candidate) || candidate.accepted !== true) {
    throw new RuntimePayloadError("control response was not accepted");
  }
  assertAllowedKeys(candidate, ["accepted", "revision", "snapshot"], "control response");
  return {
    accepted: true,
    ...(candidate.revision === undefined
      ? {}
      : { revision: readRevision(candidate) }),
    ...(candidate.snapshot === undefined
      ? {}
      : { snapshot: parseSocietySnapshot(candidate.snapshot) }),
  };
};

export const parseRuntimeConfig = (candidate: unknown): RuntimeConfig => {
  if (!isRecord(candidate)) return DEFAULT_CONFIG;
  const mode = candidate.mode;
  const apiBasePath = candidate.apiBasePath;
  const localFallbackAfterMs = candidate.localFallbackAfterMs;
  const pollIntervalMs = candidate.pollIntervalMs;

  return {
    apiBasePath:
      typeof apiBasePath === "string" &&
      apiBasePath.length <= 160 &&
      isSameOriginPath(apiBasePath) &&
      !apiBasePath.includes("?")
        ? apiBasePath.replace(/\/$/, "")
        : DEFAULT_CONFIG.apiBasePath,
    mode: mode === "auto" || mode === "live" || mode === "local" ? mode : DEFAULT_CONFIG.mode,
    localFallbackAfterMs:
      typeof localFallbackAfterMs === "number" &&
      Number.isFinite(localFallbackAfterMs) &&
      localFallbackAfterMs >= 500 &&
      localFallbackAfterMs <= 30_000
        ? Math.round(localFallbackAfterMs)
        : DEFAULT_CONFIG.localFallbackAfterMs,
    pollIntervalMs:
      typeof pollIntervalMs === "number" &&
      Number.isFinite(pollIntervalMs) &&
      pollIntervalMs >= 2_000 &&
      pollIntervalMs <= 60_000
        ? Math.round(pollIntervalMs)
        : DEFAULT_CONFIG.pollIntervalMs,
  };
};

export const loadRuntimeConfig = (): RuntimeConfig => {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  return parseRuntimeConfig(window.__INDIVIDUALS_CONFIG__);
};

export const parseJsonText = (text: string): unknown => {
  if (text.length > 2_000_000) throw new RuntimePayloadError("payload exceeds size limit");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RuntimePayloadError("payload is not valid JSON");
  }
};
