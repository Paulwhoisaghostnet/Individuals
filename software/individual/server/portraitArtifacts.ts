import { createHash } from "node:crypto";

import type { Portrait } from "../core/model";
import type {
  PublicArtworkReference,
  PublicPortraitReferenceFactory,
} from "../runtime/publicProjection";

const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "rect",
  "ellipse",
  "circle",
  "path",
  "polygon",
  "text",
]);

export const MAX_PUBLIC_SVG_BYTES = 512 * 1024;

const DANGEROUS_MARKUP = [
  /<!DOCTYPE/i,
  /<!ENTITY/i,
  /<\?/,
  /<!\[/,
  /<script\b/i,
  /<foreignObject\b/i,
  /<(?:iframe|object|embed|audio|video|image|link|meta)\b/i,
  /\son[a-z]+\s*=/i,
  /javascript\s*:/i,
  /data\s*:/i,
  /@import/i,
  /\sstyle\s*=/i,
  /\shref\s*=/i,
  /<\s*\/?\s*[A-Za-z][A-Za-z0-9._-]*:/,
  /\s[A-Za-z_][A-Za-z0-9._-]*:[A-Za-z_][A-Za-z0-9._-]*\s*=/,
  /url\s*\(/i,
];

export const validatePublicSvg = (content: string): string => {
  if (Buffer.byteLength(content, "utf8") > MAX_PUBLIC_SVG_BYTES) {
    throw new Error("Portrait SVG exceeds the 512 KiB public artifact limit.");
  }
  const trimmed = content.trim();
  if (!trimmed.startsWith("<svg") || !trimmed.endsWith("</svg>")) {
    throw new Error("Portrait artwork is not a complete SVG document.");
  }
  const namespaceDeclarations = trimmed.match(/\sxmlns\s*=/gi) ?? [];
  if (
    namespaceDeclarations.length !== 1 ||
    !/^<svg\b[^>]*\sxmlns\s*=\s*(["'])http:\/\/www\.w3\.org\/2000\/svg\1/.test(trimmed)
  ) {
    throw new Error("Portrait SVG must use exactly the standard SVG namespace.");
  }
  for (const pattern of DANGEROUS_MARKUP) {
    if (pattern.test(trimmed)) throw new Error("Portrait SVG contains unsafe active content.");
  }
  for (const match of trimmed.matchAll(/<\s*\/?\s*([A-Za-z][A-Za-z0-9._:-]*)\b/g)) {
    if (!ALLOWED_ELEMENTS.has(match[1])) {
      throw new Error(`Portrait SVG element "${match[1]}" is not allowlisted.`);
    }
  }
  return trimmed;
};

export interface PortraitArtifact {
  readonly opaqueId: string;
  readonly content: string;
  readonly etag: string;
}

export class PortraitArtifactStore implements PublicPortraitReferenceFactory {
  private readonly artifacts = new Map<string, PortraitArtifact>();
  private totalBytes = 0;

  constructor(
    private readonly maxArtifacts = 128,
    private readonly maxTotalBytes = 16 * 1024 * 1024,
  ) {
    if (!Number.isSafeInteger(maxArtifacts) || maxArtifacts < 1 || maxArtifacts > 10_000) {
      throw new Error("maxArtifacts must be an integer between 1 and 10000.");
    }
    if (
      !Number.isSafeInteger(maxTotalBytes) ||
      maxTotalBytes < MAX_PUBLIC_SVG_BYTES ||
      maxTotalBytes > 512 * 1024 * 1024
    ) {
      throw new Error("maxTotalBytes must be an integer between 512 KiB and 512 MiB.");
    }
  }

  create(portrait: Portrait): PublicArtworkReference | undefined {
    if (portrait.artwork.format !== "svg") return undefined;
    const content = validatePublicSvg(portrait.artwork.content);
    const opaqueId = createHash("sha256")
      .update(`${portrait.id}\u0000${content}`, "utf8")
      .digest("hex")
      .slice(0, 40);
    const etag = `"sha256-${createHash("sha256").update(content, "utf8").digest("base64url")}"`;
    const prior = this.artifacts.get(opaqueId);
    if (prior && prior.content !== content) throw new Error("Portrait artifact hash collision.");
    if (prior) {
      // Map preserves insertion order. Reinsert on access so eviction is true
      // LRU and a long-paused current portrait is refreshed by every projection.
      this.artifacts.delete(opaqueId);
      this.artifacts.set(opaqueId, prior);
    } else {
      const artifact = { opaqueId, content, etag };
      this.artifacts.set(opaqueId, artifact);
      this.totalBytes += Buffer.byteLength(content, "utf8");
      while (this.artifacts.size > this.maxArtifacts || this.totalBytes > this.maxTotalBytes) {
        const oldest = this.artifacts.keys().next().value as string | undefined;
        if (!oldest) break;
        const removed = this.artifacts.get(oldest);
        if (removed) this.totalBytes -= Buffer.byteLength(removed.content, "utf8");
        this.artifacts.delete(oldest);
      }
    }
    return {
      id: opaqueId,
      cycle: portrait.cycle,
      format: portrait.artwork.format,
      createdAt: portrait.createdAt,
      width: portrait.artwork.width,
      height: portrait.artwork.height,
      url: `/api/v1/portraits/${opaqueId}.svg`,
    };
  }

  get(opaqueId: string): PortraitArtifact | undefined {
    if (!/^[a-f0-9]{40}$/.test(opaqueId)) return undefined;
    const artifact = this.artifacts.get(opaqueId);
    if (artifact) {
      this.artifacts.delete(opaqueId);
      this.artifacts.set(opaqueId, artifact);
    }
    return artifact;
  }

  assertAvailable(opaqueIds: readonly string[]): void {
    const missing = opaqueIds.find((opaqueId) => !this.artifacts.has(opaqueId));
    if (missing) {
      throw new Error(
        "Public portrait cache capacity cannot hold one complete society projection.",
      );
    }
  }
}
