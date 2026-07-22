import { createHash } from "node:crypto";

import type { Portrait } from "../core/model";
import type {
  PublicArtworkReference,
  PublicPortraitReferenceFactory,
} from "../runtime/publicProjection";
import {
  MAX_PUBLIC_SVG_BYTES,
  validatePublicSvg,
} from "../security/publicSvg";

export { MAX_PUBLIC_SVG_BYTES, validatePublicSvg } from "../security/publicSvg";

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
