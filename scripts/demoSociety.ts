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

  const runtime = new SocietyRuntime({ dataDir: ".data/demo-individuals" });
  console.log("Initializing SocietyRuntime for Iris, Morrow, and Sable...\n");

  const individuals = ["iris", "morrow", "sable"];

  for (let c = 1; c <= 3; c++) {
    console.log(`--- [ CYCLE ${c} ] ---`);
    for (const id of individuals) {
      process.stdout.write(`Executing cycle for ${id.toUpperCase()}... `);
      await runtime.runSingleCycle(id);
      const status = await runtime.getStatus(id);
      console.log(`DONE (Cycle ${status?.snapshot.state.cycle}, Health: ${status?.health.state})`);
      if (status?.snapshot.state.reflection) {
        console.log(`  └─ Reflection: "${status.snapshot.state.reflection.perceivedSimilarityNote}"`);
      }
    }
    console.log();
  }

  console.log("=================================================");
  console.log(" Telemetry & Health Event Log (Recent 6 Events): ");
  console.log("=================================================");
  const events = runtime.getHealthMonitor().getRecentEvents(6);
  for (const event of events) {
    console.log(`[${event.timestamp}] ${event.individualId} -> ${event.type} (latency: ${event.latencyMs ?? 0}ms)`);
  }

  console.log("\nPersistent snapshots saved to: .data/demo-individuals/snapshots/");
  console.log("Persistent memories saved to:  .data/demo-individuals/memories/\n");
}

main().catch(console.error);
