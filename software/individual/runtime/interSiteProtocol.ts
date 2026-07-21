import type { PortraitRole } from "../core/model";

export interface MultiLocationSiteConfig {
  readonly siteId: string;
  readonly siteName: string;
  readonly localIndividualIds: readonly string[];
  /** Exact public HTTPS origin from which this site's immutable artifacts are served. */
  readonly artifactOrigin: string;
}

/**
 * Deliberately small public identity state. Private narrative, prompts, memory,
 * peer models, perception evidence, and cognition output never belong here.
 */
export interface PublicIdentitySignal {
  readonly individualId: string;
  readonly cycle: number;
  readonly perceivedSimilarity: number;
  readonly perceivedDifferences: readonly string[];
  readonly publicReflection?: string;
}

/**
 * A public, immutable reference to exhibition artwork hosted by the source
 * site. Raw SVG and the core Portrait model are intentionally excluded.
 */
export interface PublicPortraitArtifactReference {
  readonly artifactId: string;
  readonly url: string;
  readonly sha256: string;
  readonly mediaType: "image/svg+xml" | "image/png" | "image/jpeg" | "image/webp";
  readonly width: number;
  readonly height: number;
}

export interface PublicPortraitShare {
  readonly portraitId: string;
  readonly artistId: string;
  readonly subjectId: string;
  readonly role: PortraitRole;
  readonly cycle: number;
  readonly createdAt: string;
  readonly artifact: PublicPortraitArtifactReference;
  readonly identitySignal: PublicIdentitySignal;
}

export type InterSitePayload =
  | { readonly type: "portrait_share"; readonly portrait: PublicPortraitShare }
  | { readonly type: "public_identity_signal"; readonly signal: PublicIdentitySignal };

export interface InterSiteEnvelope {
  readonly schemaVersion: 1;
  readonly messageId: string;
  readonly sequence: number;
  readonly sourceSiteId: string;
  readonly destinationSiteId: string;
  readonly createdAt: string;
  readonly payload: InterSitePayload;
}

export interface InterSiteAcknowledgement {
  readonly schemaVersion: 1;
  readonly messageId: string;
  readonly destinationSiteId: string;
  readonly receivedAt: string;
  readonly status: "accepted" | "duplicate";
}

export interface InterSiteTransport {
  /**
   * Authentication, encryption, and endpoint allowlisting belong here. The
   * bridge supplies a hard deadline signal and also contains adapters that
   * fail to cooperate with it.
   */
  deliver(
    envelope: InterSiteEnvelope,
    signal: AbortSignal,
  ): Promise<InterSiteAcknowledgement>;
}

