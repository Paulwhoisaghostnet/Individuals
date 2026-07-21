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
});
