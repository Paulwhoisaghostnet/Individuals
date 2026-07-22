import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export interface LlmRequestOptions {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly temperature?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface LlmClient {
  generateText(options: LlmRequestOptions): Promise<string>;
  generateJson<T>(
    options: LlmRequestOptions & {
      validator?: (data: unknown) => data is T;
      repair?: (data: unknown) => unknown;
    },
  ): Promise<T>;
}

export interface FetchLlmClientConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly apiKeyFile?: string;
  readonly model?: string;
  readonly maxOutputTokens?: number;
}

export const MAX_LLM_RESPONSE_BYTES = 256 * 1024;
export const MAX_LLM_REQUEST_BYTES = 128 * 1024;
export const MAX_LLM_SECRET_BYTES = 8 * 1024;
export const MAX_LLM_MODEL_BYTES = 200;
const MAX_LLM_BASE_URL_BYTES = 2 * 1024;
const MAX_SECRET_FILE_PATH_CHARACTERS = 4_096;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;

export type LlmFailureCategory =
  | "configuration"
  | "authentication"
  | "rate-limit"
  | "timeout"
  | "unavailable"
  | "invalid-response"
  | "unknown";

export class LlmProviderError extends Error {
  readonly name = "LlmProviderError";

  constructor(
    readonly category: LlmFailureCategory,
    readonly retryable: boolean,
  ) {
    super(`LLM request failed (${category}).`);
  }
}

export const classifyLlmFailure = (
  error: unknown,
): { readonly category: LlmFailureCategory; readonly retryable: boolean } => {
  if (error instanceof LlmProviderError) {
    return { category: error.category, retryable: error.retryable };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { category: "timeout", retryable: true };
  }
  return { category: "unknown", retryable: false };
};

const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const validatePrintableValue = (
  value: string,
  maximumBytes: number,
  allowEmpty = false,
): string => {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length === 0) ||
    value !== value.trim() ||
    CONTROL_CHARACTERS.test(value) ||
    byteLength(value) > maximumBytes
  ) {
    throw new LlmProviderError("configuration", false);
  }
  return value;
};

const readBoundedSecretFile = (file: string): string => {
  if (
    typeof file !== "string" ||
    file.length === 0 ||
    file.length > MAX_SECRET_FILE_PATH_CHARACTERS ||
    CONTROL_CHARACTERS.test(file)
  ) {
    throw new LlmProviderError("configuration", false);
  }

  let descriptor: number | undefined;
  try {
    descriptor = openSync(file, "r");
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size > MAX_LLM_SECRET_BYTES) {
      throw new LlmProviderError("configuration", false);
    }
    const buffer = Buffer.alloc(MAX_LLM_SECRET_BYTES + 1);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.byteLength, 0);
    if (bytesRead > MAX_LLM_SECRET_BYTES) {
      throw new LlmProviderError("configuration", false);
    }
    return buffer.subarray(0, bytesRead).toString("utf8").trim();
  } catch (error) {
    if (error instanceof LlmProviderError) throw error;
    throw new LlmProviderError("configuration", false);
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The sanitized configuration error above is sufficient if closing fails.
      }
    }
  }
};

const loadApiKey = (config: FetchLlmClientConfig): string => {
  const file = config.apiKeyFile ?? process.env.LLM_API_KEY_FILE;
  if (file) {
    return validatePrintableValue(readBoundedSecretFile(file), MAX_LLM_SECRET_BYTES);
  }
  const value = config.apiKey ?? process.env.LLM_API_KEY ?? "";
  return validatePrintableValue(value, MAX_LLM_SECRET_BYTES, true);
};

const normalizeBaseUrl = (value: string): string => {
  validatePrintableValue(value, MAX_LLM_BASE_URL_BYTES);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LlmProviderError("configuration", false);
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  ) {
    throw new LlmProviderError("configuration", false);
  }
  return url.toString().replace(/\/$/, "");
};

const readBoundedResponseText = async (
  response: Response,
  maximumBytes = MAX_LLM_RESPONSE_BYTES,
): Promise<string> => {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new LlmProviderError("invalid-response", false);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new LlmProviderError("invalid-response", false);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
};

export class FetchLlmClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly loopback: boolean;

  constructor(config: FetchLlmClientConfig = {}) {
    this.baseUrl = normalizeBaseUrl(
      config.baseUrl ?? process.env.LLM_API_BASE ?? "https://api.openai.com/v1",
    );
    this.apiKey = loadApiKey(config);
    this.model = validatePrintableValue(
      config.model ?? process.env.LLM_MODEL ?? "gpt-4o-mini",
      MAX_LLM_MODEL_BYTES,
    );
    const requestedTokens = config.maxOutputTokens ?? 1_800;
    if (!Number.isInteger(requestedTokens) || requestedTokens < 128 || requestedTokens > 8_192) {
      throw new LlmProviderError("configuration", false);
    }
    this.maxOutputTokens = requestedTokens;
    this.loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
      new URL(this.baseUrl).hostname,
    );
  }

  async generateText(options: LlmRequestOptions): Promise<string> {
    if (!this.apiKey && !this.loopback) {
      throw new LlmProviderError("configuration", false);
    }
    if (
      typeof options.systemPrompt !== "string" ||
      typeof options.userPrompt !== "string" ||
      (options.temperature !== undefined &&
        (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2)) ||
      (options.timeoutMs !== undefined &&
        (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 120_000))
    ) {
      throw new LlmProviderError("configuration", false);
    }

    const requestBody = JSON.stringify({
      model: this.model,
      temperature: options.temperature ?? 0.7,
      max_tokens: this.maxOutputTokens,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt },
      ],
    });
    if (byteLength(requestBody) > MAX_LLM_REQUEST_BYTES) {
      throw new LlmProviderError("configuration", false);
    }

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: requestBody,
        redirect: "error",
        signal: controller.signal,
      });

      if (!response.ok) {
        const category: LlmFailureCategory =
          response.status === 401 || response.status === 403
            ? "authentication"
            : response.status === 429
              ? "rate-limit"
              : response.status >= 500
                ? "unavailable"
                : "invalid-response";
        throw new LlmProviderError(category, response.status === 429 || response.status >= 500);
      }

      let data: { choices?: { message?: { content?: string } }[] };
      try {
        data = JSON.parse(await readBoundedResponseText(response)) as typeof data;
      } catch (error) {
        if (error instanceof LlmProviderError) throw error;
        throw new LlmProviderError("invalid-response", false);
      }
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new LlmProviderError("invalid-response", false);
      }

      return content;
    } catch (error) {
      if (error instanceof LlmProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new LlmProviderError("timeout", true);
      }
      throw new LlmProviderError("unavailable", true);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  async generateJson<T>(
    options: LlmRequestOptions & {
      validator?: (data: unknown) => data is T;
      repair?: (data: unknown) => unknown;
    },
  ): Promise<T> {
    const rawText = await this.generateText({
      ...options,
      systemPrompt: `${options.systemPrompt}\n\nCRITICAL: Respond ONLY with valid JSON. Do not include markdown code blocks, explanations, or chain-of-thought text. All numeric values must be unquoted JSON numbers, never strings.`,
    });

    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new LlmProviderError("invalid-response", false);
    }

    if (options.repair) {
      try {
        parsed = options.repair(parsed);
      } catch {
        throw new LlmProviderError("invalid-response", false);
      }
    }

    if (options.validator && !options.validator(parsed)) {
      throw new LlmProviderError("invalid-response", false);
    }

    return parsed as T;
  }
}
