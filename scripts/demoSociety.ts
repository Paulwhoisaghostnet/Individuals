import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { SocietyRuntime } from "../software/individual/runtime/societyRuntime";

function loadEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

async function main() {
  loadEnv();
  console.log("=================================================");
  console.log("   INDIVIDUALS — Continuous Society Runtime Demo ");
  console.log("=================================================\n");

  if (process.env.LLM_API_KEY) {
    console.log(`[LLM Active] Connected to model: ${process.env.LLM_MODEL ?? "gpt-4o-mini"} at ${process.env.LLM_API_BASE ?? "https://api.openai.com/v1"}\n`);
  } else {
    console.log("[LLM Inactive] No LLM_API_KEY found; operating with Procedural Cognition Fallback.\n");
  }

  // Set 15-second cycle cadence interval override for continuous live exhibition demo
  const runtime = new SocietyRuntime({
    dataDir: ".data/demo-individuals",
    cycleIntervalOverrideMs: 15_000,
  });

  console.log("Starting continuous background runtime for Iris, Morrow, and Sable (15s cadence)...\n");
  await runtime.start();

  // Keep process running and log background events live
  setInterval(async () => {
    const events = runtime.getHealthMonitor().getRecentEvents(3);
    const lastEvent = events[events.length - 1];
    if (lastEvent) {
      console.log(`[${lastEvent.timestamp}] ${lastEvent.individualId.toUpperCase()} -> ${lastEvent.type} (cycle ${lastEvent.cycle ?? 0}, latency ${lastEvent.latencyMs ?? 0}ms)`);
    }
  }, 5000);
}

main().catch(console.error);
