import { createHash, timingSafeEqual } from "node:crypto";
import type * as http from "node:http";

import { ApiRequestError } from "./httpResponses";

const tokenMatches = (provided: string, configured: string): boolean => {
  const left = createHash("sha256").update(provided, "utf8").digest();
  const right = createHash("sha256").update(configured, "utf8").digest();
  return timingSafeEqual(left, right);
};

const parseBearer = (header: string | undefined): string | undefined => {
  const match = header ? /^Bearer ([^\s]+)$/.exec(header) : undefined;
  return match?.[1];
};

const normalizeOrigins = (origins: readonly string[]): Set<string> => {
  const normalized = new Set<string>();
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`Invalid allowed origin "${origin}".`);
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.origin !== origin) {
      throw new Error(`Allowed origin "${origin}" must be an exact HTTP(S) origin.`);
    }
    normalized.add(url.origin);
  }
  return normalized;
};

export class ControlSecurity {
  private readonly allowedOrigins: Set<string>;
  private globalWindowStartedAt = 0;
  private globalAttempts = 0;

  constructor(
    private readonly curatorToken: string | undefined,
    origins: readonly string[],
    private readonly now: () => Date,
    private readonly globalRequestLimit = 600,
  ) {
    if (curatorToken && Buffer.byteLength(curatorToken, "utf8") < 32) {
      throw new Error("Configured curator token must contain at least 32 bytes.");
    }
    if (
      !Number.isSafeInteger(globalRequestLimit) ||
      globalRequestLimit < 60 ||
      globalRequestLimit > 10_000
    ) {
      throw new Error("Control globalRequestLimit must be an integer between 60 and 10000.");
    }
    this.allowedOrigins = normalizeOrigins(origins);
  }

  authorize(request: http.IncomingMessage): string {
    const origin = this.requireOrigin(request);
    this.rateLimit();
    if (!this.curatorToken) {
      throw new ApiRequestError(503, "control_unavailable", "Curator controls are not configured.", true);
    }
    const provided = parseBearer(request.headers.authorization);
    if (!provided || !tokenMatches(provided, this.curatorToken)) {
      throw new ApiRequestError(401, "unauthorized", "Curator authorization failed.");
    }
    const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      throw new ApiRequestError(415, "unsupported_media_type", "Control requests require application/json.");
    }
    return origin;
  }

  requireOrigin(request: http.IncomingMessage): string {
    const origin = request.headers.origin;
    if (!origin || !this.allowedOrigins.has(origin)) {
      throw new ApiRequestError(403, "origin_not_allowed", "Control request origin is not allowed.");
    }
    return origin;
  }

  corsHeaders(origin: string): Record<string, string> {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    };
  }

  private rateLimit(): void {
    const currentTime = this.now().getTime();
    if (
      this.globalWindowStartedAt === 0 ||
      currentTime - this.globalWindowStartedAt >= 60_000 ||
      currentTime < this.globalWindowStartedAt
    ) {
      this.globalWindowStartedAt = currentTime;
      this.globalAttempts = 0;
    }
    this.globalAttempts += 1;
    if (this.globalAttempts > this.globalRequestLimit) {
      throw new ApiRequestError(
        429,
        "rate_limited",
        "The global control request ceiling was exceeded.",
        true,
      );
    }
  }
}
