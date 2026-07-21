import * as path from "node:path";

import { quarantineCorruptFile, readUtf8File, writeFileAtomically } from "../memory/fileSafety";
import { PersistenceSizeError } from "../memory/errors";
import {
  type InterSiteBridgeState,
  type InterSiteMessageStore,
  validateInterSiteBridgeState,
} from "./interSiteState";

export class FileInterSiteMessageStore implements InterSiteMessageStore {
  private readonly filePath: string;

  constructor(dataDir = ".data/individuals", localSiteId: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(localSiteId)) {
      throw new Error("localSiteId is invalid.");
    }
    this.filePath = path.join(dataDir, "inter-site", `${localSiteId}.json`);
  }

  async load(): Promise<InterSiteBridgeState | undefined> {
    let content: string | undefined;
    try {
      content = await readUtf8File(this.filePath, 4 * 1024 * 1024);
    } catch (error) {
      if (error instanceof PersistenceSizeError) {
        return quarantineCorruptFile(this.filePath, error);
      }
      throw error;
    }
    if (content === undefined) return undefined;
    try {
      return validateInterSiteBridgeState(JSON.parse(content));
    } catch (error) {
      return quarantineCorruptFile(this.filePath, error);
    }
  }

  async save(state: InterSiteBridgeState): Promise<void> {
    const validated = validateInterSiteBridgeState(state);
    await writeFileAtomically(this.filePath, `${JSON.stringify(validated)}\n`, {
      backupCount: 2,
    });
  }
}
