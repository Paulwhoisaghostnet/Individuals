import type * as http from "node:http";

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export const securityHeaders = (response: http.ServerResponse): void => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
};

export const sendJson = (
  response: http.ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Readonly<Record<string, string>> = {},
): void => {
  securityHeaders(response);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  response.end(`${JSON.stringify(body)}\n`);
};

export const sendError = (
  response: http.ServerResponse,
  status: number,
  code: string,
  message: string,
  retryable = false,
  extraHeaders: Readonly<Record<string, string>> = {},
): void => {
  const body: ApiErrorBody = { error: { code, message, retryable } };
  sendJson(response, status, body, extraHeaders);
};

export const readJsonBody = async (
  request: http.IncomingMessage,
  maxBytes = 16 * 1024,
): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    size += chunk.length;
    if (size > maxBytes) throw new ApiRequestError(413, "body_too_large", "Request body is too large.");
    chunks.push(chunk);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiRequestError(400, "invalid_json", "Request body must be valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ApiRequestError(400, "invalid_body", "Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
};

export const assertExactKeys = (
  body: Record<string, unknown>,
  allowed: readonly string[],
): void => {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ApiRequestError(400, "unknown_field", `Unknown request field "${unknown[0]}".`);
  }
};
