import type { Portrait } from "../model";
import {
  requireBoundedStringArray,
  requireBoundedText,
  requireExactKeys,
  requireRecord,
  requireRouteId,
  requireUtcTimestamp,
} from "./primitives";
import {
  assertArtworkDescriptorBounds,
  assertPerceptionEvidenceBounds,
  assertSocialFeedbackEvidenceBounds,
} from "./visualEvidence";

export const MAX_ROUTED_PORTRAIT_BYTES = 2 * 1024 * 1024;
export const MAX_ROUTED_PORTRAIT_ID_BYTES = 256;
const PORTRAIT_ROLES = new Set(["self", "peer", "social"]);
const ARTWORK_FORMATS = new Set(["svg", "procedural", "raster-reference"]);

const validatePortraitEnvelope = (value: unknown, field: string): Portrait => {
  const portrait = requireRecord(value, field);
  requireExactKeys(
    portrait,
    ["id", "cycle", "artistId", "subjectId", "role", "createdAt", "artwork", "sourcePortraitIds"],
    ["descriptor", "socialEvidence", "observationEvidence", "statement"],
    field,
  );
  requireRouteId(portrait.id, `${field}.id`);
  if (!Number.isSafeInteger(portrait.cycle) || (portrait.cycle as number) < 0 || (portrait.cycle as number) > 1_000_000_000) {
    throw new Error(`${field}.cycle is outside accepted bounds.`);
  }
  requireRouteId(portrait.artistId, `${field}.artistId`, 64);
  requireRouteId(portrait.subjectId, `${field}.subjectId`, 64);
  if (typeof portrait.role !== "string" || !PORTRAIT_ROLES.has(portrait.role)) {
    throw new Error(`${field}.role is unsupported.`);
  }
  requireUtcTimestamp(portrait.createdAt, `${field}.createdAt`);
  requireBoundedStringArray(
    portrait.sourcePortraitIds,
    `${field}.sourcePortraitIds`,
    16,
    MAX_ROUTED_PORTRAIT_ID_BYTES,
    true,
  );
  if (portrait.statement !== undefined) {
    requireBoundedText(portrait.statement, `${field}.statement`, 10_000, true);
  }

  const artwork = requireRecord(portrait.artwork, `${field}.artwork`);
  requireExactKeys(artwork, ["format", "width", "height", "content"], [], `${field}.artwork`);
  if (typeof artwork.format !== "string" || !ARTWORK_FORMATS.has(artwork.format)) {
    throw new Error(`${field}.artwork.format is unsupported.`);
  }
  for (const dimension of ["width", "height"] as const) {
    if (!Number.isInteger(artwork[dimension]) || (artwork[dimension] as number) < 1 || (artwork[dimension] as number) > 8_192) {
      throw new Error(`${field}.artwork.${dimension} is outside accepted bounds.`);
    }
  }
  requireBoundedText(
    artwork.content,
    `${field}.artwork.content`,
    MAX_ROUTED_PORTRAIT_BYTES,
  );
  if (portrait.descriptor !== undefined) {
    assertArtworkDescriptorBounds(portrait.descriptor, `${field}.descriptor`);
  }
  if (portrait.observationEvidence !== undefined) {
    assertPerceptionEvidenceBounds(
      portrait.observationEvidence,
      `${field}.observationEvidence`,
    );
  }
  return value as Portrait;
};

export const assertRoutedPortraitBounds: (
  value: unknown,
  field?: string,
) => asserts value is Portrait = (
  value: unknown,
  field = "portrait",
): asserts value is Portrait => {
  const portrait = validatePortraitEnvelope(value, field);
  if (portrait.socialEvidence !== undefined) {
    throw new Error(`${field}.socialEvidence cannot cross a peer portrait route.`);
  }
};

export const assertGeneratedSocialPortraitBounds: (
  value: unknown,
  field?: string,
) => asserts value is Portrait = (
  value: unknown,
  field = "social portrait output",
): asserts value is Portrait => {
  const portrait = validatePortraitEnvelope(value, field);
  if (
    portrait.role !== "social" ||
    portrait.artistId !== "collective" ||
    !portrait.descriptor ||
    !portrait.socialEvidence ||
    portrait.observationEvidence
  ) {
    throw new Error(`${field} violates the social portrait contract.`);
  }
  assertSocialFeedbackEvidenceBounds(portrait.socialEvidence, `${field}.socialEvidence`);
  if (portrait.socialEvidence.subjectId !== portrait.subjectId) {
    throw new Error(`${field}.socialEvidence subject does not match the portrait.`);
  }
};
