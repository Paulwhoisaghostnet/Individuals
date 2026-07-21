import { SocietyRuntime } from "../software/individual/runtime/societyRuntime";

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
  field: string,
): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1_000) {
    throw new Error(`${field} must be an integer of at least 1000 milliseconds.`);
  }
  return parsed;
};

const main = async (): Promise<void> => {
  const intervalMs = parsePositiveInteger(
    process.env.INDIVIDUALS_DEMO_CYCLE_INTERVAL_MS,
    5_000,
    "INDIVIDUALS_DEMO_CYCLE_INTERVAL_MS",
  );
  const dataDir = process.env.INDIVIDUALS_DEMO_DATA_DIR ?? ".data/demo-individuals";
  const runtime = new SocietyRuntime({ dataDir, cycleIntervalOverrideMs: intervalMs });

  process.stdout.write(
    `Individuals society demo\n` +
      `mode: ${process.env.LLM_API_KEY || process.env.LLM_API_KEY_FILE ? "provider-backed with procedural fallback" : "procedural"}\n` +
      `cadence: ${intervalMs} ms\n` +
      `state: ${dataDir}\n\n`,
  );

  await runtime.start();
  let stopping: Promise<void> | undefined;
  let lastEventKey = "";
  const reporter = setInterval(() => {
    const event = runtime.getHealthMonitor().getRecentEvents(1)[0];
    if (!event) return;
    const key = `${event.timestamp}:${event.individualId}:${event.type}:${event.cycle ?? 0}`;
    if (key === lastEventKey) return;
    lastEventKey = key;
    process.stdout.write(
      `[${event.timestamp}] ${event.individualId} ${event.type}` +
        `${event.cycle === undefined ? "" : ` cycle=${event.cycle}`}\n`,
    );
  }, 1_000);

  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      clearInterval(reporter);
      await runtime.stop({ drain: true, timeoutMs: 30_000 });
    })();
    return stopping;
  };
  const onSignal = (): void => {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    void stop().then(
      () => {
        process.stdout.write("Individuals society demo stopped.\n");
        process.exitCode = 0;
      },
      () => {
        process.stderr.write("Individuals society demo did not stop cleanly.\n");
        process.exitCode = 1;
      },
    );
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup failure.";
  process.stderr.write(`Individuals society demo failed: ${message}\n`);
  process.exitCode = 1;
});
