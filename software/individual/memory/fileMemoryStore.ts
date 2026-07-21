import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { MemoryEntry } from "../core/model";
import type { MemoryStore } from "../core/persistence/contracts";

export class FileMemoryStore implements MemoryStore {
  private readonly baseDir: string;

  constructor(baseDir = ".data/individuals/memories") {
    this.baseDir = baseDir;
  }

  private filePath(individualId: string): string {
    return path.join(this.baseDir, `${individualId}.json`);
  }

  private async loadEntries(individualId: string): Promise<MemoryEntry[]> {
    try {
      const data = await fs.readFile(this.filePath(individualId), "utf-8");
      return JSON.parse(data) as MemoryEntry[];
    } catch {
      return [];
    }
  }

  async recall(input: {
    individualId: string;
    limit: number;
    kind?: MemoryEntry["kind"];
  }): Promise<readonly MemoryEntry[]> {
    const entries = await this.loadEntries(input.individualId);
    const filtered = input.kind
      ? entries.filter((entry) => entry.kind === input.kind)
      : entries;
    return filtered.slice(-input.limit);
  }

  async remember(entries: readonly MemoryEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await fs.mkdir(this.baseDir, { recursive: true });

    // Group entries by individualId
    const grouped = new Map<string, MemoryEntry[]>();
    for (const entry of entries) {
      const list = grouped.get(entry.individualId) ?? [];
      list.push(entry);
      grouped.set(entry.individualId, list);
    }

    for (const [individualId, newEntries] of grouped.entries()) {
      const existing = await this.loadEntries(individualId);
      const combined = [...existing, ...newEntries];
      const targetPath = this.filePath(individualId);
      const tempPath = `${targetPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      await fs.writeFile(tempPath, JSON.stringify(combined, null, 2), "utf-8");
      await fs.rename(tempPath, targetPath);
    }
  }
}
