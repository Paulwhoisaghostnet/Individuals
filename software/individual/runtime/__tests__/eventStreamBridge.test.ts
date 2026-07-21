import { describe, expect, it } from "vitest";
import { EventStreamBridge } from "../eventStreamBridge";

describe("EventStreamBridge (Streaming Exhibition)", () => {
  it("formats standard SSE event chunks", () => {
    const bridge = new EventStreamBridge();
    const chunk = bridge.formatSseMessage("cycle_complete", { individualId: "iris", cycle: 5 });

    expect(chunk).toContain("event: cycle_complete\n");
    expect(chunk).toContain('data: {"individualId":"iris","cycle":5}\n\n');
  });

  it("broadcasts telemetry events to subscribers", () => {
    const bridge = new EventStreamBridge();
    const received: string[] = [];

    const unsubscribe = bridge.subscribe((chunk) => {
      received.push(chunk);
    });

    expect(bridge.subscriberCount).toBe(1);

    bridge.handleTelemetryEvent({
      timestamp: "2026-01-01T00:00:00Z",
      individualId: "iris",
      type: "cycle_complete",
      cycle: 2,
      latencyMs: 350,
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toContain("event: cycle_complete");
    expect(received[0]).toContain('"individualId":"iris"');

    unsubscribe();
    expect(bridge.subscriberCount).toBe(0);
  });

  it("enforces subscriber and event byte bounds", () => {
    const bridge = new EventStreamBridge(1, 1_024);
    const release = bridge.subscribe(() => undefined);
    expect(() => bridge.subscribe(() => undefined)).toThrow(/capacity/);
    expect(() => bridge.formatSseMessage("oversized", "x".repeat(1_025))).toThrow(/byte limit/);
    release();
    expect(() => bridge.subscribe(() => undefined)).not.toThrow();
  });

  it("prefixes every line ending so a string cannot inject SSE fields", () => {
    const bridge = new EventStreamBridge();
    expect(bridge.formatSseMessage("safe", "first\revent: injected\ndata: forged")).toBe(
      "event: safe\ndata: first\ndata: event: injected\ndata: data: forged\n\n",
    );
    expect(() => bridge.formatSseMessage("safe", undefined)).toThrow(/not serializable/);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => bridge.formatSseMessage("safe", cyclic)).toThrow(/not serializable/);
  });
});
