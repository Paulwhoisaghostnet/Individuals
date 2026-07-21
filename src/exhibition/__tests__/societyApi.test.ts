import { describe, expect, it, vi } from "vitest";
import { SocietyApiClient } from "../runtime/societyApi";
import type { RuntimeConfig } from "../runtime/types";
import { createRuntimeSnapshot } from "./runtimeFixture";

const config: RuntimeConfig = {
  apiBasePath: "/api/v1",
  mode: "auto",
  localFallbackAfterMs: 3_000,
  pollIntervalMs: 8_000,
};

describe("society API client", () => {
  it("invokes a browser-style fetch adapter without rebinding its receiver", async () => {
    const fetchMock = vi.fn(function (this: unknown) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(
        new Response(JSON.stringify(createRuntimeSnapshot()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const client = new SocietyApiClient(config, fetchMock as typeof fetch);

    await expect(client.getSnapshot()).resolves.toMatchObject({ apiVersion: "1" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps the ephemeral curator token out of URLs and request bodies", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ accepted: true, snapshot: createRuntimeSnapshot() }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new SocietyApiClient(config, fetchMock as typeof fetch);

    await client.pause("session-secret");

    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/controls/pause");
    expect(url).not.toContain("session-secret");
    expect(request.body).toBe("{}");
    expect(request.body).not.toContain("session-secret");
    expect(new Headers(request.headers).get("Authorization")).toBe("Bearer session-secret");
  });

  it("rejects malformed credentials before performing a request", async () => {
    const fetchMock = vi.fn();
    const client = new SocietyApiClient(config, fetchMock as typeof fetch);

    await expect(client.resume("bad\r\ntoken")).rejects.toThrow(/valid curator token/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-atomic batch shape before performing reset requests", async () => {
    const fetchMock = vi.fn();
    const client = new SocietyApiClient(config, fetchMock as typeof fetch);

    await expect(
      client.tunePerceptionBatch("session-secret", [
        { individualId: "iris", tuning: { "edge-gain": 0.5 } },
        { individualId: "iris", tuning: { "edge-gain": 0.7 } },
      ]),
    ).rejects.toThrow(/batch is invalid/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates snapshot responses before returning them", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ manifest: { id: "iris" }, state: { cycle: 99 } }), { status: 200 }),
    );
    const client = new SocietyApiClient(config, fetchMock as typeof fetch);

    await expect(client.getSnapshot()).rejects.toThrow(/unexpected field manifest/);
  });

  it("rejects a declared oversized response before allocating its body", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("{}", {
        status: 200,
        headers: { "Content-Length": "2000001" },
      }),
    );
    const client = new SocietyApiClient(config, fetchMock as typeof fetch);

    await expect(client.getSnapshot()).rejects.toThrow(/payload exceeds size limit/);
  });

  it("stops streamed responses when their actual byte count exceeds the limit", async () => {
    const oversizedChunk = new Uint8Array(1_100_000);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversizedChunk);
        controller.enqueue(oversizedChunk);
        controller.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
    const client = new SocietyApiClient(config, fetchMock as typeof fetch);

    await expect(client.getSnapshot()).rejects.toThrow(/payload exceeds size limit/);
  });
});
