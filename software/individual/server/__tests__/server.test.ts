import { Readable } from "node:stream";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as http from "node:http";

import { ProceduralCognitionSystem } from "../../cognition/proceduralCognition";
import { LlmCognitionSystem } from "../../cognition/llmCognition";
import type { LlmClient, LlmRequestOptions } from "../../cognition/llmClient";
import { INTENT_SYSTEM_PROMPT, REFLECTION_SYSTEM_PROMPT } from "../../cognition/prompts";
import { IndividualEngine } from "../../core/engine/IndividualEngine";
import type { Portrait } from "../../core/model";
import { InMemoryIndividualRepository, InMemoryMemoryStore } from "../../core/persistence/inMemory";
import { createTemplateManifest } from "../../core/template/manifest";
import { StableIdGenerator } from "../../core/systemUtilities";
import { EvidenceBodyAdaptationSystem } from "../../cognition/bodyAdaptation";
import { GenerativeDrawingSystem } from "../../drawing/generativeDrawing";
import { ProceduralPerceptionSystem } from "../../perception/proceduralPerception";
import { SocietyRuntime, type RuntimeEngineFactory } from "../../runtime/societyRuntime";
import type { RuntimeScheduler } from "../../runtime/scheduler";
import { ProceduralFeedbackCompositor } from "../../social-feedback/proceduralCompositor";
import { DeterministicRelationshipAdaptationSystem } from "../../social-feedback/relationshipAdaptation";
import { ControlRoutes } from "../controlRoutes";
import { ControlSecurity } from "../controlSecurity";
import { createIndividualsServer } from "../createServer";
import { PortraitArtifactStore, validatePublicSvg } from "../portraitArtifacts";
import { PublicRoutes } from "../publicRoutes";

const factory: RuntimeEngineFactory = (manifest, context) => {
  const ids = new StableIdGenerator();
  return new IndividualEngine(manifest, {
    cognition: new ProceduralCognitionSystem(),
    perception: new ProceduralPerceptionSystem(),
    drawing: new GenerativeDrawingSystem(ids),
    feedback: new ProceduralFeedbackCompositor(ids),
    relationships: new DeterministicRelationshipAdaptationSystem(),
    adaptation: new EvidenceBodyAdaptationSystem(),
    repository: context.repository,
    memory: context.memory,
    committer: context.committer,
    progress: context.progress,
    clock: { now: () => context.clock.now().toISOString() },
    ids,
    allowedPeerIds: context.allowedPeerIds,
  });
};

const dormantScheduler = (): RuntimeScheduler => ({
  setTimeout: () => ({}),
  clearTimeout: () => undefined,
});

class ResponseCapture {
  statusCode = 0;
  headersSent = false;
  readonly headers = new Map<string, string>();
  body = "";
  destroyed = false;

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
    return this;
  }

  writeHead(status: number, headers?: Record<string, string>): this {
    this.statusCode = status;
    this.headersSent = true;
    for (const [name, value] of Object.entries(headers ?? {})) this.setHeader(name, value);
    return this;
  }

  write(chunk: string | Buffer): boolean {
    this.body += chunk.toString();
    return true;
  }

  end(chunk?: string | Buffer): this {
    if (chunk) this.body += chunk.toString();
    this.headersSent = true;
    return this;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

const request = (
  method: string,
  headers: Record<string, string> = {},
  body = "",
): http.IncomingMessage => {
  const stream = Readable.from(body ? [Buffer.from(body)] : []);
  Object.assign(stream, {
    method,
    headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])),
    socket: { remoteAddress: "127.0.0.1" },
  });
  return stream as unknown as http.IncomingMessage;
};

