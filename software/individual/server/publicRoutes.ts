import type * as http from "node:http";

import { EventStreamBridge } from "../runtime/eventStreamBridge";
import { createSocietyApiDto, type SocietyApiDto } from "../runtime/publicProjection";
import type { SocietyRuntime } from "../runtime/societyRuntime";
import { securityHeaders, sendError, sendJson } from "./httpResponses";
import {
  MAX_PUBLIC_SVG_BYTES,
  PortraitArtifactStore,
} from "./portraitArtifacts";

export interface PublicRoutesOptions {
  readonly runtime: SocietyRuntime;
  readonly artifacts?: PortraitArtifactStore;
  readonly now?: () => Date;
  readonly heartbeatIntervalMs?: number;
  readonly maxSseClients?: number;
}

const MAX_BASELINE_RECONCILIATIONS = 8;

export class PublicRoutes {
  private readonly runtime: SocietyRuntime;
  private readonly artifacts: PortraitArtifactStore;
  private readonly now: () => Date;
  private readonly heartbeatIntervalMs: number;
  private readonly maxSseClients: number;
  private readonly events: EventStreamBridge;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private unsubscribeRuntime: (() => void) | undefined;
  private projectionRunning = false;
  private projectionQueued = false;
  private readonly sseClosers = new Set<() => void>();

  constructor(options: PublicRoutesOptions) {
    this.runtime = options.runtime;
    const completeProjectionArtifacts =
      options.runtime.getSocietySize() * (options.runtime.getSocietySize() + 1);
    const retainedProjectionArtifacts = completeProjectionArtifacts * 2;
    this.artifacts = options.artifacts ?? new PortraitArtifactStore(
      Math.max(128, retainedProjectionArtifacts),
      Math.max(16 * 1024 * 1024, retainedProjectionArtifacts * MAX_PUBLIC_SVG_BYTES),
    );
    this.now = options.now ?? (() => new Date());
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 20_000;
    if (
      !Number.isSafeInteger(heartbeatIntervalMs) ||
      heartbeatIntervalMs < 5_000 ||
      heartbeatIntervalMs > 3_600_000
    ) {
      throw new Error("heartbeatIntervalMs must be an integer between 5000 and 3600000.");
    }
    const maxSseClients = options.maxSseClients ?? 64;
    if (!Number.isSafeInteger(maxSseClients) || maxSseClients < 1 || maxSseClients > 10_000) {
      throw new Error("maxSseClients must be an integer between 1 and 10000.");
    }
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.maxSseClients = maxSseClients;
    this.events = new EventStreamBridge(maxSseClients);
  }

  start(): void {
    if (this.unsubscribeRuntime) return;
    this.unsubscribeRuntime = this.runtime.subscribe(() => {
      void this.broadcastSnapshot().catch(() => undefined);
    });
    this.heartbeat = setInterval(() => {
      const summary = this.runtime.getSummary();
      if (!summary.startedAt) return;
      this.events.broadcast("society.heartbeat", {
        generatedAt: this.now().toISOString(),
        revision: String(summary.revision),
        startedAt: summary.startedAt,
      });
    }, this.heartbeatIntervalMs);
    this.heartbeat.unref();
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.unsubscribeRuntime?.();
    this.unsubscribeRuntime = undefined;
    for (const close of [...this.sseClosers]) close();
  }

  async societyDto(): Promise<SocietyApiDto> {
    const { statuses, summary } = await this.runtime.getConsistentState();
    const dto = createSocietyApiDto(
      statuses,
      summary,
      this.now().toISOString(),
      this.artifacts,
    );
    this.artifacts.assertAvailable(this.artifactIds(dto));
    return dto;
  }

