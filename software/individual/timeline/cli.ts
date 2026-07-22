import { fileURLToPath } from "node:url";
import * as path from "node:path";

import {
  sanitizeTimelineOperatorText,
  TimelineExportError,
  timelineErrorMessage,
} from "./errors";
import { exportTimeline, type ExportTimelineOptions } from "./exportTimeline";
import { PRIVATE_MEMORY_EXPORT_ACKNOWLEDGEMENT } from "./timelineTypes";

export const TIMELINE_CLI_USAGE = `Usage:
  node --import tsx software/individual/timeline/cli.ts [options]

Options:
  --data-dir <path>                 Runtime data directory (default: INDIVIDUALS_DATA_DIR,
                                    then .data/individuals)
  --output <path.html>              Atomic output path (default: <data-dir>/exports/timeline.html)
  --individual <id>                 Export one Individual; repeat to select several
  --max-self-portraits <1-9>        Bound the retained self-portrait view
  --max-peer-portraits <0-16>       Bound the persisted peer-drawing view
  --include-private-memory <phrase> DANGEROUS: include private narrative memory only
                                    when <phrase> is exactly:
                                    ${PRIVATE_MEMORY_EXPORT_ACKNOWLEDGEMENT}
  --help                            Show this help

Private memory is excluded by default and the memory files are not read at all.
The resulting HTML is standalone, script-free, network-free, and written mode 0600.`;

export interface ParsedTimelineCli {
  readonly help: boolean;
  readonly options: ExportTimelineOptions;
}

const optionValue = (
  args: readonly string[],
  index: number,
  name: string,
): { readonly value: string; readonly nextIndex: number } => {
  const argument = args[index];
  const prefix = `${name}=`;
  if (argument.startsWith(prefix)) {
    const value = argument.slice(prefix.length);
    if (value.length === 0) throw new TimelineExportError("INVALID_ARGUMENT", `${name} requires a value.`);
    return { value, nextIndex: index };
  }
  const value = args[index + 1];
  if (argument !== name || value === undefined || value.startsWith("--")) {
    throw new TimelineExportError("INVALID_ARGUMENT", `${name} requires a value.`);
  }
  return { value, nextIndex: index + 1 };
};

const integerValue = (value: string, name: string): number => {
  if (!/^\d+$/.test(value)) {
    throw new TimelineExportError("INVALID_ARGUMENT", `${name} must be a non-negative integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new TimelineExportError("INVALID_ARGUMENT", `${name} is outside the safe integer range.`);
  }
  return parsed;
};

export const parseTimelineCliArgs = (args: readonly string[]): ParsedTimelineCli => {
  const selectedIds: string[] = [];
  const options: {
    dataDir?: string;
    outputPath?: string;
    maxSelfPortraits?: number;
    maxPeerPortraits?: number;
    privateMemoryAcknowledgement?: string;
  } = {};
  const seen = new Set<string>();
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      help = true;
      continue;
    }
    const name = argument.split("=", 1)[0];
    if (name === "--individual") {
      const parsed = optionValue(args, index, name);
      selectedIds.push(parsed.value);
      index = parsed.nextIndex;
      continue;
    }
    const supported = new Set([
      "--data-dir",
      "--output",
      "--max-self-portraits",
      "--max-peer-portraits",
      "--include-private-memory",
    ]);
    if (!supported.has(name)) {
      throw new TimelineExportError("INVALID_ARGUMENT", `Unknown timeline option "${argument}".`);
    }
    if (seen.has(name)) {
      throw new TimelineExportError("INVALID_ARGUMENT", `Timeline option "${name}" was supplied twice.`);
    }
    seen.add(name);
    const parsed = optionValue(args, index, name);
    index = parsed.nextIndex;
    if (name === "--data-dir") options.dataDir = parsed.value;
    if (name === "--output") options.outputPath = parsed.value;
    if (name === "--max-self-portraits") {
      options.maxSelfPortraits = integerValue(parsed.value, name);
    }
    if (name === "--max-peer-portraits") {
      options.maxPeerPortraits = integerValue(parsed.value, name);
    }
    if (name === "--include-private-memory") {
      options.privateMemoryAcknowledgement = parsed.value;
    }
  }
  return {
    help,
    options: {
      ...options,
      individualIds: selectedIds.length > 0 ? selectedIds : undefined,
    },
  };
};

export interface TimelineCliIo {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

export const runTimelineCli = async (
  args: readonly string[],
  io: TimelineCliIo = {
    stdout: (message) => console.log(message),
    stderr: (message) => console.error(message),
  },
): Promise<number> => {
  try {
    const parsed = parseTimelineCliArgs(args);
    if (parsed.help) {
      io.stdout(TIMELINE_CLI_USAGE);
      return 0;
    }
    const result = await exportTimeline(parsed.options);
    io.stdout(sanitizeTimelineOperatorText(
      `Wrote ${result.portraitCount} validated portraits for ${result.individualCount} Individuals to ${result.outputPath} (${result.byteLength} bytes${result.includesPrivateMemory ? ", PRIVATE MEMORY INCLUDED" : ""}).`,
    ));
    return 0;
  } catch (error) {
    const prefix = error instanceof TimelineExportError ? `[${error.code}] ` : "";
    io.stderr(sanitizeTimelineOperatorText(
      `Timeline export failed: ${prefix}${timelineErrorMessage(error)}`,
    ));
    return 1;
  }
};

const directEntry = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (directEntry && directEntry === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await runTimelineCli(process.argv.slice(2));
}
