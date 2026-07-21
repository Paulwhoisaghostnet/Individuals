import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { IndividualSnapshot, MemoryEntry } from "../core/model";
import { validateIndividualSnapshot, validateMemoryEntries } from "../memory/validation";
import {
  assertExactKeys,
  requireRecord,
  requireSafeIdentifier,
  requireString,
  requireTimestamp,
} from "../memory/validationPrimitives";
import { canonicalJson } from "./canonicalJson";

export interface MigrationBundlePayload {
  readonly schemaVersion: 1;
  readonly bundleId: string;
  readonly individualId: string;
  readonly sourceSiteId: string;
  readonly destinationSiteId: string;
  readonly exportedAt: string;
  readonly snapshot: IndividualSnapshot;
  readonly memories: readonly MemoryEntry[];
}

export interface MigrationBundle extends MigrationBundlePayload {
  readonly contentDigestAlgorithm: "sha256";
  readonly contentDigest: string;
  readonly authenticity?: {
    readonly algorithm: string;
    readonly keyId: string;
    readonly signature: string;
  };
}

export interface MigrationAuthenticator {
  readonly algorithm: string;
  readonly keyId: string;
  sign(canonicalContent: string): string;
  verify(canonicalContent: string, signature: string, keyId: string): boolean;
}

export interface MigrationProtocolOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly maxMemories?: number;
  readonly maxSerializedBytes?: number;
  readonly authenticator?: MigrationAuthenticator;
  /** Offline forensic imports may opt in; network/production imports must authenticate. */
  readonly allowUnauthenticatedImport?: boolean;
}

const SITE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

const assertSiteId = (siteId: string, field: string): void => {
  if (!SITE_ID.test(siteId)) throw new Error(`${field} is invalid.`);
};

const digestFor = (payload: MigrationBundlePayload): string =>
  createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");

const checksumMatches = (actual: string, expected: string): boolean => {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
};

const validateBundle = (
  rawBundle: unknown,
  maxMemories: number,
  maxSerializedBytes: number,
): MigrationBundlePayload => {
  const bundleRecord = requireRecord(rawBundle, "migration bundle", 11);
  assertExactKeys(
    bundleRecord,
    ["schemaVersion", "bundleId", "individualId", "sourceSiteId", "destinationSiteId", "exportedAt", "snapshot", "memories", "contentDigestAlgorithm", "contentDigest", "authenticity"],
    "migration bundle",
  );
  const bundle = rawBundle as MigrationBundle;
  if (bundle.schemaVersion !== 1) throw new Error("Unsupported migration bundle schema version.");
  if (bundle.contentDigestAlgorithm !== "sha256") throw new Error("Unsupported content digest algorithm.");
  requireSafeIdentifier(bundle.bundleId, "bundleId", 128);
  requireSafeIdentifier(bundle.individualId, "individualId", 128);
  assertSiteId(bundle.sourceSiteId, "sourceSiteId");
  assertSiteId(bundle.destinationSiteId, "destinationSiteId");
  if (bundle.sourceSiteId === bundle.destinationSiteId) {
    throw new Error("Migration source and destination must be different sites.");
  }
  requireTimestamp(bundle.exportedAt, "exportedAt");
  requireString(bundle.contentDigest, "contentDigest", 64);
  if (bundle.authenticity !== undefined) {
    const authenticity = requireRecord(bundle.authenticity, "authenticity", 3);
    assertExactKeys(authenticity, ["algorithm", "keyId", "signature"], "authenticity");
    requireSafeIdentifier(authenticity.algorithm, "authenticity.algorithm", 128);
    requireSafeIdentifier(authenticity.keyId, "authenticity.keyId", 128);
    requireString(authenticity.signature, "authenticity.signature", 1_024);
  }

  if (!Array.isArray(bundle.memories) || bundle.memories.length > maxMemories) {
    throw new Error(`Migration bundle exceeds its ${maxMemories}-memory limit.`);
  }
  const approximateBytes = Buffer.byteLength(JSON.stringify(bundle), "utf8");
  if (approximateBytes > maxSerializedBytes) {
    throw new Error(`Migration bundle exceeds its ${maxSerializedBytes}-byte limit.`);
  }
  const snapshot = validateIndividualSnapshot(bundle.snapshot);
  const memories = validateMemoryEntries(bundle.memories);
  if (memories.length > maxMemories) {
    throw new Error(`Migration bundle exceeds its ${maxMemories}-memory limit.`);
  }
  if (snapshot.manifest.id !== bundle.individualId) {
    throw new Error("Migration snapshot identity does not match the bundle identity.");
  }
  if (memories.some((memory) => memory.individualId !== bundle.individualId)) {
    throw new Error("Migration bundle contains memory for another Individual.");
  }
  return {
    schemaVersion: 1,
    bundleId: bundle.bundleId,
    individualId: bundle.individualId,
    sourceSiteId: bundle.sourceSiteId,
    destinationSiteId: bundle.destinationSiteId,
    exportedAt: bundle.exportedAt,
    snapshot,
    memories,
  };
};

export class MigrationProtocol {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly maxMemories: number;
  private readonly maxSerializedBytes: number;
  private readonly authenticator: MigrationAuthenticator | undefined;
  private readonly allowUnauthenticatedImport: boolean;

