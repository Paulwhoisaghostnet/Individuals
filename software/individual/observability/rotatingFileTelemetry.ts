import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { TelemetryEvent, TelemetrySink } from "./healthMonitor";

export interface RotatingFileTelemetryOptions {
  readonly maxBytes?: number;
  readonly maxFiles?: number;
  readonly maxPendingEvents?: number;
}

/** Bounded JSONL telemetry sink. A partial final line is safe to discard after power loss. */
export class RotatingFileTelemetrySink implements TelemetrySink {
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private readonly maxPendingEvents: number;
  private readonly queue: string[] = [];
  private processing: Promise<void> | undefined;
  private droppedEvents = 0;
  private writeFailures = 0;

  constructor(
    private readonly filePath = ".data/individuals/telemetry/runtime.jsonl",
    options: RotatingFileTelemetryOptions = {},
  ) {
    this.maxBytes = this.boundedInteger(options.maxBytes, 2 * 1024 * 1024, 1_024, 64 * 1024 * 1024, "maxBytes");
    this.maxFiles = this.boundedInteger(options.maxFiles, 5, 1, 32, "maxFiles");
    this.maxPendingEvents = this.boundedInteger(options.maxPendingEvents, 256, 1, 4_096, "maxPendingEvents");
  }

  write(event: TelemetryEvent): Promise<void> {
    const line = `${JSON.stringify(event)}\n`;
    if (Buffer.byteLength(line, "utf8") > Math.min(this.maxBytes, 256 * 1024)) {
      this.droppedEvents += 1;
      return Promise.resolve();
    }
    if (this.queue.length >= this.maxPendingEvents) {
      this.droppedEvents += 1;
      return Promise.resolve();
    }
    this.queue.push(line);
    return this.ensurePump();
  }

  async flush(): Promise<void> {
    let retries = 0;
    while (this.processing || this.queue.length > 0) {
      try {
        await this.ensurePump();
        retries = 0;
      } catch (error) {
        retries += 1;
        if (retries >= 3) throw error;
      }
    }
  }

  getDiagnostics(): {
    readonly queuedEvents: number;
    readonly droppedEvents: number;
    readonly writeFailures: number;
  } {
    return {
      queuedEvents: this.queue.length,
      droppedEvents: this.droppedEvents,
      writeFailures: this.writeFailures,
    };
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const line = this.queue[0];
      if (line !== undefined) {
        await this.append(line);
        this.queue.shift();
      }
    }
  }

  private ensurePump(): Promise<void> {
    if (this.processing) return this.processing;
    const pump = this.drain();
    this.processing = pump;
    void pump.then(
      () => this.finishPump(pump, true),
      () => this.finishPump(pump, false),
    );
    return pump;
  }

  private finishPump(pump: Promise<void>, succeeded: boolean): void {
    if (this.processing !== pump) return;
    this.processing = undefined;
    if (!succeeded) {
      this.writeFailures += 1;
      return;
    }
    // A producer can enqueue after drain observed an empty queue but before
    // this settlement callback runs. Recheck after clearing the active pump.
    if (this.queue.length > 0) void this.ensurePump().catch(() => undefined);
  }

  private boundedInteger(
    value: number | undefined,
    fallback: number,
    minimum: number,
    maximum: number,
    field: string,
  ): number {
    const resolved = value ?? fallback;
    if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
      throw new Error(`${field} must be an integer between ${minimum} and ${maximum}.`);
    }
    return resolved;
  }

  protected async append(line: string): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    let currentSize = 0;
    try {
      currentSize = (await fs.stat(this.filePath)).size;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (currentSize + Buffer.byteLength(line, "utf8") > this.maxBytes) {
      await this.rotate();
    }
    const handle = await fs.open(this.filePath, "a", 0o600);
    try {
      await handle.writeFile(line, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async rotate(): Promise<void> {
    await fs.unlink(`${this.filePath}.${this.maxFiles}`).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    });
    for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
      try {
        await fs.rename(`${this.filePath}.${index}`, `${this.filePath}.${index + 1}`);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
    try {
      await fs.rename(this.filePath, `${this.filePath}.1`);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
}
