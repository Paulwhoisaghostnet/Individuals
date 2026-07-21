import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { IndividualSnapshot } from "../core/model";
import type { IndividualRepository } from "../core/persistence/contracts";

export class FileIndividualRepository implements IndividualRepository {
  private readonly baseDir: string;

  constructor(baseDir = ".data/individuals/snapshots") {
    this.baseDir = baseDir;
  }

  private filePath(id: string): string {
    return path.join(this.baseDir, `${id}.json`);
  }

  async load(individualId: string): Promise<IndividualSnapshot | undefined> {
    try {
      const data = await fs.readFile(this.filePath(individualId), "utf-8");
      return JSON.parse(data) as IndividualSnapshot;
    } catch {
      return undefined;
    }
  }

  async save(snapshot: IndividualSnapshot): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const targetPath = this.filePath(snapshot.manifest.id);
    const tempPath = `${targetPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const content = JSON.stringify(snapshot, null, 2);
    await fs.writeFile(tempPath, content, "utf-8");
    await fs.rename(tempPath, targetPath);
  }
}