describe("Individuals production HTTP boundaries", () => {
  const runtimes: SocietyRuntime[] = [];
  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.stop({ drain: false })));
  });

  const setup = async (
    artifacts = new PortraitArtifactStore(),
    selectedFactory: RuntimeEngineFactory = factory,
  ) => {
    const repository = new InMemoryIndividualRepository();
    const runtime = new SocietyRuntime({
      manifests: [
        createTemplateManifest({ id: "iris", displayName: "Iris" }),
        createTemplateManifest({ id: "morrow", displayName: "Morrow" }),
      ],
      repository,
      memory: new InMemoryMemoryStore(),
      engineFactory: selectedFactory,
      cycleIntervalOverrideMs: 60_000,
      cyclePolicy: { minimumCycleSpacingMs: 0 },
    });
    runtimes.push(runtime);
    await runtime.start();
    const publicRoutes = new PublicRoutes({ runtime, artifacts });
    return { runtime, artifacts, publicRoutes, repository };
  };

  it("rejects namespace-qualified and style-based active SVG surfaces", () => {
    const root = 'xmlns="http://www.w3.org/2000/svg"';
    expect(() => validatePublicSvg(
      `<svg ${root}><svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script></svg>`,
    )).toThrow(/unsafe|allowlisted/);
    expect(() => validatePublicSvg(
      `<svg ${root}><svg:foreignObject xmlns:svg="http://www.w3.org/2000/svg">hostile</svg:foreignObject></svg>`,
    )).toThrow(/unsafe|allowlisted/);
    expect(() => validatePublicSvg(
      `<svg ${root} style="background:url(https://attacker.example/pixel)"></svg>`,
    )).toThrow(/unsafe/);
    expect(() => validatePublicSvg(
      `<svg ${root} xmlns:evil="https://attacker.example"><text>hostile namespace</text></svg>`,
    )).toThrow(/unsafe|namespace/);
  });

  it("projects only the exact public schema and resolves opaque sandboxed peer artwork", async () => {
    const { runtime, publicRoutes } = await setup();
    await runtime.runSingleCycle("iris");
    await runtime.runSingleCycle("morrow");
    await runtime.runSingleCycle("iris");
    const dto = await publicRoutes.societyDto();
    expect(Object.keys(dto).sort()).toEqual(["apiVersion", "generatedAt", "individuals", "revision", "runtime"]);
    expect(JSON.stringify(dto)).not.toContain("privateNarrative");
    expect(JSON.stringify(dto)).not.toContain("selfConcept");

    const iris = dto.individuals.find((individual) => individual.id === "iris")!;
    expect(Object.keys(iris).sort()).toEqual([
      "cycle", "displayName", "embodiment", "id", "isPaused", "isRunningCycle",
      "perceptionTuning", "portraits", "publicReflection", "status", "updatedAt",
    ]);
    expect(iris.portraits.social).toBeDefined();
    expect(iris.portraits.peers).toHaveLength(1);
    const peer = iris.portraits.peers[0];
    expect(peer.artistId).toBe("morrow");
    expect(peer.artwork.url).toMatch(/^\/api\/v1\/portraits\/[a-f0-9]{40}\.svg$/);

    const response = new ResponseCapture();
    expect(await publicRoutes.handle(
      peer.artwork.url,
      request("GET"),
      response as unknown as http.ServerResponse,
    )).toBe(true);
    expect(response.statusCode).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(response.body).toContain("<svg");

    const consumedPeerId = peer.artwork.id;
    await runtime.runSingleCycle("morrow");
    const afterPendingAdvance = (await publicRoutes.societyDto()).individuals.find(
      (individual) => individual.id === "iris",
    )!;
    expect(afterPendingAdvance.portraits.social).toBeDefined();
    expect(afterPendingAdvance.portraits.peers.map(({ artwork }) => artwork.id)).toEqual([
      consumedPeerId,
    ]);
  });

  it("suppresses a legacy social composite when its exact source artwork is unavailable", async () => {
    const { runtime, publicRoutes, repository } = await setup();
    await runtime.runSingleCycle("iris");
    await runtime.runSingleCycle("morrow");
    await runtime.runSingleCycle("iris");
    const snapshot = (await repository.load("iris"))!;
    const { latestSocialPeerPortraits: _legacyOmission, ...legacyState } = snapshot.state;
    expect(_legacyOmission).toHaveLength(1);
    await repository.save({ ...snapshot, state: legacyState });

    const iris = (await publicRoutes.societyDto()).individuals.find(
      (individual) => individual.id === "iris",
    )!;
    expect(iris.portraits.social).toBeUndefined();
    expect(iris.portraits.peers).toEqual([]);

    await repository.save({
      ...snapshot,
      state: { ...snapshot.state, cycle: snapshot.state.cycle + 1 },
    });
    const stale = (await publicRoutes.societyDto()).individuals.find(
      (individual) => individual.id === "iris",
    )!;
    expect(stale.portraits.social).toBeUndefined();
    expect(stale.portraits.peers).toEqual([]);

    await repository.save({
      ...snapshot,
      state: {
        ...snapshot.state,
        latestSocialPortrait: {
          ...snapshot.state.latestSocialPortrait!,
          sourcePortraitIds: [],
        },
        latestSocialPeerPortraits: [],
      },
    });
    const emptySource = (await publicRoutes.societyDto()).individuals.find(
      (individual) => individual.id === "iris",
    )!;
    expect(emptySource.portraits.social).toBeUndefined();
    expect(emptySource.portraits.peers).toEqual([]);
  });

  it("rebuilds the exact causal portrait bundle from durable state after restart", async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "individuals-social-bundle-"));
    const manifests = [
      createTemplateManifest({ id: "iris", displayName: "Iris" }),
      createTemplateManifest({ id: "morrow", displayName: "Morrow" }),
    ];
    try {
      const first = new SocietyRuntime({
        manifests,
        dataDir,
        engineFactory: factory,
        scheduler: dormantScheduler(),
        cyclePolicy: { minimumCycleSpacingMs: 0 },
      });
      runtimes.push(first);
      await first.start();
      await first.runSingleCycle("iris");
      await first.runSingleCycle("morrow");
      await first.runSingleCycle("iris");
      const before = (await new PublicRoutes({ runtime: first }).societyDto()).individuals.find(
        (individual) => individual.id === "iris",
      )!;
      expect(before.portraits.social).toBeDefined();
      expect(before.portraits.peers).toHaveLength(1);
      await first.stop({ drain: true });

      const restarted = new SocietyRuntime({
        manifests,
        dataDir,
        engineFactory: factory,
        scheduler: dormantScheduler(),
        cyclePolicy: { minimumCycleSpacingMs: 0 },
      });
      runtimes.push(restarted);
      await restarted.start();
      const publicRoutes = new PublicRoutes({
        runtime: restarted,
        artifacts: new PortraitArtifactStore(),
      });
      const after = (await publicRoutes.societyDto()).individuals.find(
        (individual) => individual.id === "iris",
      )!;
      expect(after.portraits.social?.id).toBe(before.portraits.social?.id);
      expect(after.portraits.peers.map(({ artwork }) => artwork.id)).toEqual(
        before.portraits.peers.map(({ artwork }) => artwork.id),
      );

      for (const artwork of [after.portraits.social, ...after.portraits.peers.map(
        ({ artwork }) => artwork,
      )]) {
        const response = new ResponseCapture();
        await publicRoutes.handle(
          artwork!.url,
          request("GET"),
          response as unknown as http.ServerResponse,
        );
        expect(response.statusCode).toBe(200);
        expect(response.body).toContain("<svg");
      }
      await restarted.stop({ drain: true });
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it("never publishes provider-echoed private prose through state, DTOs, or SVG artifacts", async () => {
    const canary = "PRIVATE_PROMPT_CANARY_7fc93d";
    const providerOperations: Array<"formIntent" | "reflect"> = [];
    const fallback = new ProceduralCognitionSystem();
    const fallbackFormIntent = vi.spyOn(fallback, "formIntent");
    const fallbackReflect = vi.spyOn(fallback, "reflect");
    const client: LlmClient = {
      async generateText(): Promise<string> {
        throw new Error("unused");
      },
      async generateJson<T>(
        options: LlmRequestOptions & {
          validator?: (data: unknown) => data is T;
          repair?: (data: unknown) => unknown;
        },
      ): Promise<T> {
        let response: unknown;
        if (options.systemPrompt === INTENT_SYSTEM_PROMPT) {
          providerOperations.push("formIntent");
          response = {
            statement: canary,
            desiredQualities: [canary],
            visualInstructions: [canary],
            bodilyInstructions: [canary],
            bodyAdjustments: [],
          };
        } else if (options.systemPrompt === REFLECTION_SYSTEM_PROMPT) {
          providerOperations.push("reflect");
          response = {
            summary: canary,
            tensions: [canary],
            nextIntention: canary,
            memory: canary,
            intendedSignals: [canary],
            recurringPatterns: [canary],
            acceptedFeedback: [canary],
            rejectedFeedback: [canary],
            unresolvedQuestions: [canary],
            publicFragment: canary,
            physicalAssessment: {
              similarityDelta: 0,
              retainedFeatures: [canary],
              perceivedDifferences: [canary],
              nextBodilyAdjustment: canary,
              nextBodyAdjustments: [],
              geometry: { selfIdealDistance: 0.2, predictedIdealDistance: 0.2 },
            },
          };
        } else {
          throw new Error("Unexpected cognition prompt in privacy-boundary test.");
        }
        const repaired = options.repair ? options.repair(response) : response;
        if (options.validator && !options.validator(repaired)) {
          throw new Error("Cognition fixture failed its production validator.");
        }
        return repaired as T;
      },
    };
    const providerFactory: RuntimeEngineFactory = (manifest, context) => {
      const ids = new StableIdGenerator();
      return new IndividualEngine(manifest, {
        cognition: new LlmCognitionSystem({ client, fallbackSystem: fallback }),
        perception: new ProceduralPerceptionSystem(),
        drawing: new GenerativeDrawingSystem(ids),
        feedback: new ProceduralFeedbackCompositor(ids),
        relationships: new DeterministicRelationshipAdaptationSystem(),
        adaptation: new EvidenceBodyAdaptationSystem(),
        repository: context.repository,
        memory: context.memory,
        committer: context.committer,
        progress: context.progress,
        clock: { now: () => context.clock.now().toISOString() },
        ids,
        allowedPeerIds: context.allowedPeerIds,
      });
    };
    const { runtime, publicRoutes } = await setup(
      new PortraitArtifactStore(),
      providerFactory,
    );
    const result = await runtime.runSingleCycle("iris");
    const status = await runtime.getStatus("iris");

    expect(result.status).toBe("completed");
    expect(providerOperations).toEqual(["formIntent", "reflect"]);
    expect(fallbackFormIntent).not.toHaveBeenCalled();
    expect(fallbackReflect).not.toHaveBeenCalled();
    expect(status?.snapshot.state.lastReflection?.memory).toContain(canary);
    expect(status?.snapshot.state.lastReflection?.publicFragment).not.toContain(canary);
    expect(status?.snapshot.state.selfConcept.narrative).not.toContain(canary);
    expect(status?.snapshot.state.currentSelfPortrait?.statement).not.toContain(canary);

    const dto = await publicRoutes.societyDto();
    expect(JSON.stringify(dto)).not.toContain(canary);
    const selfUrl = dto.individuals.find((individual) => individual.id === "iris")!
      .portraits.self!.url;
    const response = new ResponseCapture();
    await publicRoutes.handle(
      selfUrl,
      request("GET"),
      response as unknown as http.ServerResponse,
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(canary);
  });

  it("does not present a retained older social portrait as current-cycle evidence", async () => {
    const { runtime, publicRoutes } = await setup();
    const results = [
      await runtime.runSingleCycle("iris"),
      await runtime.runSingleCycle("morrow"),
      await runtime.runSingleCycle("iris"),
    ];
    expect({
      results: results.map((result) => result.status),
      lastError: (await runtime.getStatus("iris"))?.health.lastError,
    }).toEqual({ results: ["completed", "completed", "completed"], lastError: undefined });

    const withFeedback = (await publicRoutes.societyDto()).individuals.find(
      (individual) => individual.id === "iris",
    )!;
    expect(withFeedback.publicReflection).toContain("social mirror remains plural");
    expect(withFeedback.embodiment.perceivedDifferences).not.toContain(
      "No returned peer-body evidence was available in this cycle.",
    );

    await runtime.runSingleCycle("iris");
    const withoutFeedback = (await publicRoutes.societyDto()).individuals.find(
      (individual) => individual.id === "iris",
    )!;
    expect(withoutFeedback.cycle).toBe(withFeedback.cycle + 1);
    expect(withoutFeedback.publicReflection).toContain("a body waits to be answered");
    expect(withoutFeedback.embodiment.perceivedDifferences).toEqual([
      "No returned peer-body evidence was available in this cycle.",
    ]);
  });

  it("requires bearer auth, exact origin, and JSON before applying an atomic tuning batch", async () => {
    const { runtime, publicRoutes } = await setup();
    const token = "c".repeat(32);
    const controls = new ControlRoutes(
      runtime,
      new ControlSecurity(token, ["https://exhibition.example"], () => new Date()),
      () => publicRoutes.societyDto(),
    );
    const body = JSON.stringify({
      updates: [
        { individualId: "iris", tuning: { "distortion-strength": 0.4 } },
        { individualId: "morrow", tuning: { "distortion-strength": 0.6 } },
      ],
    });

    await expect(controls.handle(
      "/api/v1/controls/perception",
      request("POST", { "Content-Type": "application/json", Origin: "https://evil.example" }, body),
      new ResponseCapture() as unknown as http.ServerResponse,
    )).rejects.toMatchObject({ status: 403 });
    await expect(controls.handle(
      "/api/v1/controls/perception",
      request("POST", { "Content-Type": "application/json", Origin: "https://exhibition.example" }, body),
      new ResponseCapture() as unknown as http.ServerResponse,
    )).rejects.toMatchObject({ status: 401 });

    const response = new ResponseCapture();
    await controls.handle(
      "/api/v1/controls/perception",
      request("POST", {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Origin: "https://exhibition.example",
      }, body),
      response as unknown as http.ServerResponse,
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ accepted: true, snapshot: { apiVersion: "1" } });
    expect((await runtime.getStatus("iris"))?.perceptionTuning).toEqual({ "distortion-strength": 0.4 });
    expect((await runtime.getStatus("morrow"))?.perceptionTuning).toEqual({ "distortion-strength": 0.6 });
  });

  it("keeps public projection available while controls fail closed without a secret", async () => {
    const { runtime, publicRoutes } = await setup();
    expect((await publicRoutes.societyDto()).apiVersion).toBe("1");
    const controls = new ControlRoutes(
      runtime,
      new ControlSecurity(undefined, ["https://exhibition.example"], () => new Date()),
      () => publicRoutes.societyDto(),
    );
    await expect(controls.handle(
      "/api/v1/controls/pause",
      request("POST", {
        "Content-Type": "application/json",
        Origin: "https://exhibition.example",
      }, "{}"),
      new ResponseCapture() as unknown as http.ServerResponse,
    )).rejects.toMatchObject({ status: 503, code: "control_unavailable", retryable: true });
  });

  it("stops a started runtime if public route subscription cannot be installed", async () => {
    const runtime = new SocietyRuntime({
      manifests: [createTemplateManifest({ id: "iris", displayName: "Iris" })],
      repository: new InMemoryIndividualRepository(),
      memory: new InMemoryMemoryStore(),
      engineFactory: factory,
      scheduler: dormantScheduler(),
      maxRevisionSubscribers: 1,
    });
    runtimes.push(runtime);
    const releaseCapacity = runtime.subscribe(() => undefined);
    const handle = createIndividualsServer({ runtime, port: 0 });

    await expect(handle.start()).rejects.toThrow(/subscriber capacity/);
    expect(runtime.getSummary().lifecycle).toBe("stopped");
    expect(handle.server.listening).toBe(false);
    releaseCapacity();
  });

  it("uses a high global runtime backstop so one proxy-shaped client cannot lock out the curator", () => {
    const token = "c".repeat(32);
    const security = new ControlSecurity(
      token,
      ["https://exhibition.example"],
      () => new Date("2026-01-01T00:00:00Z"),
      60,
    );
    const headers = {
      Origin: "https://exhibition.example",
      "Content-Type": "application/json",
    };
    for (let attempt = 0; attempt < 31; attempt += 1) {
      expect(() => security.authorize(request("POST", headers))).toThrow(
        expect.objectContaining({ status: 401 }),
      );
    }
    expect(security.authorize(request("POST", {
      ...headers,
      Authorization: `Bearer ${token}`,
    }))).toBe("https://exhibition.example");

    for (let attempt = 32; attempt < 60; attempt += 1) {
      expect(() => security.authorize(request("POST", headers))).toThrow(
        expect.objectContaining({ status: 401 }),
      );
    }
    expect(() => security.authorize(request("POST", headers))).toThrow(
      expect.objectContaining({ status: 429, code: "rate_limited" }),
    );
  });

  it("refreshes long-paused portrait artifacts so every returned URL resolves after cache churn", async () => {
    const artifacts = new PortraitArtifactStore(6, 4 * 1024 * 1024);
    const { runtime, publicRoutes } = await setup(artifacts);
    await runtime.runSingleCycle("iris");
    await runtime.runSingleCycle("morrow");
    await runtime.runSingleCycle("iris");
    await publicRoutes.societyDto();
    runtime.pause("iris");

    const churnPortrait = (cycle: number): Portrait => ({
      id: `churn-${cycle}`,
      artistId: "churn",
      subjectId: "churn",
      role: "self",
      cycle,
      createdAt: `2026-01-01T00:00:0${cycle}Z`,
      artwork: {
        format: "svg",
        width: 100,
        height: 100,
        content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="${cycle}" height="10"/></svg>`,
      },
      sourcePortraitIds: [],
    });
    artifacts.create(churnPortrait(1));
    artifacts.create(churnPortrait(2));
    await runtime.runSingleCycle("morrow");

    const dto = await publicRoutes.societyDto();
    const ids = dto.individuals.flatMap((individual) => [
      ...(individual.portraits.self ? [individual.portraits.self.id] : []),
      ...(individual.portraits.social ? [individual.portraits.social.id] : []),
      ...individual.portraits.peers.map((peer) => peer.artwork.id),
    ]);
    expect(ids.length).toBeGreaterThan(2);
    expect(ids.every((id) => artifacts.get(id) !== undefined)).toBe(true);
  });

  it("retains a complete mature projection for the maximum local society", async () => {
    const manifests = Array.from({ length: 17 }, (_, index) =>
      createTemplateManifest({ id: `person-${index}`, displayName: `Person ${index}` }));
    const runtime = new SocietyRuntime({
      manifests,
      repository: new InMemoryIndividualRepository(),
      memory: new InMemoryMemoryStore(),
      engineFactory: factory,
      scheduler: dormantScheduler(),
      cyclePolicy: {
        estimatedProviderCallsPerCycle: 0,
        maxCyclesPerWindow: 100,
        minimumCycleSpacingMs: 0,
      },
    });
    runtimes.push(runtime);
    await runtime.start();
    for (let round = 0; round < 2; round += 1) {
      for (const manifest of manifests) {
        await expect(runtime.runSingleCycle(manifest.id)).resolves.toEqual({ status: "completed" });
      }
    }
    const publicRoutes = new PublicRoutes({ runtime });
    const dto = await publicRoutes.societyDto();
    const ids = dto.individuals.flatMap((individual) => [
      ...(individual.portraits.self ? [individual.portraits.self.id] : []),
      ...(individual.portraits.social ? [individual.portraits.social.id] : []),
      ...individual.portraits.peers.map((peer) => peer.artwork.id),
    ]);
    const urls = dto.individuals.flatMap((individual) => [
      ...(individual.portraits.self ? [individual.portraits.self.url] : []),
      ...(individual.portraits.social ? [individual.portraits.social.url] : []),
      ...individual.portraits.peers.map((peer) => peer.artwork.url),
    ]);
    expect(dto.individuals).toHaveLength(17);
    expect(ids.length).toBeGreaterThan(128);
    expect(new Set(ids).size).toBe(ids.length);
    for (const url of urls) {
      const response = new ResponseCapture();
      await publicRoutes.handle(url, request("HEAD"), response as unknown as http.ServerResponse);
      expect(response.statusCode).toBe(200);
    }
  });

  it("keeps liveness separate from operational readiness", async () => {
    const { runtime, publicRoutes } = await setup();
    runtime.getHealthMonitor().recordDeadlineExceeded(
      "iris",
      1,
      new Error("simulated deadline"),
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      runtime.getHealthMonitor().recordFault("morrow", 1, new Error("simulated persistent fault"));
    }
    const live = new ResponseCapture();
    await publicRoutes.handle("/healthz", request("GET"), live as unknown as http.ServerResponse);
    expect(live.statusCode).toBe(200);
    const ready = new ResponseCapture();
    await publicRoutes.handle("/readyz", request("GET"), ready as unknown as http.ServerResponse);
    expect(ready.statusCode).toBe(503);
    expect(JSON.parse(ready.body)).toMatchObject({ status: "not_ready", availableIndividuals: 0 });
  });

  it("subscribes before the baseline snapshot and still emits quiet-society heartbeats", async () => {
    const { runtime, publicRoutes } = await setup();
    vi.useFakeTimers();
    publicRoutes.start();
    const response = new ResponseCapture();
    await publicRoutes.handle(
      "/api/v1/society/events",
      request("GET"),
      response as unknown as http.ServerResponse,
    );
    const baselineRevision = runtime.getSummary().revision;
    const baselineStartedAt = runtime.getSummary().startedAt;
    await vi.advanceTimersByTimeAsync(20_000);
    const heartbeats = [...response.body.matchAll(/event: society\.heartbeat\ndata: ([^\n]+)\n\n/g)]
      .map((match) => JSON.parse(match[1]) as { revision: string; startedAt: string });
    expect(heartbeats.length).toBeGreaterThan(0);
    expect(heartbeats.some((heartbeat) => Number(heartbeat.revision) === baselineRevision)).toBe(true);
    expect(heartbeats.every((heartbeat) => heartbeat.startedAt === baselineStartedAt)).toBe(true);
    publicRoutes.stop();
  });

  it("publishes acknowledged controls only after their consistent state is readable", async () => {
    const { runtime, publicRoutes } = await setup();
    publicRoutes.start();
    const streamRequest = request("GET");
    const response = new ResponseCapture();
    await publicRoutes.handle(
      "/api/v1/society/events",
      streamRequest,
      response as unknown as http.ServerResponse,
    );
    const snapshots = (): Array<{
      revision: string;
      runtime: { status: string };
      individuals: Array<{
        id: string;
        isPaused: boolean;
        perceptionTuning: Record<string, number>;
      }>;
    }> => [...response.body.matchAll(/event: society\.snapshot\ndata: ([^\n]+)\n\n/g)]
      .map((match) => JSON.parse(match[1]));
    const initialSnapshots = snapshots().length;

    runtime.pause("iris");
    await vi.waitFor(() => expect(snapshots().length).toBeGreaterThan(initialSnapshots));
    let latest = snapshots().at(-1)!;
    let iris = latest.individuals.find((individual) => individual.id === "iris")!;
    expect(Number(latest.revision)).toBe(runtime.getSummary().revision);
    expect(iris.isPaused).toBe(true);

    const pausedRevision = Number(latest.revision);
    await runtime.tunePerception("iris", { "distortion-strength": 0.5 });
    await vi.waitFor(() => expect(Number(snapshots().at(-1)?.revision)).toBeGreaterThan(pausedRevision));
    latest = snapshots().at(-1)!;
    iris = latest.individuals.find((individual) => individual.id === "iris")!;
    expect(Number(latest.revision)).toBe(runtime.getSummary().revision);
    expect(iris.perceptionTuning).toEqual({ "distortion-strength": 0.5 });

    const tunedRevision = Number(latest.revision);
    runtime.reportProviderFailure({
      individualId: "iris",
      cycle: 0,
      operation: "form_intent",
      error: new Error("provider timeout"),
      category: "timeout",
      retryable: true,
    });
    await vi.waitFor(() => expect(Number(snapshots().at(-1)?.revision)).toBeGreaterThan(tunedRevision));
    latest = snapshots().at(-1)!;
    expect(Number(latest.revision)).toBe(runtime.getSummary().revision);
    expect(latest.runtime.status).toBe("degraded");

    // No fake-time advance or heartbeat is involved; every snapshot above was
    // driven by the acknowledged mutation's own post-lease revision.
    streamRequest.emit("close");
    publicRoutes.stop();
  });

  it("bounds SSE baseline reconciliation under continuous revision churn", async () => {
    const { runtime, publicRoutes } = await setup();
    const originalCapture = runtime.getConsistentState.bind(runtime);
    let captures = 0;
    Object.defineProperty(runtime, "getConsistentState", {
      configurable: true,
      value: async () => {
        const state = await originalCapture();
        captures += 1;
        if (captures <= 20) {
          if (captures % 2 === 1) runtime.pause("iris");
          else runtime.resume("iris");
        }
        return state;
      },
    });

    const streamRequest = request("GET");
    const response = new ResponseCapture();
    await publicRoutes.handle(
      "/api/v1/society/events",
      streamRequest,
      response as unknown as http.ServerResponse,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("event: society.snapshot");
    expect(captures).toBeLessThanOrEqual(10);
    streamRequest.emit("close");
  });

  it("validates and releases the public SSE connection budget", async () => {
    const { runtime } = await setup();
    expect(() => new PublicRoutes({ runtime, maxSseClients: Number.NaN })).toThrow(
      /maxSseClients/,
    );
    expect(() => new PublicRoutes({ runtime, heartbeatIntervalMs: 4_999 })).toThrow(
      /heartbeatIntervalMs/,
    );

    const routes = new PublicRoutes({ runtime, maxSseClients: 1 });
    const firstRequest = request("GET");
    const firstResponse = new ResponseCapture();
    await routes.handle(
      "/api/v1/society/events",
      firstRequest,
      firstResponse as unknown as http.ServerResponse,
    );
    expect(firstResponse.statusCode).toBe(200);

    const deniedResponse = new ResponseCapture();
    await routes.handle(
      "/api/v1/society/events",
      request("GET"),
      deniedResponse as unknown as http.ServerResponse,
    );
    expect(deniedResponse.statusCode).toBe(503);
    expect(JSON.parse(deniedResponse.body)).toMatchObject({
      error: { code: "sse_capacity", retryable: true },
    });

    firstRequest.emit("close");
    const replacementRequest = request("GET");
    const replacementResponse = new ResponseCapture();
    await routes.handle(
      "/api/v1/society/events",
      replacementRequest,
      replacementResponse as unknown as http.ServerResponse,
    );
    expect(replacementResponse.statusCode).toBe(200);
    replacementRequest.emit("close");
    routes.stop();
  });

  it("serves only a proven projection while a deferred cycle commit is in flight", async () => {
    let releaseSave!: () => void;
    let announceSave!: () => void;
    const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
    const saveStarted = new Promise<void>((resolve) => { announceSave = resolve; });
    class DeferredRepository extends InMemoryIndividualRepository {
      override async save(snapshot: Parameters<InMemoryIndividualRepository["save"]>[0]): Promise<void> {
        if (snapshot.state.cycle === 1) {
          announceSave();
          await saveGate;
        }
        await super.save(snapshot);
      }
    }
    const runtime = new SocietyRuntime({
      manifests: [createTemplateManifest({ id: "iris", displayName: "Iris" })],
      repository: new DeferredRepository(),
      memory: new InMemoryMemoryStore(),
      engineFactory: factory,
      scheduler: dormantScheduler(),
      cyclePolicy: { minimumCycleSpacingMs: 0 },
    });
    runtimes.push(runtime);
    await runtime.start();
    const publicRoutes = new PublicRoutes({ runtime });
    const baseline = await publicRoutes.societyDto();
    expect(baseline.individuals[0].cycle).toBe(0);

    const cycle = runtime.runSingleCycle("iris");
    await saveStarted;
    const duringCommit = await publicRoutes.societyDto();
    expect(duringCommit.revision).toBe(baseline.revision);
    expect(duringCommit.individuals[0].cycle).toBe(0);
    expect(duringCommit.individuals[0].portraits.self).toBeUndefined();

    releaseSave();
    await expect(cycle).resolves.toEqual({ status: "completed" });
    const committed = await publicRoutes.societyDto();
    expect(Number(committed.revision)).toBeGreaterThan(Number(baseline.revision));
    expect(committed.individuals[0].cycle).toBe(1);
    expect(committed.individuals[0].portraits.self).toBeDefined();
  });
});