  constructor(options: MigrationProtocolOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    const maxMemories = options.maxMemories ?? 512;
    const maxSerializedBytes = options.maxSerializedBytes ?? 8 * 1024 * 1024;
    if (!Number.isSafeInteger(maxMemories) || maxMemories < 1 || maxMemories > 10_000) {
      throw new Error("maxMemories must be an integer between 1 and 10000.");
    }
    if (
      !Number.isSafeInteger(maxSerializedBytes) ||
      maxSerializedBytes < 1_024 ||
      maxSerializedBytes > 32 * 1024 * 1024
    ) {
      throw new Error("maxSerializedBytes must be between 1 KiB and 32 MiB.");
    }
    this.maxMemories = maxMemories;
    this.maxSerializedBytes = maxSerializedBytes;
    this.authenticator = options.authenticator;
    this.allowUnauthenticatedImport = options.allowUnauthenticatedImport ?? false;
  }

  exportBundle(input: {
    snapshot: IndividualSnapshot;
    memories: readonly MemoryEntry[];
    sourceSiteId: string;
    destinationSiteId: string;
  }): MigrationBundle {
    assertSiteId(input.sourceSiteId, "sourceSiteId");
    assertSiteId(input.destinationSiteId, "destinationSiteId");
    if (input.sourceSiteId === input.destinationSiteId) {
      throw new Error("Migration source and destination must be different sites.");
    }
    const snapshot = validateIndividualSnapshot(input.snapshot);
    const memories = validateMemoryEntries(input.memories);
    const payloadMemoryLimit = this.maxMemories - 1;
    if (memories.length > payloadMemoryLimit) {
      throw new Error(
        `Migration bundle may carry at most ${payloadMemoryLimit} memories so import metadata stays within the ${this.maxMemories}-memory limit.`,
      );
    }
    if (memories.some((memory) => memory.individualId !== snapshot.manifest.id)) {
      throw new Error("Migration memories must belong to the snapshot Individual.");
    }
    const payload: MigrationBundlePayload = {
      schemaVersion: 1,
      bundleId: `mig-${this.createId()}`,
      individualId: snapshot.manifest.id,
      sourceSiteId: input.sourceSiteId,
      destinationSiteId: input.destinationSiteId,
      exportedAt: this.now().toISOString(),
      snapshot,
      memories,
    };
    requireSafeIdentifier(payload.bundleId, "bundleId", 128);
    const serializedBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
    if (serializedBytes > this.maxSerializedBytes) {
      throw new Error(`Migration bundle exceeds its ${this.maxSerializedBytes}-byte limit.`);
    }
    const contentDigest = digestFor(payload);
    const signedContent = canonicalJson({
      payload,
      contentDigestAlgorithm: "sha256",
      contentDigest,
    });
    const bundle: MigrationBundle = {
      ...payload,
      contentDigestAlgorithm: "sha256",
      contentDigest,
    };
    return this.authenticator
      ? {
          ...bundle,
          authenticity: {
            algorithm: this.authenticator.algorithm,
            keyId: this.authenticator.keyId,
            signature: this.authenticator.sign(signedContent),
          },
        }
      : bundle;
  }

  importBundle(
    bundle: MigrationBundle,
    targetSiteId: string,
  ): {
    readonly snapshot: IndividualSnapshot;
    readonly memories: readonly MemoryEntry[];
  } {
    assertSiteId(targetSiteId, "targetSiteId");
    const payload = validateBundle(bundle, this.maxMemories - 1, this.maxSerializedBytes);
    if (payload.destinationSiteId !== targetSiteId) {
      throw new Error(
        `Migration destination "${payload.destinationSiteId}" does not match target "${targetSiteId}".`,
      );
    }
    const expected = digestFor(payload);
    if (!checksumMatches(bundle.contentDigest, expected)) {
      throw new Error("Migration bundle SHA-256 integrity validation failed.");
    }
    const signedContent = canonicalJson({
      payload,
      contentDigestAlgorithm: bundle.contentDigestAlgorithm,
      contentDigest: bundle.contentDigest,
    });
    if (bundle.authenticity) {
      if (
        !this.authenticator ||
        bundle.authenticity.algorithm !== this.authenticator.algorithm ||
        !this.authenticator.verify(
          signedContent,
          bundle.authenticity.signature,
          bundle.authenticity.keyId,
        )
      ) {
        throw new Error("Migration bundle authenticity validation failed.");
      }
    } else if (!this.allowUnauthenticatedImport) {
      throw new Error("Unauthenticated migration import is disabled.");
    }

    const importedAt = this.now().toISOString();
    const migrationMemory: MemoryEntry = {
      id: `migration-${bundle.bundleId}`,
      individualId: payload.individualId,
      cycle: payload.snapshot.state.cycle,
      kind: "relationship",
      content: `Identity handoff from ${payload.sourceSiteId} to ${targetSiteId}; bundle ${payload.bundleId}.`,
      createdAt: importedAt,
      relatedIndividualIds: [],
    };
    return {
      snapshot: payload.snapshot,
      memories: [...payload.memories, migrationMemory],
    };
  }

}

export class HmacSha256MigrationAuthenticator implements MigrationAuthenticator {
  readonly algorithm = "hmac-sha256";

  constructor(
    private readonly secret: string | Uint8Array,
    readonly keyId: string,
  ) {
    if (Buffer.byteLength(secret) < 32) throw new Error("Migration HMAC secret must be at least 32 bytes.");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(keyId)) throw new Error("Migration keyId is invalid.");
  }

  sign(canonicalContent: string): string {
    return createHmac("sha256", this.secret).update(canonicalContent, "utf8").digest("base64url");
  }

  verify(canonicalContent: string, signature: string, keyId: string): boolean {
    if (keyId !== this.keyId || !/^[a-zA-Z0-9_-]{43}$/.test(signature)) return false;
    const expected = Buffer.from(this.sign(canonicalContent), "base64url");
    const actual = Buffer.from(signature, "base64url");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
