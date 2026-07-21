import type { TelemetryEvent } from "../observability/healthMonitor";

export type EventSubscriber = (sseChunk: string, eventName: string, data: unknown) => void;

export class EventStreamBridge {
  private readonly subscribers = new Set<EventSubscriber>();

  constructor(
    private readonly maxSubscribers = 128,
    private readonly maxEventBytes = 2_000_000,
  ) {
    if (!Number.isSafeInteger(maxSubscribers) || maxSubscribers < 1 || maxSubscribers > 10_000) {
      throw new Error("maxSubscribers must be an integer between 1 and 10000.");
    }
    if (!Number.isSafeInteger(maxEventBytes) || maxEventBytes < 1_024 || maxEventBytes > 8_000_000) {
      throw new Error("maxEventBytes must be an integer between 1024 and 8000000.");
    }
  }

  subscribe(listener: EventSubscriber): () => void {
    if (!this.subscribers.has(listener) && this.subscribers.size >= this.maxSubscribers) {
      throw new Error("SSE subscriber capacity is exhausted.");
    }
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  unsubscribe(listener: EventSubscriber): void {
    this.subscribers.delete(listener);
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  formatSseMessage(eventName: string, data: unknown): string {
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(eventName)) {
      throw new Error("SSE event name is invalid.");
    }
    let payload: string;
    try {
      const serialized = typeof data === "string" ? data : JSON.stringify(data);
      if (typeof serialized !== "string") throw new Error("not serializable");
      payload = serialized;
    } catch {
      throw new Error("SSE event payload is not serializable.");
    }
    if (new TextEncoder().encode(payload).byteLength > this.maxEventBytes) {
      throw new Error("SSE event payload exceeds its byte limit.");
    }
    const dataLines = payload.split(/\r\n|\r|\n/).map((line) => `data: ${line}`).join("\n");
    return `event: ${eventName}\n${dataLines}\n\n`;
  }

  broadcast(eventName: string, data: unknown): void {
    if (this.subscribers.size === 0) return;
    const sseChunk = this.formatSseMessage(eventName, data);
    for (const listener of this.subscribers) {
      try {
        listener(sseChunk, eventName, data);
      } catch {
        // Prevent subscriber error from breaking broadcast
      }
    }
  }

  handleTelemetryEvent(event: TelemetryEvent): void {
    this.broadcast(event.type, {
      timestamp: event.timestamp,
      individualId: event.individualId,
      cycle: event.cycle,
      latencyMs: event.latencyMs,
      error: event.error,
    });
  }
}
