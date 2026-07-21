import { describe, expect, it } from "vitest";

import { HealthMonitor } from "../healthMonitor";
import { RotatingFileTelemetrySink } from "../rotatingFileTelemetry";

describe("bounded telemetry", () => {
  it("marks a deadline-fenced Individual unavailable immediately", () => {
    const monitor = new HealthMonitor(["iris"]);
    monitor.recordDeadlineExceeded("iris", 1, new Error("adapter never settled"));
    expect(monitor.getHealth("iris")).toMatchObject({
      state: "faulted",
      consecutiveFaults: 1,
      lastError: "cycle_deadline_exceeded",
    });
  });

  it("records fixed fault codes without inspecting or leaking hostile errors", () => {
    const captured: string[] = [];
    const monitor = new HealthMonitor(["iris"], {
      sink: {
        write(event) {
          captured.push(JSON.stringify(event));
        },
      },
    });
    const secret = "PRIVATE_PROMPT_CANARY /run/secrets/llm_api_key";
    const hostile = new Proxy(Object.create(null) as Record<string, unknown>, {
      getPrototypeOf() {
        throw new Error(secret);
      },
      get(_target, property) {
        if (property === Symbol.toPrimitive || property === "message") {
          throw new Error(secret);
        }
        return undefined;
      },
    });

    expect(() => monitor.recordFault("iris", 3, hostile)).not.toThrow();
    expect(monitor.getHealth("iris").lastError).toBe("cycle_execution_failed");
    expect(captured.join("\n")).not.toContain("PRIVATE_PROMPT_CANARY");
    expect(captured.join("\n")).not.toContain("/run/secrets");
  });

  it("reduces provider failures to an allowlisted category", () => {
    const monitor = new HealthMonitor(["iris"]);
    monitor.recordProviderFallback({
      individualId: "iris",
      cycle: 4,
      operation: "reflect",
      provider: "PRIVATE_PROVIDER_CANARY",
      category: "PRIVATE_CATEGORY_CANARY",
      retryable: false,
      error: {
        toString() {
          throw new Error("PRIVATE_ERROR_CANARY");
        },
      },
    });

    expect(monitor.getHealth("iris").lastError).toBe("provider_unknown");
    expect(JSON.stringify(monitor.getRecentEvents(10))).not.toMatch(/PRIVATE_.*CANARY/);
  });

  it("bounds configuration and contains hostile detail and sink values", async () => {
    expect(() => new HealthMonitor([], { maxEvents: Number.NaN })).toThrow(/maxEvents/);
    expect(() => new HealthMonitor([], { maxEvents: 1_000_001 })).toThrow(/maxEvents/);

    const revokedDetails = Proxy.revocable([], {});
    revokedDetails.revoke();
    const revokedSinkResult = Proxy.revocable({}, {});
    revokedSinkResult.revoke();
    const monitor = new HealthMonitor(["iris"], {
      sink: {
        write() {
          return revokedSinkResult.proxy as unknown as Promise<void>;
        },
      },
    });
    expect(() => monitor.recordAction("iris", "test", {
      publicValues: revokedDetails.proxy,
    })).not.toThrow();
    await Promise.resolve();
    expect(monitor.getDiagnostics().sinkFailures).toBe(1);
    expect(monitor.getRecentEvents(1)[0].details?.publicValues).toBe("[UNAVAILABLE]");
  });

  it("bounds subscribers and returns capacity when one unsubscribes", () => {
    const monitor = new HealthMonitor(["iris"], { maxSubscribers: 1 });
    const release = monitor.subscribe(() => undefined);
    expect(() => monitor.subscribe(() => undefined)).toThrow(/capacity/);
    release();
    expect(() => monitor.subscribe(() => undefined)).not.toThrow();
  });

  it("bounds in-memory history and isolates a failed sink", async () => {
    const monitor = new HealthMonitor(["iris"], {
      maxEvents: 2,
      sink: { async write() { throw new Error("disk unavailable"); } },
      now: () => new Date("2026-01-01T00:00:00Z"),
    });
    monitor.recordStart("iris", 1);
    monitor.recordComplete("iris", 1, 10);
    monitor.recordAction("iris", "pause");
    await Promise.resolve();
    expect(monitor.getRecentEvents(10)).toHaveLength(2);
    expect(monitor.getDiagnostics().droppedEvents).toBe(1);
    expect(monitor.getDiagnostics().sinkFailures).toBeGreaterThan(0);
  });

  it("drops telemetry at bounded queue pressure instead of growing closures indefinitely", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    class StalledSink extends RotatingFileTelemetrySink {
      protected override async append(): Promise<void> {
        await gate;
      }
    }
    const sink = new StalledSink("unused.jsonl", { maxPendingEvents: 2 });
    const event = {
      timestamp: "2026-01-01T00:00:00Z",
      individualId: "iris",
      type: "cycle_start" as const,
      cycle: 1,
    };
    const first = sink.write(event);
    void sink.write({ ...event, cycle: 2 });
    await sink.write({ ...event, cycle: 3 });
    expect(sink.getDiagnostics().droppedEvents).toBe(1);
    release();
    await first;
    await sink.flush();
  });

  it("restarts the pump when a write lands at the drain settlement boundary", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const written: number[] = [];
    class BoundarySink extends RotatingFileTelemetrySink {
      protected override async append(line: string): Promise<void> {
        const event = JSON.parse(line) as { cycle: number };
        if (event.cycle === 1) await gate;
        written.push(event.cycle);
      }
    }
    const sink = new BoundarySink("unused.jsonl");
    const base = {
      timestamp: "2026-01-01T00:00:00Z",
      individualId: "iris",
      type: "cycle_start" as const,
    };
    const first = sink.write({ ...base, cycle: 1 });
    const boundaryWrite = gate.then(() => sink.write({ ...base, cycle: 2 }));
    release();
    await Promise.all([first, boundaryWrite]);
    await sink.flush();
    expect(written).toEqual([1, 2]);
    expect(sink.getDiagnostics().queuedEvents).toBe(0);
  });

  it("retains a failed line and recovers it on flush", async () => {
    const written: number[] = [];
    class TransientFailureSink extends RotatingFileTelemetrySink {
      private failures = 1;
      protected override async append(line: string): Promise<void> {
        if (this.failures > 0) {
          this.failures -= 1;
          throw new Error("simulated rotation failure");
        }
        written.push((JSON.parse(line) as { cycle: number }).cycle);
      }
    }
    const sink = new TransientFailureSink("unused.jsonl");
    await expect(sink.write({
      timestamp: "2026-01-01T00:00:00Z",
      individualId: "iris",
      type: "cycle_start",
      cycle: 7,
    })).rejects.toThrow(/rotation failure/);
    expect(sink.getDiagnostics().queuedEvents).toBe(1);
    await sink.flush();
    expect(written).toEqual([7]);
    expect(sink.getDiagnostics()).toMatchObject({ queuedEvents: 0, writeFailures: 1 });
  });
});
