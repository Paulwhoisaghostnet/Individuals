import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SocietyRuntime } from "../societyRuntime";
import { InMemoryIndividualRepository, InMemoryMemoryStore } from "../../core/persistence/inMemory";
import { createTemplateManifest } from "../../core/template/manifest";

describe("SocietyRuntime (Continuous Runtime & Observability)", () => {
  let repository: InMemoryIndividualRepository;
  let memory: InMemoryMemoryStore;

  beforeEach(() => {
    repository = new InMemoryIndividualRepository();
    memory = new InMemoryMemoryStore();
  });

  it("starts runtime, runs single cycle across individuals, and tracks health telemetry", async () => {
    const irisManifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const morrowManifest = createTemplateManifest({ id: "morrow", displayName: "Morrow" });

    const runtime = new SocietyRuntime({
      manifests: [irisManifest, morrowManifest],
      repository,
      memory,
    });

    await runtime.runSingleCycle("iris");
    await runtime.runSingleCycle("morrow");

    const irisStatus = await runtime.getStatus("iris");
    const morrowStatus = await runtime.getStatus("morrow");

    expect(irisStatus?.snapshot.state.cycle).toBe(1);
    expect(morrowStatus?.snapshot.state.cycle).toBe(1);
    expect(irisStatus?.health.state).toBe("healthy");
    expect(morrowStatus?.health.state).toBe("healthy");

    const events = runtime.getHealthMonitor().getRecentEvents(10);
    expect(events.some((e) => e.type === "cycle_complete" && e.individualId === "iris")).toBe(true);
  });

  it("supports curatorial controls (pause, resume, tunePerception)", async () => {
    const irisManifest = createTemplateManifest({ id: "iris", displayName: "Iris" });

    const runtime = new SocietyRuntime({
      manifests: [irisManifest],
      repository,
      memory,
    });

    runtime.pause("iris");
    let status = await runtime.getStatus("iris");
    expect(status?.isPaused).toBe(true);

    runtime.resume("iris");
    status = await runtime.getStatus("iris");
    expect(status?.isPaused).toBe(false);

    runtime.tunePerception("iris", { "distortion-strength": 0.5 });
    const events = runtime.getHealthMonitor().getRecentEvents(5);
    expect(events.some((e) => e.type === "curatorial_action" && e.details?.action === "tune_perception")).toBe(true);
  });

  it("isolates faults when an individual cycle fails without crashing peer runtimes", async () => {
    const irisManifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const morrowManifest = createTemplateManifest({ id: "morrow", displayName: "Morrow" });

    const runtime = new SocietyRuntime({
      manifests: [irisManifest, morrowManifest],
      repository,
      memory,
    });

    // Induce error on Iris by tuning an invalid control value
    runtime.tunePerception("iris", { "invalid-control": 999 } as unknown as Record<string, number>);

    await runtime.runSingleCycle("iris"); // Should catch fault and not throw
    await runtime.runSingleCycle("morrow"); // Peer continues cleanly

    const irisStatus = await runtime.getStatus("iris");
    const morrowStatus = await runtime.getStatus("morrow");

    expect(irisStatus?.health.state).toBe("degraded");
    expect(irisStatus?.health.lastError).toContain("Unknown perception control");
    expect(morrowStatus?.health.state).toBe("healthy");
  });
});
