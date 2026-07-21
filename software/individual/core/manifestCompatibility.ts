import { defineIndividualManifest } from "./manifest";
import type { IndividualManifest } from "./model";

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export class IncompatibleIdentityStateError extends Error {
  readonly name = "IncompatibleIdentityStateError";
  readonly code = "INCOMPATIBLE_IDENTITY_STATE" as const;

  constructor(readonly individualId: string) {
    super(
      `Persisted identity state for "${individualId}" was authored by a different manifest; an explicit migration is required.`,
    );
  }
}

/** Prevents silent identity morphing when code and persisted state disagree. */
export const assertPersistedManifestCompatible = (
  installed: IndividualManifest,
  persisted: IndividualManifest,
): void => {
  try {
    defineIndividualManifest(persisted);
  } catch {
    throw new IncompatibleIdentityStateError(installed.id);
  }
  if (
    persisted.id !== installed.id ||
    canonicalJson(persisted) !== canonicalJson(installed)
  ) {
    throw new IncompatibleIdentityStateError(installed.id);
  }
};
