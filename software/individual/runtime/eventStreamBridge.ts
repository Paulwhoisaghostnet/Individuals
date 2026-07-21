import type { TelemetryEvent } from "../observability/healthMonitor";

export type EventSubscriber = (sseChunk: string) => void;

export class EventStreamBridge {
  private readonly subscribers = new Set<EventSubscriber>();

  subscribe(listener: EventSubscriber): () => void {
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
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    return `event: ${eventName}\ndata: ${payload}\n\n`;
  }

  broadcast(eventName: string, data: unknown): void {
    const sseChunk = this.formatSseMessage(eventName, data);
    for (const listener of this.subscribers) {
      try {
        listener(sseChunk);
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
