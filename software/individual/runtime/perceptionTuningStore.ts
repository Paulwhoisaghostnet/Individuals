import * as path from "node:path";

import {
  quarantineCorruptFile,
  readUtf8File,
  writeFileAtomically,
} from "../memory/fileSafety";
import { PersistenceSizeError } from "../memory/errors";

export type PerceptionTuningMap = Readonly<Record<string, Readonly<Record<string, number>>>>;

export interface PerceptionTuningStore {
  load(signal?: AbortSignal): Promise<PerceptionTuningMap>;
  save(tunings: PerceptionTuningMap, signal?: AbortSignal): Promise<void>;
}

interface TuningDocument {
  readonly schemaVersion: 1;
  readonly updatedAt: string;
  readonly tunings: PerceptionTuningMap;
}

const validateTunings = (value: unknown): PerceptionTuningMap => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Perception tunings must be an object.");
  }
  const tunings: Record<string, Record<string, number>> = {};
  for (const [individualId, rawControls] of Object.entries(value)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(individualId)) {
      throw new Error(`Invalid Individual ID "${individualId}" in perception tuning.`);
    }
    if (typeof rawControls !== "object" || rawControls === null || Array.isArray(rawControls)) {
      throw new Error(`Perception tuning for "${individualId}" must be an object.`);
    }
    const controls: Record<string, number> = {};
    for (const [controlId, rawValue] of Object.entries(rawControls)) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(controlId)) {
        throw new Error(`Invalid perception control ID "${controlId}".`);
      }
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        throw new Error(`Perception control "${controlId}" must be finite.`);
      }
      controls[controlId] = rawValue;
    }
    tunings[individualId] = controls;
  }
  return tunings;
};

export class FilePerceptionTuningStore implements PerceptionTuningStore {
  private readonly filePath: string;

  constructor(
    dataDir = ".data/individuals",
    private readonly now: () => Date = () => new Date(),
  ) {
    this.filePath = path.join(dataDir, "configuration", "perception-tuning.json");
  }

  async load(signal?: AbortSignal): Promise<PerceptionTuningMap> {
    signal?.throwIfAborted();
    let content: string | undefined;
    try {
      content = await readUtf8File(this.filePath, 256 * 1024, signal);
    } catch (error) {
      if (error instanceof PersistenceSizeError) {
        return quarantineCorruptFile(this.filePath, error);
      }
      throw error;
    }
    signal?.throwIfAborted();
    if (content === undefined) return {};
    let tunings: PerceptionTuningMap;
    try {
      const parsed = JSON.parse(content) as Partial<TuningDocument>;
      if (parsed.schemaVersion !== 1) throw new Error("Unsupported tuning document schema.");
      if (typeof parsed.updatedAt !== "string" || !Number.isFinite(Date.parse(parsed.updatedAt))) {
        throw new Error("Tuning document timestamp is invalid.");
      }
      tunings = validateTunings(parsed.tunings);
    } catch (error) {
      return quarantineCorruptFile(this.filePath, error);
    }
    signal?.throwIfAborted();
    return tunings;
  }

  async save(tunings: PerceptionTuningMap, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const document: TuningDocument = {
      schemaVersion: 1,
      updatedAt: this.now().toISOString(),
      tunings: validateTunings(tunings),
    };
    await writeFileAtomically(this.filePath, `${JSON.stringify(document, null, 2)}\n`, {
      backupCount: 2,
      signal,
    });
  }
}

export class InMemoryPerceptionTuningStore implements PerceptionTuningStore {
  private tunings: PerceptionTuningMap = {};

  async load(signal?: AbortSignal): Promise<PerceptionTuningMap> {
    signal?.throwIfAborted();
    return structuredClone(this.tunings);
  }

  async save(tunings: PerceptionTuningMap, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const validated = structuredClone(validateTunings(tunings));
    signal?.throwIfAborted();
    this.tunings = validated;
  }
}
