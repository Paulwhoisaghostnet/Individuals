import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FetchLlmClient,
  LlmProviderError,
  MAX_LLM_REQUEST_BYTES,
  MAX_LLM_RESPONSE_BYTES,
  MAX_LLM_SECRET_BYTES,
} from "../llmClient";

describe("FetchLlmClient secret handling", () => {
  const tempDirectories: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("gives a configured key file precedence and trims only its surrounding whitespace", async () => {
    const directory = mkdtempSync(join(tmpdir(), "individuals-llm-key-"));
    tempDirectories.push(directory);
    const file = join(directory, "key");
    writeFileSync(file, "  file-secret-with internal-space  \n", "utf8");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer file-secret-with internal-space",
      );
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new FetchLlmClient({
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "inferior-direct-key",
      apiKeyFile: file,
    });

    await expect(client.generateText({ systemPrompt: "system", userPrompt: "user" })).resolves.toBe(
      "ok",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails closed without disclosing an unreadable key path", () => {
    const secretPath = "/private/not-readable/SUPER_SECRET_KEY_FILE";
    let failure: unknown;
    try {
      new FetchLlmClient({
        baseUrl: "https://provider.invalid/v1",
        apiKey: "must-not-be-used-as-fallback",
        apiKeyFile: secretPath,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(LlmProviderError);
    expect((failure as LlmProviderError).category).toBe("configuration");
    expect((failure as Error).message).not.toContain(secretPath);
    expect((failure as Error).message).not.toContain("must-not-be-used");
  });

  it("does not expose provider response bodies in errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("SECRET_PROVIDER_DIAGNOSTIC_BODY", {
          status: 429,
          statusText: "provider supplied status text",
        }),
      ),
    );
    const client = new FetchLlmClient({
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "key",
    });

    const error = await client
      .generateText({ systemPrompt: "system", userPrompt: "user" })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect((error as LlmProviderError).category).toBe("rate-limit");
    expect((error as Error).message).not.toContain("SECRET_PROVIDER_DIAGNOSTIC_BODY");
    expect((error as Error).message).not.toContain("provider supplied status text");
  });

  it("rejects an oversized provider body before parsing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("not read", {
          status: 200,
          headers: { "Content-Length": String(MAX_LLM_RESPONSE_BYTES + 1) },
        }),
      ),
    );
    const client = new FetchLlmClient({
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "key",
    });

    const error = await client
      .generateText({ systemPrompt: "system", userPrompt: "user" })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect((error as LlmProviderError).category).toBe("invalid-response");
  });

  it("enforces the byte cap even when the provider omits Content-Length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x".repeat(MAX_LLM_RESPONSE_BYTES + 1), { status: 200 })),
    );
    const client = new FetchLlmClient({
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "key",
    });

    const error = await client
      .generateText({ systemPrompt: "system", userPrompt: "user" })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect((error as LlmProviderError).category).toBe("invalid-response");
  });

  it("rejects insecure remote endpoints and control-bearing provider values", () => {
    expect(
      () => new FetchLlmClient({ baseUrl: "http://provider.invalid/v1", apiKey: "key" }),
    ).toThrow(LlmProviderError);
    expect(
      () =>
        new FetchLlmClient({
          baseUrl: "http://127.0.0.1:1234/v1",
          apiKey: "key\r\nX-Injection: yes",
        }),
    ).toThrow(LlmProviderError);
    expect(
      () =>
        new FetchLlmClient({
          baseUrl: "http://127.0.0.1:1234/v1",
          apiKey: "key",
          model: "model\u0000shadow",
        }),
    ).toThrow(LlmProviderError);
  });

  it("reads key files with a hard byte cap", () => {
    const directory = mkdtempSync(join(tmpdir(), "individuals-llm-key-cap-"));
    tempDirectories.push(directory);
    const file = join(directory, "key");
    writeFileSync(file, "x".repeat(MAX_LLM_SECRET_BYTES + 1), "utf8");
    expect(
      () =>
        new FetchLlmClient({
          baseUrl: "http://127.0.0.1:1234/v1",
          apiKeyFile: file,
        }),
    ).toThrow(LlmProviderError);
  });

  it("caps the serialized request and fixes output tokens without following redirects", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      const body = JSON.parse(String(init?.body)) as { max_tokens: number };
      expect(body.max_tokens).toBe(333);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new FetchLlmClient({
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "key",
      maxOutputTokens: 333,
    });

    await expect(
      client.generateText({ systemPrompt: "system", userPrompt: "user" }),
    ).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledOnce();
    await expect(
      client.generateText({
        systemPrompt: "system",
        userPrompt: "x".repeat(MAX_LLM_REQUEST_BYTES),
      }),
    ).rejects.toMatchObject({ category: "configuration" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