export const SITE_ID_PATTERN = /^(?!(?:__proto__|prototype|constructor)$)[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
export const MESSAGE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const ENTITY_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const MAX_INTER_SITE_ENVELOPE_BYTES = 64 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireRecord = (value: unknown, field: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`);
  return value;
};

const assertOnlyKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): void => {
  const allowed = new Set(keys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`${field} contains unsupported field "${unexpected}".`);
};

const safeText = (value: unknown, max: number, field: string): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > max ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)
  ) {
    throw new Error(`${field} must be a non-empty string no longer than ${max} characters.`);
  }
  return value;
};

const safeId = (value: unknown, field: string): string => {
  const id = safeText(value, 128, field);
  if (!ENTITY_ID_PATTERN.test(id) || id === "." || id === "..") {
    throw new Error(`${field} contains unsafe characters.`);
  }
  return id;
};

const safeDate = (value: unknown, field: string): string => {
  const date = safeText(value, 40, field);
  if (!Number.isFinite(Date.parse(date))) throw new Error(`${field} is not a valid timestamp.`);
  return date;
};

export const validatePublicIdentitySignal = (raw: unknown): PublicIdentitySignal => {
  const signal = requireRecord(raw, "signal");
  assertOnlyKeys(
    signal,
    ["individualId", "cycle", "perceivedSimilarity", "perceivedDifferences", "publicReflection"],
    "signal",
  );
  safeId(signal.individualId, "signal.individualId");
  if (!Number.isSafeInteger(signal.cycle) || (signal.cycle as number) < 0) {
    throw new Error("signal.cycle must be a non-negative integer.");
  }
  if (
    typeof signal.perceivedSimilarity !== "number" ||
    !Number.isFinite(signal.perceivedSimilarity) ||
    signal.perceivedSimilarity < 0 ||
    signal.perceivedSimilarity > 1
  ) {
    throw new Error("signal.perceivedSimilarity must be between zero and one.");
  }
  if (
    !Array.isArray(signal.perceivedDifferences) ||
    signal.perceivedDifferences.length > 16 ||
    signal.perceivedDifferences.some(
      (difference) =>
        typeof difference !== "string" || difference.length === 0 || difference.length > 300,
    )
  ) {
    throw new Error("signal.perceivedDifferences is invalid or too large.");
  }
  if (signal.publicReflection !== undefined) {
    safeText(signal.publicReflection, 1_000, "signal.publicReflection");
  }
  return raw as PublicIdentitySignal;
};

const validateArtifactReference = (raw: unknown): PublicPortraitArtifactReference => {
  const artifact = requireRecord(raw, "portrait.artifact");
  assertOnlyKeys(
    artifact,
    ["artifactId", "url", "sha256", "mediaType", "width", "height"],
    "portrait.artifact",
  );
  safeId(artifact.artifactId, "portrait.artifact.artifactId");
  const urlText = safeText(artifact.url, 2_048, "portrait.artifact.url");
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new Error("portrait.artifact.url must be an absolute URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) {
    throw new Error("portrait.artifact.url must be an HTTPS URL without credentials, query, or fragment.");
  }
  if (typeof artifact.sha256 !== "string" || !SHA256_PATTERN.test(artifact.sha256)) {
    throw new Error("portrait.artifact.sha256 must be a lowercase SHA-256 digest.");
  }
  if (!["image/svg+xml", "image/png", "image/jpeg", "image/webp"].includes(String(artifact.mediaType))) {
    throw new Error("portrait.artifact.mediaType is unsupported.");
  }
  for (const dimension of ["width", "height"] as const) {
    const value = artifact[dimension];
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 16_384) {
      throw new Error(`portrait.artifact.${dimension} must be between 1 and 16384.`);
    }
  }
  return raw as PublicPortraitArtifactReference;
};

const privateHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isIpv6 = normalized.includes(":");
  if (
    normalized === "localhost" ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    (isIpv6 && (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    ))
  ) return true;
  if (isIpv6 && normalized.startsWith("::ffff:") && normalized.slice(7).includes(".")) {
    return privateHostname(normalized.slice(7));
  }
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
};

export const normalizePublicArtifactOrigin = (raw: unknown, field: string): string => {
  const value = safeText(raw, 300, field);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute HTTPS origin.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    privateHostname(url.hostname)
  ) {
    throw new Error(`${field} must be a public HTTPS origin without path, credentials, query, or fragment.`);
  }
  return url.origin;
};

export const assertPortraitArtifactOrigin = (
  envelope: InterSiteEnvelope,
  registeredSourceOrigin: string,
): void => {
  if (envelope.payload.type !== "portrait_share") return;
  const artifactOrigin = new URL(envelope.payload.portrait.artifact.url).origin;
  if (artifactOrigin !== registeredSourceOrigin) {
    throw new Error("Portrait artifact URL does not belong to the registered source site origin.");
  }
};

export const validatePublicPortraitShare = (raw: unknown): PublicPortraitShare => {
  const portrait = requireRecord(raw, "portrait");
  assertOnlyKeys(
    portrait,
    ["portraitId", "artistId", "subjectId", "role", "cycle", "createdAt", "artifact", "identitySignal"],
    "portrait",
  );
  safeId(portrait.portraitId, "portrait.portraitId");
  const artistId = safeId(portrait.artistId, "portrait.artistId");
  const subjectId = safeId(portrait.subjectId, "portrait.subjectId");
  if (!(["self", "peer", "social"] as const).includes(portrait.role as PortraitRole)) {
    throw new Error("portrait.role is unsupported.");
  }
  const role = portrait.role as PortraitRole;
  if (!Number.isSafeInteger(portrait.cycle) || (portrait.cycle as number) < 0) {
    throw new Error("portrait.cycle must be a non-negative integer.");
  }
  safeDate(portrait.createdAt, "portrait.createdAt");
  validateArtifactReference(portrait.artifact);
  const signal = validatePublicIdentitySignal(portrait.identitySignal);
  const signalIndividualId = role === "peer" ? artistId : subjectId;
  if (signal.individualId !== signalIndividualId || signal.cycle !== portrait.cycle) {
    throw new Error(
      role === "peer"
        ? "portrait.identitySignal must describe the source artist and portrait cycle."
        : "portrait.identitySignal must describe the source-owned subject and portrait cycle.",
    );
  }
  return raw as PublicPortraitShare;
};

const validatePayload = (raw: unknown): InterSitePayload => {
  const payload = requireRecord(raw, "envelope.payload");
  if (payload.type === "portrait_share") {
    assertOnlyKeys(payload, ["type", "portrait"], "envelope.payload");
    validatePublicPortraitShare(payload.portrait);
  } else if (payload.type === "public_identity_signal") {
    assertOnlyKeys(payload, ["type", "signal"], "envelope.payload");
    validatePublicIdentitySignal(payload.signal);
  } else {
    throw new Error("Unsupported inter-site payload type.");
  }
  return raw as InterSitePayload;
};

export const validateInterSiteEnvelope = (raw: unknown): InterSiteEnvelope => {
  const envelope = requireRecord(raw, "envelope");
  assertOnlyKeys(
    envelope,
    ["schemaVersion", "messageId", "sequence", "sourceSiteId", "destinationSiteId", "createdAt", "payload"],
    "envelope",
  );
  if (envelope.schemaVersion !== 1) throw new Error("Unsupported inter-site envelope schema.");
  if (typeof envelope.messageId !== "string" || !MESSAGE_ID_PATTERN.test(envelope.messageId)) {
    throw new Error("Invalid inter-site message ID.");
  }
  if (!Number.isSafeInteger(envelope.sequence) || (envelope.sequence as number) < 1) {
    throw new Error("Invalid inter-site message sequence.");
  }
  if (
    typeof envelope.sourceSiteId !== "string" ||
    typeof envelope.destinationSiteId !== "string" ||
    !SITE_ID_PATTERN.test(envelope.sourceSiteId) ||
    !SITE_ID_PATTERN.test(envelope.destinationSiteId)
  ) {
    throw new Error("Invalid source or destination site ID.");
  }
  if (envelope.sourceSiteId === envelope.destinationSiteId) {
    throw new Error("Inter-site message source and destination must differ.");
  }
  safeDate(envelope.createdAt, "envelope.createdAt");
  validatePayload(envelope.payload);
  if (Buffer.byteLength(JSON.stringify(raw), "utf8") > MAX_INTER_SITE_ENVELOPE_BYTES) {
    throw new Error("Inter-site envelope exceeds the 64 KiB safety limit.");
  }
  return raw as InterSiteEnvelope;
};

export const validateAcknowledgement = (
  raw: unknown,
  envelope: InterSiteEnvelope,
): InterSiteAcknowledgement => {
  const acknowledgement = requireRecord(raw, "acknowledgement");
  assertOnlyKeys(
    acknowledgement,
    ["schemaVersion", "messageId", "destinationSiteId", "receivedAt", "status"],
    "acknowledgement",
  );
  if (
    acknowledgement.schemaVersion !== 1 ||
    acknowledgement.messageId !== envelope.messageId ||
    acknowledgement.destinationSiteId !== envelope.destinationSiteId ||
    (acknowledgement.status !== "accepted" && acknowledgement.status !== "duplicate")
  ) {
    throw new Error("Transport returned an invalid inter-site acknowledgement.");
  }
  safeDate(acknowledgement.receivedAt, "acknowledgement.receivedAt");
  return raw as InterSiteAcknowledgement;
};
