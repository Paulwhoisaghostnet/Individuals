export type RuntimeRevisionListener = (revision: number) => void;

/** Bounded, failure-isolated revision fan-out for HTTP/SSE adapters. */
export class RuntimeRevisionPublisher {
  private readonly listeners = new Set<RuntimeRevisionListener>();
  private revision = 0;

  constructor(private readonly maxSubscribers = 256) {
    if (
      !Number.isSafeInteger(maxSubscribers) ||
      maxSubscribers < 1 ||
      maxSubscribers > 10_000
    ) {
      throw new Error("maxRevisionSubscribers must be an integer between 1 and 10000.");
    }
  }

  get current(): number {
    return this.revision;
  }

  subscribe(listener: RuntimeRevisionListener): () => void {
    if (this.listeners.has(listener)) return () => this.listeners.delete(listener);
    if (this.listeners.size >= this.maxSubscribers) {
      throw new Error("Runtime revision subscriber capacity is exhausted.");
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  bump(): void {
    this.revision += 1;
    for (const listener of this.listeners) {
      try {
        listener(this.revision);
      } catch {
        // One display/telemetry observer cannot disrupt runtime state changes.
      }
    }
  }
}
