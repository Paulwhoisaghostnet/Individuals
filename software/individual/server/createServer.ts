import * as http from "node:http";

import { RuntimeControlError } from "../runtime/errors";
import type { SocietyRuntime } from "../runtime/societyRuntime";
import { ControlRoutes } from "./controlRoutes";
import { ControlSecurity } from "./controlSecurity";
import { gracefullyShutdown, type Flushable } from "./gracefulShutdown";
import { ApiRequestError, sendError } from "./httpResponses";
import { PortraitArtifactStore } from "./portraitArtifacts";
import { PublicRoutes } from "./publicRoutes";

export type { Flushable } from "./gracefulShutdown";

export interface IndividualsServerOptions {
  readonly runtime: SocietyRuntime;
  readonly host?: string;
  readonly port?: number;
  readonly curatorToken?: string;
  readonly allowedOrigins?: readonly string[];
  readonly heartbeatIntervalMs?: number;
  readonly maxSseClients?: number;
  readonly artifacts?: PortraitArtifactStore;
  readonly flushables?: readonly Flushable[];
  readonly now?: () => Date;
  readonly shutdownDrainTimeoutMs?: number;
  readonly shutdownFlushTimeoutMs?: number;
  readonly shutdownListenerTimeoutMs?: number;
}

export interface IndividualsServerHandle {
  readonly server: http.Server;
  readonly runtime: SocietyRuntime;
  start(): Promise<{ readonly host: string; readonly port: number }>;
  stop(): Promise<void>;
}

export const createIndividualsServer = (
  options: IndividualsServerOptions,
): IndividualsServerHandle => {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4175;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Server port must be an integer between 0 and 65535.");
  }
  const now = options.now ?? (() => new Date());
  const publicRoutes = new PublicRoutes({
    runtime: options.runtime,
    artifacts: options.artifacts,
    now,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    maxSseClients: options.maxSseClients,
  });
  const controlRoutes = new ControlRoutes(
    options.runtime,
    new ControlSecurity(options.curatorToken, options.allowedOrigins ?? [], now),
    () => publicRoutes.societyDto(),
  );
  let acceptingRequests = false;
  let started = false;
  let stopPromise: Promise<void> | undefined;

  const server = http.createServer(async (request, response) => {
    try {
      if (!acceptingRequests) {
        response.setHeader("Connection", "close");
        sendError(response, 503, "shutting_down", "The runtime is not accepting requests.", true);
        return;
      }
      const pathname = new URL(request.url ?? "/", "http://runtime.invalid").pathname;
      if (await publicRoutes.handle(pathname, request, response)) return;
      if (pathname.startsWith("/api/v1/controls/")) {
        await controlRoutes.handle(pathname, request, response);
        return;
      }
      sendError(response, 404, "not_found", "Route was not found.");
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
      } else if (error instanceof ApiRequestError) {
        sendError(response, error.status, error.code, error.message, error.retryable);
      } else if (error instanceof RuntimeControlError) {
        const status = error.code === "UNKNOWN_INDIVIDUAL" ? 404 : error.retryable ? 409 : 400;
        sendError(response, status, error.code.toLowerCase(), error.message, error.retryable);
      } else {
        sendError(response, 500, "internal_error", "The runtime could not complete the request.", true);
      }
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;
  server.on("clientError", (_error, socket) => {
    if (!socket.destroyed) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  return {
    server,
    runtime: options.runtime,
    async start() {
      if (started) {
        const current = server.address();
        if (!current || typeof current === "string") throw new Error("Server has no TCP address.");
        return { host, port: current.port };
      }
      if (stopPromise) throw new Error("A stopped server handle cannot be restarted.");
      await options.runtime.start();
      try {
        publicRoutes.start();
        acceptingRequests = true;
        await new Promise<void>((resolve, reject) => {
          const onError = (error: Error): void => reject(error);
          server.once("error", onError);
          server.listen(port, host, () => {
            server.off("error", onError);
            resolve();
          });
        });
      } catch (error) {
        acceptingRequests = false;
        publicRoutes.stop();
        await options.runtime.stop({ drain: true });
        throw error;
      }
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Server has no TCP address.");
      started = true;
      return { host, port: address.port };
    },
    async stop() {
      if (stopPromise) return stopPromise;
      acceptingRequests = false;
      started = false;
      stopPromise = gracefullyShutdown({
        server,
        runtime: options.runtime,
        publicRoutes,
        flushables: options.flushables ?? [],
        drainTimeoutMs: options.shutdownDrainTimeoutMs ?? 30_000,
        flushTimeoutMs: options.shutdownFlushTimeoutMs ?? 10_000,
        listenerTimeoutMs: options.shutdownListenerTimeoutMs ?? 5_000,
      });
      return stopPromise;
    },
  };
};
