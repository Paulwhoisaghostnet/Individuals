import type * as http from "node:http";

import type { SocietyRuntime } from "../runtime/societyRuntime";
import type { PublicRoutes } from "./publicRoutes";

export interface Flushable {
  flush(): Promise<void>;
}

const withTimeout = async <T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs} ms.`)), timeoutMs);
    timeout.unref();
  });
  try {
    return await Promise.race([operation, expired]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const beginClosingListener = (server: http.Server): Promise<void> => {
  if (!server.listening) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
};

export const gracefullyShutdown = async (input: {
  readonly server: http.Server;
  readonly runtime: SocietyRuntime;
  readonly publicRoutes: PublicRoutes;
  readonly flushables: readonly Flushable[];
  readonly drainTimeoutMs: number;
  readonly flushTimeoutMs: number;
  readonly listenerTimeoutMs: number;
}): Promise<void> => {
  // server.close() runs first: the TCP listener stops accepting new work while
  // existing requests and in-flight cycles are allowed to drain.
  const listenerClosed = beginClosingListener(input.server);
  input.publicRoutes.stop();
  let primaryError: unknown;
  try {
    await withTimeout(
      input.runtime.stop({ drain: true, timeoutMs: input.drainTimeoutMs }),
      input.drainTimeoutMs + 1_000,
      "Runtime drain",
    );
    for (const flushable of input.flushables) {
      await withTimeout(flushable.flush(), input.flushTimeoutMs, "Telemetry flush");
    }
  } catch (error) {
    primaryError = error;
  } finally {
    // Do not sever active HTTP work until runtime state and telemetry have had
    // their bounded drain opportunity. SSE clients were ended by stop().
    input.server.closeAllConnections();
    try {
      await withTimeout(listenerClosed, input.listenerTimeoutMs, "HTTP listener close");
    } catch (error) {
      primaryError ??= error;
    }
  }
  if (primaryError) throw primaryError;
};
