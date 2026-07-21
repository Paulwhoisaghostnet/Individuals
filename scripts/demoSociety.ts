import { SocietyRuntime } from "../software/individual/runtime/societyRuntime";

async function main() {
  console.log("=================================================");
  console.log("   INDIVIDUALS — Continuous Society Runtime Demo ");
  console.log("=================================================\n");

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
