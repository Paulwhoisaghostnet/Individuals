import * as fs from "node:fs/promises";

import { RotatingFileTelemetrySink } from "../observability/rotatingFileTelemetry";
import { SocietyRuntime } from "../runtime/societyRuntime";
import { createIndividualsServer } from "./createServer";

const parseInteger = (value: string | undefined, fallback: number, field: string): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} must be an integer.`);
  return parsed;
};

const readCuratorToken = async (): Promise<string | undefined> => {
  const tokenFile = process.env.INDIVIDUALS_CURATOR_TOKEN_FILE;
  if (tokenFile) {
    let token: string;
    let handle: fs.FileHandle | undefined;
    try {
      handle = await fs.open(tokenFile, "r");
      if ((await handle.stat()).size > 4_096) {
        throw new Error("Curator token file exceeds 4096 bytes.");
      }
      const data = await handle.readFile();
      if (data.byteLength > 4_096) throw new Error("Curator token file exceeds 4096 bytes.");
      token = data.toString("utf8").replace(/[\r\n]+$/, "");
    } catch (error) {
      throw new Error("Unable to read INDIVIDUALS_CURATOR_TOKEN_FILE.", { cause: error });
    } finally {
      try {
        await handle?.close();
      } catch {
        // Startup still fails through the sanitized read error above; a file
        // descriptor close failure must not replace it with host-specific prose.
      }
    }
    if (token.length === 0) throw new Error("INDIVIDUALS_CURATOR_TOKEN_FILE is empty.");
    return token;
  }
  return process.env.INDIVIDUALS_CURATOR_TOKEN;
};

export const startIndividualsServerFromEnvironment = async () => {
  const dataDir = process.env.INDIVIDUALS_DATA_DIR ?? ".data/individuals";
  const telemetry = new RotatingFileTelemetrySink(`${dataDir}/telemetry/runtime.jsonl`);
  const cycleInterval = process.env.INDIVIDUALS_CYCLE_INTERVAL_MS;
  const cycleTimeout = process.env.INDIVIDUALS_CYCLE_TIMEOUT_MS;
  const runtime = new SocietyRuntime({
    dataDir,
    cycleIntervalOverrideMs:
      cycleInterval === undefined
        ? undefined
        : parseInteger(cycleInterval, 0, "INDIVIDUALS_CYCLE_INTERVAL_MS"),
    cycleTimeoutMs:
      cycleTimeout === undefined
        ? undefined
        : parseInteger(cycleTimeout, 0, "INDIVIDUALS_CYCLE_TIMEOUT_MS"),
    health: { sink: telemetry },
  });
  const handle = createIndividualsServer({
    runtime,
    host: process.env.INDIVIDUALS_API_HOST ?? "127.0.0.1",
    port: parseInteger(process.env.INDIVIDUALS_API_PORT, 4175, "INDIVIDUALS_API_PORT"),
    curatorToken: await readCuratorToken(),
    allowedOrigins: (process.env.INDIVIDUALS_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    flushables: [telemetry],
  });
  await handle.start();

  const shutdown = async (): Promise<void> => {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await handle.stop();
  };
  const onSignal = (): void => {
    void shutdown().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  return handle;
};

const isDirectExecution = process.argv[1]?.endsWith("/software/individual/server/start.ts") ?? false;
if (isDirectExecution) {
  void startIndividualsServerFromEnvironment().catch(() => {
    // Startup errors can originate in secret-file, persistence, and provider
    // adapters. Do not echo their arbitrary messages or host paths to logs.
    process.stderr.write("Individuals API failed to start; inspect configuration and persisted-state quarantine.\n");
    process.exitCode = 1;
  });
}
