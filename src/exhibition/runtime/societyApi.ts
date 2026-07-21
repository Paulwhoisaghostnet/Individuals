import type { RuntimeConfig, SocietyControlResponse, PublicSocietySnapshot } from "./types";
import {
  parseControlResponse,
  parseJsonText,
  parseSocietySnapshot,
  RuntimePayloadError,
} from "./validation";
import {
  CONTROL_REQUEST_TIMEOUT_MS,
  runWithRequestDeadline,
  SNAPSHOT_REQUEST_TIMEOUT_MS,
} from "./requestDeadline";

type FetchImplementation = typeof fetch;
const MAX_RESPONSE_BYTES = 2_000_000;

const safeServerError = (candidate: unknown): string | undefined => {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return undefined;
  const error = (candidate as Record<string, unknown>).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) return undefined;
  const message = (error as Record<string, unknown>).message;
  if (typeof message !== "string") return undefined;
  const normalized = message.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized.length > 0 && normalized.length <= 240 ? normalized : undefined;
};

export class SocietyApiError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, options: { readonly status?: number; readonly retryable?: boolean } = {}) {
    super(message);
    this.name = "SocietyApiError";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export class SocietyApiClient {
  readonly snapshotUrl: string;
  readonly eventStreamUrl: string;

  private readonly fetchImplementation: FetchImplementation;

  constructor(config: RuntimeConfig, fetchImplementation: FetchImplementation = fetch) {
    this.snapshotUrl = `${config.apiBasePath}/society`;
    this.eventStreamUrl = `${config.apiBasePath}/society/events`;
    this.fetchImplementation = fetchImplementation;
  }

  async getSnapshot(signal?: AbortSignal): Promise<PublicSocietySnapshot> {
    return runWithRequestDeadline(async (requestSignal) => {
      // Native Window.fetch is receiver-sensitive in Chromium. Calling a
      // stored function as `this.fetchImplementation(...)` supplies the API
      // client as its receiver and fails with "Illegal invocation" before a
      // request is sent. Detach the adapter before every invocation; injected
      // test and non-browser implementations retain the same contract.
      const request = this.fetchImplementation;
      const response = await request(this.snapshotUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        referrerPolicy: "same-origin",
        signal: requestSignal,
      });
      const payload = await this.readResponse(response);
      return parseSocietySnapshot(payload);
    }, signal, SNAPSHOT_REQUEST_TIMEOUT_MS);
  }

  pause(token: string, individualId?: string, signal?: AbortSignal): Promise<SocietyControlResponse> {
    return this.control("/controls/pause", token, individualId ? { individualId } : {}, signal);
  }

  resume(token: string, individualId?: string, signal?: AbortSignal): Promise<SocietyControlResponse> {
    return this.control("/controls/resume", token, individualId ? { individualId } : {}, signal);
  }

  tunePerception(
    token: string,
    individualId: string,
    tuning: Readonly<Record<string, number>>,
    signal?: AbortSignal,
  ): Promise<SocietyControlResponse> {
    if (!individualId || Object.values(tuning).some((value) => !Number.isFinite(value))) {
      return Promise.reject(new SocietyApiError("The perception update is invalid."));
    }
    return this.control("/controls/perception", token, { individualId, tuning }, signal);
  }

  tunePerceptionBatch(
    token: string,
    updates: readonly {
      readonly individualId: string;
      readonly tuning: Readonly<Record<string, number>>;
    }[],
    signal?: AbortSignal,
  ): Promise<SocietyControlResponse> {
    const uniqueIds = new Set(updates.map(({ individualId }) => individualId));
    const invalid =
      updates.length === 0 ||
      updates.length > 64 ||
      uniqueIds.size !== updates.length ||
      updates.some(
        ({ individualId, tuning }) =>
          !individualId || Object.values(tuning).some((value) => !Number.isFinite(value)),
      );
    if (invalid) return Promise.reject(new SocietyApiError("The perception batch is invalid."));
    return this.control("/controls/perception", token, { updates }, signal);
  }

  private async control(
    path: string,
    token: string,
    body: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<SocietyControlResponse> {
    const credential = token.trim();
    if (!credential || credential.length > 4_096 || /[\r\n]/.test(credential)) {
      throw new SocietyApiError("A valid curator token is required.", { status: 401 });
    }
    return runWithRequestDeadline(async (requestSignal) => {
      const request = this.fetchImplementation;
      const response = await request(`${this.snapshotUrl.replace(/\/society$/, "")}${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "same-origin",
        referrerPolicy: "no-referrer",
        signal: requestSignal,
      });
      const payload = await this.readResponse(response);
      return parseControlResponse(payload);
    }, signal, CONTROL_REQUEST_TIMEOUT_MS);
  }

  private async readResponse(response: Response): Promise<unknown> {
    let payload: unknown;
    try {
      payload = parseJsonText(await this.readBoundedText(response));
    } catch (error) {
      if (!response.ok) {
        throw new SocietyApiError(`Runtime request failed (${response.status}).`, {
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        });
      }
      if (error instanceof RuntimePayloadError) throw error;
      throw new SocietyApiError("The runtime returned an unreadable response.");
    }

    if (!response.ok) {
      throw new SocietyApiError(
        safeServerError(payload) ?? `Runtime request failed (${response.status}).`,
        {
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        },
      );
    }
    return payload;
  }

  private async readBoundedText(response: Response): Promise<string> {
    const declaredLength = response.headers.get("Content-Length");
    if (declaredLength !== null) {
      const bytes = Number(declaredLength);
      if (Number.isFinite(bytes) && bytes > MAX_RESPONSE_BYTES) {
        throw new RuntimePayloadError("payload exceeds size limit");
      }
    }
    if (!response.body) return "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const chunks: string[] = [];
    let receivedBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel("Society runtime response exceeded its public size limit.");
          throw new RuntimePayloadError("payload exceeds size limit");
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
      return chunks.join("");
    } finally {
      reader.releaseLock();
    }
  }
}