  async handle(
    pathname: string,
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<boolean> {
    if (pathname === "/healthz") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        sendError(response, 405, "method_not_allowed", "Only GET and HEAD are supported.");
        return true;
      }
      this.sendProbe(request, response, 200, { status: "ok" });
      return true;
    }
    if (pathname === "/readyz") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        sendError(response, 405, "method_not_allowed", "Only GET and HEAD are supported.");
        return true;
      }
      const summary = this.runtime.getSummary();
      const participants = this.runtime.getHealthMonitor().getAllHealth();
      const available = participants.filter((health) => health.state !== "faulted").length;
      const ready = summary.lifecycle === "running" && available > 0;
      this.sendProbe(request, response, ready ? 200 : 503, {
        status: ready ? "ready" : "not_ready",
        lifecycle: summary.lifecycle,
        availableIndividuals: available,
        totalIndividuals: participants.length,
      });
      return true;
    }
    if (pathname === "/api/v1/society") {
      if (request.method !== "GET") {
        sendError(response, 405, "method_not_allowed", "Only GET is supported.");
        return true;
      }
      sendJson(response, 200, await this.societyDto());
      return true;
    }
    if (pathname === "/api/v1/society/events") {
      await this.openEventStream(request, response);
      return true;
    }
    const portraitMatch = /^\/api\/v1\/portraits\/([a-f0-9]{40})\.svg$/.exec(pathname);
    if (portraitMatch) {
      this.servePortrait(portraitMatch[1], request, response);
      return true;
    }
    return false;
  }

  private async openEventStream(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    if (request.method !== "GET") {
      sendError(response, 405, "method_not_allowed", "Only GET is supported.");
      return;
    }
    if (this.events.subscriberCount >= this.maxSseClients) {
      sendError(response, 503, "sse_capacity", "Event stream capacity is exhausted.", true);
      return;
    }
    securityHeaders(response);
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    let initializing = true;
    let closed = false;
    let lastRevision = -1;
    let observedRuntimeRevision = this.runtime.getSummary().revision;
    const buffered = new Map<string, { chunk: string; eventName: string; data: unknown }>();
    let unsubscribeEvents: (() => void) | undefined;
    let unsubscribeRuntime: (() => void) | undefined;

    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      unsubscribeEvents?.();
      unsubscribeRuntime?.();
      this.sseClosers.delete(close);
    };
    const close = (): void => {
      if (closed) return;
      try {
        response.write(this.events.formatSseMessage("society.shutdown", {
          generatedAt: this.now().toISOString(),
        }));
        response.end();
      } catch {
        response.destroy();
      } finally {
        cleanup();
      }
    };
    const write = (chunk: string): boolean => {
      if (closed || response.destroyed) {
        cleanup();
        return false;
      }
      try {
        if (response.write(chunk)) return true;
      } catch {
        // A disconnected client is isolated from every other stream.
      }
      cleanup();
      response.destroy();
      return false;
    };
    const eventRevision = (eventName: string, data: unknown): number | undefined => {
      // Heartbeats at the current revision are still liveness evidence and
      // must never be deduplicated as stale snapshots.
      if (eventName !== "society.snapshot") return undefined;
      if (typeof data !== "object" || data === null || !("revision" in data)) return undefined;
      const revision = Number((data as { revision?: unknown }).revision);
      return Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined;
    };
    const emitEvent = (chunk: string, eventName: string, data: unknown): void => {
      const revision = eventRevision(eventName, data);
      if (revision !== undefined && revision <= lastRevision) return;
      if (write(chunk) && revision !== undefined) lastRevision = revision;
    };

    unsubscribeEvents = this.events.subscribe((chunk, eventName, data) => {
      if (initializing) {
        // Snapshots and heartbeats supersede older events of the same type.
        // The generic cap keeps future event types from making initialization
        // an unbounded per-client queue.
        if (!buffered.has(eventName) && buffered.size >= 8) {
          const oldest = buffered.keys().next().value as string | undefined;
          if (oldest) buffered.delete(oldest);
        }
        buffered.set(eventName, { chunk, eventName, data });
      } else emitEvent(chunk, eventName, data);
    });
    unsubscribeRuntime = this.runtime.subscribe((revision) => {
      observedRuntimeRevision = Math.max(observedRuntimeRevision, revision);
    });
    this.sseClosers.add(close);
    request.once("close", cleanup);

    try {
      let snapshot = await this.societyDto();
      if (!write(this.events.formatSseMessage("society.snapshot", snapshot))) return;
      lastRevision = Number(snapshot.revision);

      // If state changed while the initial projection was being assembled,
      // reconcile before releasing buffered broadcasts. This closes the
      // subscribe/snapshot window without sending events before the baseline.
      let reconciliationPasses = 0;
      while (
        !closed &&
        observedRuntimeRevision > lastRevision &&
        reconciliationPasses < MAX_BASELINE_RECONCILIATIONS
      ) {
        reconciliationPasses += 1;
        snapshot = await this.societyDto();
        const revision = Number(snapshot.revision);
        if (revision <= lastRevision) break;
        if (!write(this.events.formatSseMessage("society.snapshot", snapshot))) return;
        lastRevision = revision;
      }
      const reconciliationStillNeeded = observedRuntimeRevision > lastRevision;
      initializing = false;
      for (const event of buffered.values()) {
        emitEvent(event.chunk, event.eventName, event.data);
        if (closed) return;
      }
      buffered.clear();
      if (reconciliationStillNeeded && !closed) {
        // Continuous mutation must not hold a new connection in initialization
        // forever. Rejoin the ordinary coalescing projection path after a
        // bounded number of synchronous catch-up passes.
        void this.broadcastSnapshot().catch(() => undefined);
      }
    } catch (error) {
      cleanup();
      response.destroy(error instanceof Error ? error : undefined);
      throw error;
    }
  }

  private servePortrait(
    opaqueId: string,
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): void {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendError(response, 405, "method_not_allowed", "Only GET and HEAD are supported.");
      return;
    }
    if (request.headers.range) {
      sendError(response, 416, "range_not_supported", "Range requests are not supported.");
      return;
    }
    const artifact = this.artifacts.get(opaqueId);
    if (!artifact) {
      sendError(response, 404, "portrait_not_found", "Portrait artifact was not found.");
      return;
    }
    securityHeaders(response);
    response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("ETag", artifact.etag);
    if (request.headers["if-none-match"] === artifact.etag) {
      response.writeHead(304);
      response.end();
      return;
    }
    response.writeHead(200);
    response.end(request.method === "HEAD" ? undefined : artifact.content);
  }

  private async broadcastSnapshot(): Promise<void> {
    if (this.projectionRunning) {
      this.projectionQueued = true;
      return;
    }
    this.projectionRunning = true;
    try {
      do {
        this.projectionQueued = false;
        this.events.broadcast("society.snapshot", await this.societyDto());
      } while (this.projectionQueued);
    } finally {
      this.projectionRunning = false;
    }
  }

  private artifactIds(dto: SocietyApiDto): readonly string[] {
    return dto.individuals.flatMap((individual) => [
      ...(individual.portraits.self ? [individual.portraits.self.id] : []),
      ...(individual.portraits.social ? [individual.portraits.social.id] : []),
      ...individual.portraits.peers.map((peer) => peer.artwork.id),
    ]);
  }

  private sendProbe(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    status: number,
    body: Readonly<Record<string, unknown>>,
  ): void {
    if (request.method === "HEAD") {
      securityHeaders(response);
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.writeHead(status);
      response.end();
      return;
    }
    sendJson(response, status, body);
  }
}
