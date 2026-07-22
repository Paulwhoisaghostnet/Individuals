import type { MemoryEntry, PortraitRole } from "../core/model";
import { validatePublicSvg } from "../security/publicSvg";
import { TimelineExportError, timelineErrorMessage } from "./errors";
import {
  MAX_PRIVATE_MEMORIES_PER_CYCLE,
  MAX_TIMELINE_ARTWORK_BYTES,
  MAX_TIMELINE_INDIVIDUALS,
  MAX_TIMELINE_PEER_PORTRAITS,
  MAX_TIMELINE_SELF_PORTRAITS,
  type TimelineDocument,
  type TimelineIndividual,
  type TimelineMemoryGroup,
  type TimelinePortrait,
} from "./timelineTypes";

declare const validatedTimelineDocumentBrand: unique symbol;

/** Opaque render input created only after complete scalar and privacy validation. */
export type ValidatedTimelineDocument = TimelineDocument & {
  readonly [validatedTimelineDocumentBrand]: true;
};

const validatedDocuments = new WeakSet<object>();
const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const RESERVED_IDENTIFIERS = new Set(["__proto__", "prototype", "constructor"]);
const UNSAFE_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const INLINE_CONTROLS = /[\u0000-\u001F\u007F]/;
const MEMORY_KINDS = new Set(["experience", "reflection", "relationship", "summary"]);
const PORTRAIT_ROLES = new Set<PortraitRole>(["self", "peer", "social"]);

const asRecord = (value: unknown, field: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const assertAllowedKeys = (
  record: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void => {
  const allowedSet = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedSet.has(key))) {
    throw new Error(`${field} contains an unsupported field.`);
  }
};

const boundedString = (
  value: unknown,
  field: string,
  maximum: number,
  allowEmpty = false,
): string => {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    (!allowEmpty && value.trim().length === 0) ||
    UNSAFE_CONTROLS.test(value)
  ) {
    throw new Error(`${field} is not a bounded safe string.`);
  }
  return value;
};

const safeIdentifier = (value: unknown, field: string, maximum: number): string => {
  const identifier = boundedString(value, field, maximum);
  if (!SAFE_IDENTIFIER.test(identifier) || RESERVED_IDENTIFIERS.has(identifier)) {
    throw new Error(`${field} is not a safe identifier.`);
  }
  return identifier;
};

