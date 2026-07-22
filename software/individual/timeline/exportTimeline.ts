import * as path from "node:path";

import { writeFileAtomically } from "../memory/fileSafety";
import { TimelineExportError } from "./errors";
import { loadTimelineDocument, resolveTimelineDataDir } from "./loadTimeline";
import { renderValidatedTimelineHtml } from "./renderTimelineHtml";
import type { TimelineLoadOptions } from "./timelineTypes";

export const MAX_TIMELINE_HTML_BYTES = 32 * 1024 * 1024;

export interface ExportTimelineOptions extends TimelineLoadOptions {
  readonly outputPath?: string;
}

export interface TimelineExportResult {
  readonly outputPath: string;
  readonly byteLength: number;
  readonly individualCount: number;
  readonly portraitCount: number;
  readonly includesPrivateMemory: boolean;
}

const isWithin = (candidate: string, directory: string): boolean => {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const resolveOutputPath = (
  candidate: string | undefined,
  dataDir: string,
): string => {
  const value = candidate ?? path.join(dataDir, "exports", "timeline.html");
  if (
    value.length === 0 ||
    value.length > 4_096 ||
    value.includes("\u0000") ||
    path.extname(value).toLowerCase() !== ".html"
  ) {
    throw new TimelineExportError(
      "INVALID_ARGUMENT",
      "outputPath must be a non-empty .html path no longer than 4096 characters.",
    );
  }
  const resolved = path.resolve(value);
  const protectedDirectories = ["snapshots", "memories", "transactions"].map((directory) =>
    path.join(dataDir, directory)
  );
  if (protectedDirectories.some((directory) => isWithin(resolved, directory))) {
    throw new TimelineExportError(
      "INVALID_ARGUMENT",
      "Timeline output must remain outside snapshot, memory, transaction, and quarantine storage.",
    );
  }
  return resolved;
};

export const exportTimeline = async (
  options: ExportTimelineOptions = {},
): Promise<TimelineExportResult> => {
  const dataDir = resolveTimelineDataDir(options.dataDir);
  const outputPath = resolveOutputPath(options.outputPath, dataDir);
  const document = await loadTimelineDocument({ ...options, dataDir });
  const html = renderValidatedTimelineHtml(document);
  const byteLength = Buffer.byteLength(html, "utf8");
  if (byteLength > MAX_TIMELINE_HTML_BYTES) {
    throw new TimelineExportError(
      "OUTPUT_BOUNDS",
      `Timeline HTML exceeds the ${MAX_TIMELINE_HTML_BYTES}-byte output limit.`,
    );
  }
  try {
    await writeFileAtomically(outputPath, html, { mode: 0o600 });
  } catch (error) {
    throw new TimelineExportError("OUTPUT_WRITE", "Timeline HTML could not be written atomically.", {
      cause: error,
    });
  }
  return {
    outputPath,
    byteLength,
    individualCount: document.individuals.length,
    portraitCount: document.individuals.reduce(
      (total, individual) =>
        total +
        individual.selfPortraits.length +
        individual.peerPortraits.length +
        (individual.socialPortrait ? 1 : 0),
      0,
    ),
    includesPrivateMemory: document.includesPrivateMemory,
  };
};
