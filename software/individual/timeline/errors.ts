export type TimelineExportErrorCode =
  | "INVALID_ARGUMENT"
  | "INPUT_UNAVAILABLE"
  | "INPUT_BOUNDS"
  | "INPUT_INVALID"
  | "ARTWORK_UNSUPPORTED"
  | "ARTWORK_INVALID"
  | "OUTPUT_BOUNDS"
  | "OUTPUT_WRITE";

export class TimelineExportError extends Error {
  readonly name = "TimelineExportError";

  constructor(
    readonly code: TimelineExportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export const MAX_TIMELINE_OPERATOR_ERROR_CHARACTERS = 320;

const MAX_ERROR_INPUT_CHARACTERS = 4_096;
const ANSI_ESCAPE = /\u001B(?:\][^\u0007]*(?:\u0007|\u001B\\)|\[[0-?]*[ -/]*[@-~]|[@-_])|\u009B[0-?]*[ -/]*[@-~]/g;
const TERMINAL_CONTROLS = /[\u0000-\u001F\u007F-\u009F]/g;
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Single-line, terminal-safe projection for operator-visible error text. */
export const sanitizeTimelineOperatorText = (value: unknown): string => {
  const raw = typeof value === "string" ? value : String(value ?? "");
  const boundedInput = raw.slice(0, MAX_ERROR_INPUT_CHARACTERS);
  const normalized = boundedInput
    .replace(ANSI_ESCAPE, "")
    .replace(BIDI_CONTROLS, "")
    .replace(TERMINAL_CONTROLS, " ")
    .replace(/\s+/g, " ")
    .trim();
  const characters = [...normalized];
  if (characters.length <= MAX_TIMELINE_OPERATOR_ERROR_CHARACTERS) return normalized;
  return `${characters.slice(0, MAX_TIMELINE_OPERATOR_ERROR_CHARACTERS - 1).join("")}…`;
};

export const timelineErrorMessage = (error: unknown): string => {
  const message = sanitizeTimelineOperatorText(
    error instanceof Error ? error.message : "",
  );
  return message || "Timeline export failed for an unknown reason.";
};