const boundedInteger = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${field} is not a bounded integer.`);
  }
  return value as number;
};

const timestamp = (value: unknown, field: string): string => {
  const text = boundedString(value, field, 64);
  if (INLINE_CONTROLS.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new Error(`${field} is not a valid timestamp.`);
  }
  return text;
};

const frozenArray = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values]);

interface ValidationBudget {
  artworkBytes: number;
}

const portrait = (
  value: unknown,
  field: string,
  expectedRole: PortraitRole,
  expectedSubjectId: string,
  budget: ValidationBudget,
): TimelinePortrait => {
  const record = asRecord(value, field);
  assertAllowedKeys(
    record,
    ["id", "role", "cycle", "artistId", "subjectId", "createdAt", "width", "height", "svg"],
    field,
  );
  const role = boundedString(record.role, `${field}.role`, 16) as PortraitRole;
  if (!PORTRAIT_ROLES.has(role) || role !== expectedRole) {
    throw new Error(`${field}.role does not match its render section.`);
  }
  const subjectId = safeIdentifier(record.subjectId, `${field}.subjectId`, 128);
  if (subjectId !== expectedSubjectId) throw new Error(`${field}.subjectId is inconsistent.`);
  if (typeof record.svg !== "string") throw new Error(`${field}.svg is not a string.`);
  const svg = validatePublicSvg(record.svg);
  budget.artworkBytes += Buffer.byteLength(svg, "utf8");
  if (budget.artworkBytes > MAX_TIMELINE_ARTWORK_BYTES) {
    throw new Error("Timeline render artwork exceeds its total byte budget.");
  }
  return Object.freeze({
    id: safeIdentifier(record.id, `${field}.id`, 256),
    role,
    cycle: boundedInteger(record.cycle, `${field}.cycle`, 0, 1_000_000_000),
    artistId: safeIdentifier(record.artistId, `${field}.artistId`, 128),
    subjectId,
    createdAt: timestamp(record.createdAt, `${field}.createdAt`),
    width: boundedInteger(record.width, `${field}.width`, 1, 16_384),
    height: boundedInteger(record.height, `${field}.height`, 1, 16_384),
    svg,
  });
};

const memoryEntry = (
  value: unknown,
  field: string,
  individualId: string,
  cycle: number,
): MemoryEntry => {
  const record = asRecord(value, field);
  assertAllowedKeys(
    record,
    ["id", "individualId", "cycle", "kind", "content", "createdAt", "relatedIndividualIds"],
    field,
  );
  const entryIndividualId = safeIdentifier(record.individualId, `${field}.individualId`, 128);
  if (entryIndividualId !== individualId) throw new Error(`${field} crosses an identity boundary.`);
  const entryCycle = boundedInteger(record.cycle, `${field}.cycle`, 0, 1_000_000_000);
  if (entryCycle !== cycle) throw new Error(`${field} crosses a cycle boundary.`);
  const kind = boundedString(record.kind, `${field}.kind`, 32) as MemoryEntry["kind"];
  if (!MEMORY_KINDS.has(kind)) throw new Error(`${field}.kind is unsupported.`);
  if (!Array.isArray(record.relatedIndividualIds) || record.relatedIndividualIds.length > 64) {
    throw new Error(`${field}.relatedIndividualIds exceeds its bound.`);
  }
  const relatedIndividualIds = record.relatedIndividualIds.map((id, index) =>
    safeIdentifier(id, `${field}.relatedIndividualIds[${index}]`, 128)
  );
  if (new Set(relatedIndividualIds).size !== relatedIndividualIds.length) {
    throw new Error(`${field}.relatedIndividualIds contains duplicates.`);
  }
  return Object.freeze({
    id: safeIdentifier(record.id, `${field}.id`, 256),
    individualId: entryIndividualId,
    cycle: entryCycle,
    kind,
    content: boundedString(record.content, `${field}.content`, 64 * 1024),
    createdAt: timestamp(record.createdAt, `${field}.createdAt`),
    relatedIndividualIds: frozenArray(relatedIndividualIds),
  });
};

const memoryGroups = (
  value: unknown,
  field: string,
  individualId: string,
  visibleCycles: ReadonlySet<number>,
): readonly TimelineMemoryGroup[] => {
  if (!Array.isArray(value) || value.length > MAX_TIMELINE_SELF_PORTRAITS) {
    throw new Error(`${field} exceeds its group bound.`);
  }
  const seenCycles = new Set<number>();
  const groups = value.map((rawGroup, groupIndex) => {
    const groupField = `${field}[${groupIndex}]`;
    const record = asRecord(rawGroup, groupField);
    assertAllowedKeys(record, ["cycle", "entries", "omittedCount"], groupField);
    const cycle = boundedInteger(record.cycle, `${groupField}.cycle`, 0, 1_000_000_000);
    if (!visibleCycles.has(cycle) || seenCycles.has(cycle)) {
      throw new Error(`${groupField}.cycle is not a unique visible self-portrait cycle.`);
    }
    seenCycles.add(cycle);
    if (!Array.isArray(record.entries) || record.entries.length > MAX_PRIVATE_MEMORIES_PER_CYCLE) {
      throw new Error(`${groupField}.entries exceeds its bound.`);
    }
    return Object.freeze({
      cycle,
      entries: frozenArray(record.entries.map((entry, entryIndex) =>
        memoryEntry(entry, `${groupField}.entries[${entryIndex}]`, individualId, cycle)
      )),
      omittedCount: boundedInteger(
        record.omittedCount,
        `${groupField}.omittedCount`,
        0,
        10_000,
      ),
    });
  });
  return frozenArray(groups);
};

const individual = (
  value: unknown,
  field: string,
  includesPrivateMemory: boolean,
  budget: ValidationBudget,
): TimelineIndividual => {
  const record = asRecord(value, field);
  assertAllowedKeys(
    record,
    [
      "id",
      "displayName",
      "cycle",
      "updatedAt",
      "selfPortraits",
      "omittedSelfPortraitCount",
      "socialPortrait",
      "peerPortraits",
      "omittedPeerPortraitCount",
      "privateMemoryGroups",
    ],
    field,
  );
  const id = safeIdentifier(record.id, `${field}.id`, 128);
  const cycle = boundedInteger(record.cycle, `${field}.cycle`, 0, 1_000_000_000);
  if (!Array.isArray(record.selfPortraits) || record.selfPortraits.length > MAX_TIMELINE_SELF_PORTRAITS) {
    throw new Error(`${field}.selfPortraits exceeds its bound.`);
  }
  if (!Array.isArray(record.peerPortraits) || record.peerPortraits.length > MAX_TIMELINE_PEER_PORTRAITS) {
    throw new Error(`${field}.peerPortraits exceeds its bound.`);
  }
  const selfPortraits = record.selfPortraits.map((entry, index) =>
    portrait(entry, `${field}.selfPortraits[${index}]`, "self", id, budget)
  );
  if (selfPortraits.some((entry) => entry.cycle > cycle)) {
    throw new Error(`${field}.selfPortraits contains a future cycle.`);
  }
  const socialPortrait = record.socialPortrait === undefined
    ? undefined
    : portrait(record.socialPortrait, `${field}.socialPortrait`, "social", id, budget);
  const peerPortraits = record.peerPortraits.map((entry, index) =>
    portrait(entry, `${field}.peerPortraits[${index}]`, "peer", id, budget)
  );
  const visibleCycles = new Set(selfPortraits.map((entry) => entry.cycle));
  if (!includesPrivateMemory && record.privateMemoryGroups !== undefined) {
    throw new Error(`${field}.privateMemoryGroups requires the document privacy warning.`);
  }
  if (includesPrivateMemory && !Array.isArray(record.privateMemoryGroups)) {
    throw new Error(`${field}.privateMemoryGroups is required in private-memory mode.`);
  }
  const privateMemoryGroups = includesPrivateMemory
    ? memoryGroups(record.privateMemoryGroups, `${field}.privateMemoryGroups`, id, visibleCycles)
    : undefined;
  return Object.freeze({
    id,
    displayName: boundedString(record.displayName, `${field}.displayName`, 200),
    cycle,
    updatedAt: timestamp(record.updatedAt, `${field}.updatedAt`),
    selfPortraits: frozenArray(selfPortraits),
    omittedSelfPortraitCount: boundedInteger(
      record.omittedSelfPortraitCount,
      `${field}.omittedSelfPortraitCount`,
      0,
      1_000_000_000,
    ),
    socialPortrait,
    peerPortraits: frozenArray(peerPortraits),
    omittedPeerPortraitCount: boundedInteger(
      record.omittedPeerPortraitCount,
      `${field}.omittedPeerPortraitCount`,
      0,
      MAX_TIMELINE_PEER_PORTRAITS,
    ),
    privateMemoryGroups,
  });
};

const buildValidatedDocument = (value: unknown): ValidatedTimelineDocument => {
  const record = asRecord(value, "timeline document");
  assertAllowedKeys(
    record,
    ["generatedAt", "sourceKind", "includesPrivateMemory", "individuals"],
    "timeline document",
  );
  if (record.sourceKind !== "validated-retained-snapshots") {
    throw new Error("Timeline source kind is unsupported.");
  }
  if (typeof record.includesPrivateMemory !== "boolean") {
    throw new Error("Timeline privacy mode must be boolean.");
  }
  if (
    !Array.isArray(record.individuals) ||
    record.individuals.length < 1 ||
    record.individuals.length > MAX_TIMELINE_INDIVIDUALS
  ) {
    throw new Error("Timeline Individuals exceed the render bound.");
  }
  const budget: ValidationBudget = { artworkBytes: 0 };
  const individuals = record.individuals.map((entry, index) =>
    individual(
      entry,
      `timeline document.individuals[${index}]`,
      record.includesPrivateMemory as boolean,
      budget,
    )
  );
  if (new Set(individuals.map(({ id }) => id)).size !== individuals.length) {
    throw new Error("Timeline contains duplicate Individual IDs.");
  }
  const document = Object.freeze({
    generatedAt: timestamp(record.generatedAt, "timeline document.generatedAt"),
    sourceKind: "validated-retained-snapshots" as const,
    includesPrivateMemory: record.includesPrivateMemory as boolean,
    individuals: frozenArray(individuals),
  }) as ValidatedTimelineDocument;
  validatedDocuments.add(document);
  return document;
};

export const createValidatedTimelineDocument = (
  value: unknown,
): ValidatedTimelineDocument => {
  try {
    return buildValidatedDocument(value);
  } catch (error) {
    if (error instanceof TimelineExportError) throw error;
    throw new TimelineExportError(
      "INPUT_INVALID",
      `Timeline render model failed validation: ${timelineErrorMessage(error)}`,
      { cause: error },
    );
  }
};

export function assertValidatedTimelineDocument(
  value: unknown,
): asserts value is ValidatedTimelineDocument {
  if (typeof value !== "object" || value === null || !validatedDocuments.has(value)) {
    throw new TimelineExportError(
      "INPUT_INVALID",
      "Timeline HTML serialization requires an opaque validated document.",
    );
  }
}
