import { describe, expect, it } from "vitest";
import {
  InMemoryInterSiteMessageStore,
  InterSiteDeadlineExceededError,
  MultiLocationBridge,
  type InterSiteEnvelope,
  type InterSiteBridgeState,
  type InterSiteMessageStore,
  type InterSitePayload,
  type InterSiteTransport,
} from "../multiLocationBridge";
import {
  HmacSha256MigrationAuthenticator,
  MigrationProtocol,
} from "../migrationProtocol";
import { createTemplateManifest } from "../../core/template/manifest";
import { createInitialState } from "../../core/createInitialState";
import type {
  RuntimeScheduler,
  RuntimeTimerHandle,
} from "../scheduler";

class ManualDeadlineScheduler implements RuntimeScheduler {
  private readonly timers: Array<{
    readonly callback: () => void;
    readonly delayMs: number;
    readonly handle: object;
    cleared: boolean;
    fired: boolean;
  }> = [];

  setTimeout(callback: () => void, delayMs: number): RuntimeTimerHandle {
    const timer = { callback, delayMs, handle: {}, cleared: false, fired: false };
    this.timers.push(timer);
    return timer.handle;
  }

  clearTimeout(handle: RuntimeTimerHandle): void {
    const timer = this.timers.find((candidate) => candidate.handle === handle);
    if (timer) timer.cleared = true;
  }

  fireNext(delayMs: number): void {
    const timer = this.timers.find(
      (candidate) =>
        !candidate.cleared && !candidate.fired && candidate.delayMs === delayMs,
    );
    if (!timer) throw new Error(`No active ${delayMs} ms inter-site deadline.`);
    timer.fired = true;
    timer.callback();
  }
}

describe("Multi-location delivery and migration", () => {
  it("persists an outage queue, retries with acknowledgement, and dequeues only on ack", async () => {
    let available = false;
    let nowMs = Date.parse("2026-01-01T00:00:00Z");
    const transport: InterSiteTransport = {
      async deliver(envelope) {
        if (!available) {
          throw new Proxy(Object.create(null) as Record<string, unknown>, {
            getPrototypeOf() {
              throw new Error("PRIVATE_TRANSPORT_CANARY /run/secrets/site-key");
            },
            get() {
              throw new Error("PRIVATE_TRANSPORT_CANARY /run/secrets/site-key");
            },
          });
        }
        return {
          schemaVersion: 1,
          messageId: envelope.messageId,
          destinationSiteId: envelope.destinationSiteId,
          receivedAt: new Date(nowMs).toISOString(),
          status: "accepted",
        };
      },
    };
    const store = new InMemoryInterSiteMessageStore();
    const bridge = new MultiLocationBridge({
      localSiteId: "london",
      transport,
      store,
      now: () => new Date(nowMs),
      createId: () => "delivery-1",
    });
    bridge.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    bridge.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });

    const queued = await bridge.send({
      destinationSiteId: "tokyo",
      payload: {
        type: "public_identity_signal",
        signal: {
          individualId: "iris",
          cycle: 4,
          perceivedSimilarity: 0.62,
          perceivedDifferences: ["hands remain closed"],
        },
      },
    });
    expect(queued.status).toBe("queued");
    expect((await bridge.getQueueStatus()).pending).toBe(1);
    const queuedState = await store.load();
    expect(queuedState?.outbox[0].lastFailureCategory).toBe("transport_failure");
    expect(JSON.stringify(queuedState)).not.toContain("PRIVATE_TRANSPORT_CANARY");
    expect(JSON.stringify(queuedState)).not.toContain("/run/secrets");

    available = true;
    nowMs += 1_000;
    const flushed = await bridge.flushDue();
    expect(flushed[0].status).toBe("delivered");
    expect((await bridge.getQueueStatus()).pending).toBe(0);
  });

  it("shares one state initialization across concurrent reads and mutations", async () => {
    let releaseLoad!: () => void;
    const loadGate = new Promise<void>((resolve) => { releaseLoad = resolve; });
    let loads = 0;
    const backing = new InMemoryInterSiteMessageStore();
    const store: InterSiteMessageStore = {
      async load() {
        loads += 1;
        await loadGate;
        return backing.load();
      },
      async save(state) {
        await backing.save(state);
      },
    };
    const bridge = new MultiLocationBridge({
      localSiteId: "london",
      store,
      createId: () => "concurrent-initialization",
      transport: { async deliver() { throw new Error("offline"); } },
    });
    bridge.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    bridge.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });

    const initialStatus = bridge.getQueueStatus();
    const send = bridge.send({
      destinationSiteId: "tokyo",
      payload: {
        type: "public_identity_signal",
        signal: {
          individualId: "iris",
          cycle: 1,
          perceivedSimilarity: 0.5,
          perceivedDifferences: [],
        },
      },
    });
    await Promise.resolve();
    expect(loads).toBe(1);
    releaseLoad();
    await initialStatus;
    await expect(send).resolves.toMatchObject({ status: "queued" });
    expect(loads).toBe(1);
    expect((await bridge.getQueueStatus()).pending).toBe(1);
  });

  it("times out a non-settling transport, aborts it, and releases sequencing for retry", async () => {
    const scheduler = new ManualDeadlineScheduler();
    let nowMs = Date.parse("2026-01-01T00:00:00Z");
    let deliveryCalls = 0;
    let firstSignal: AbortSignal | undefined;
    let announceDelivery!: () => void;
    const deliveryStarted = new Promise<void>((resolve) => { announceDelivery = resolve; });
    const transport: InterSiteTransport = {
      async deliver(envelope, signal) {
        deliveryCalls += 1;
        if (deliveryCalls === 1) {
          firstSignal = signal;
          announceDelivery();
          return new Promise<never>(() => undefined);
        }
        return {
          schemaVersion: 1,
          messageId: envelope.messageId,
          destinationSiteId: envelope.destinationSiteId,
          receivedAt: new Date(nowMs).toISOString(),
          status: "accepted",
        };
      },
    };
    const store = new InMemoryInterSiteMessageStore();
    const bridge = new MultiLocationBridge({
      localSiteId: "london",
      transport,
      store,
      now: () => new Date(nowMs),
      createId: () => "deadline-delivery",
      deliveryTimeoutMs: 25,
      deadlineScheduler: scheduler,
    });
    bridge.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    bridge.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });

    const sending = bridge.send({
      destinationSiteId: "tokyo",
      payload: {
        type: "public_identity_signal",
        signal: {
          individualId: "iris",
          cycle: 1,
          perceivedSimilarity: 0.5,
          perceivedDifferences: [],
        },
      },
    });
    await deliveryStarted;
    scheduler.fireNext(25);
    await expect(sending).resolves.toMatchObject({ status: "queued" });
    expect(firstSignal?.aborted).toBe(true);
    expect((await store.load())?.outbox[0]).toMatchObject({
      attempts: 1,
      lastFailureCategory: "transport_timeout",
    });

    nowMs += 1_000;
    await expect(bridge.flushDue()).resolves.toMatchObject([{ status: "delivered" }]);
    expect(deliveryCalls).toBe(2);
    expect((await bridge.getQueueStatus()).pending).toBe(0);
  });

  it("times out a non-settling inbound applier without committing its sequence", async () => {
    const scheduler = new ManualDeadlineScheduler();
    const bridge = new MultiLocationBridge({
      localSiteId: "tokyo",
      transport: { async deliver() { throw new Error("unused"); } },
      applicationTimeoutMs: 20,
      deadlineScheduler: scheduler,
    });
    bridge.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    bridge.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });
    const envelope: InterSiteEnvelope = {
      schemaVersion: 1,
      messageId: "msg-application-deadline",
      sequence: 1,
      sourceSiteId: "london",
      destinationSiteId: "tokyo",
      createdAt: "2026-01-01T00:00:00Z",
      payload: {
        type: "public_identity_signal",
        signal: {
          individualId: "iris",
          cycle: 1,
          perceivedSimilarity: 0.5,
          perceivedDifferences: [],
        },
      },
    };
    let applicationSignal: AbortSignal | undefined;
    let announceApplication!: () => void;
    const applicationStarted = new Promise<void>((resolve) => { announceApplication = resolve; });
    const receiving = bridge.receive(envelope, {
      async apply(_received, signal) {
        applicationSignal = signal;
        announceApplication();
        return new Promise<never>(() => undefined);
      },
    });
    await applicationStarted;
    scheduler.fireNext(20);
    const deadlineError = await receiving.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(deadlineError).toBeInstanceOf(InterSiteDeadlineExceededError);
    expect(deadlineError).toMatchObject({
      code: "INTER_SITE_DEADLINE_EXCEEDED",
      operation: "message_application",
      timeoutMs: 20,
    });
    expect(applicationSignal?.aborted).toBe(true);

    let successfulApplications = 0;
    await expect(bridge.receive(envelope, {
      async apply() { successfulApplications += 1; },
    })).resolves.toMatchObject({ status: "accepted" });
    expect(successfulApplications).toBe(1);
    await expect(bridge.receive(envelope, {
      async apply() { successfulApplications += 1; },
    })).resolves.toMatchObject({ status: "duplicate" });
    expect(successfulApplications).toBe(1);
  });

  it("detaches and freezes accepted outbound and inbound envelope graphs", async () => {
    let releaseDelivery!: () => void;
    let announceDelivery!: () => void;
    const deliveryGate = new Promise<void>((resolve) => { releaseDelivery = resolve; });
    const deliveryStarted = new Promise<void>((resolve) => { announceDelivery = resolve; });
    let deliveredEnvelope: InterSiteEnvelope | undefined;
    const store = new InMemoryInterSiteMessageStore();
    const outbound = new MultiLocationBridge({
      localSiteId: "london",
      store,
      createId: () => "detached-outbound",
      transport: {
        async deliver(envelope) {
          deliveredEnvelope = envelope;
          announceDelivery();
          await deliveryGate;
          throw new Error("offline");
        },
      },
    });
    outbound.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    outbound.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });
    const differences = ["original outbound evidence"];
    const payload: InterSitePayload = {
      type: "public_identity_signal",
      signal: {
        individualId: "iris",
        cycle: 2,
        perceivedSimilarity: 0.5,
        perceivedDifferences: differences,
      },
    };
    const sending = outbound.send({ destinationSiteId: "tokyo", payload });
    await deliveryStarted;
    differences[0] = "caller mutation";
    releaseDelivery();
    await expect(sending).resolves.toMatchObject({ status: "queued" });
    expect(deliveredEnvelope?.payload.type).toBe("public_identity_signal");
    expect(deliveredEnvelope?.payload.type === "public_identity_signal"
      ? deliveredEnvelope.payload.signal.perceivedDifferences
      : []).toEqual(["original outbound evidence"]);
    expect(Object.isFrozen(deliveredEnvelope)).toBe(true);
    expect(Object.isFrozen(deliveredEnvelope?.payload)).toBe(true);
    expect(deliveredEnvelope?.payload.type === "public_identity_signal"
      ? Object.isFrozen(deliveredEnvelope.payload.signal.perceivedDifferences)
      : false).toBe(true);
    expect(JSON.stringify(await store.load())).toContain("original outbound evidence");
    expect(JSON.stringify(await store.load())).not.toContain("caller mutation");

    let releaseApplication!: () => void;
    let announceApplication!: () => void;
    const applicationGate = new Promise<void>((resolve) => { releaseApplication = resolve; });
    const applicationStarted = new Promise<void>((resolve) => { announceApplication = resolve; });
    let appliedEnvelope: InterSiteEnvelope | undefined;
    const inbound = new MultiLocationBridge({
      localSiteId: "tokyo",
      transport: { async deliver() { throw new Error("unused"); } },
    });
    inbound.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    inbound.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });
    const inboundDifferences = ["original inbound evidence"];
    const inboundEnvelope: InterSiteEnvelope = {
      schemaVersion: 1,
      messageId: "msg-detached-inbound",
      sequence: 1,
      sourceSiteId: "london",
      destinationSiteId: "tokyo",
      createdAt: "2026-01-01T00:00:00Z",
      payload: {
        type: "public_identity_signal",
        signal: {
          individualId: "iris",
          cycle: 2,
          perceivedSimilarity: 0.5,
          perceivedDifferences: inboundDifferences,
        },
      },
    };
    const receiving = inbound.receive(inboundEnvelope, {
      async apply(envelope) {
        appliedEnvelope = envelope;
        announceApplication();
        await applicationGate;
      },
    });
    await applicationStarted;
    inboundDifferences[0] = "caller mutation";
    releaseApplication();
    await expect(receiving).resolves.toMatchObject({ status: "accepted" });
    expect(appliedEnvelope?.payload.type === "public_identity_signal"
      ? appliedEnvelope.payload.signal.perceivedDifferences
      : []).toEqual(["original inbound evidence"]);
    expect(Object.isFrozen(appliedEnvelope)).toBe(true);
    expect(Object.isFrozen(appliedEnvelope?.payload)).toBe(true);
    expect(appliedEnvelope?.payload.type === "public_identity_signal"
      ? Object.isFrozen(appliedEnvelope.payload.signal.perceivedDifferences)
      : false).toBe(true);
  });

  it("applies inbound envelopes idempotently and returns duplicate acknowledgements", async () => {
    const transport: InterSiteTransport = {
      async deliver() {
        throw new Error("unused");
      },
    };
    const bridge = new MultiLocationBridge({ localSiteId: "tokyo", transport });
    bridge.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    bridge.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });
    const envelope: InterSiteEnvelope = {
      schemaVersion: 1,
      messageId: "msg-1",
      sequence: 1,
      sourceSiteId: "london",
      destinationSiteId: "tokyo",
      createdAt: "2026-01-01T00:00:00Z",
      payload: {
        type: "public_identity_signal",
        signal: {
          individualId: "iris",
          cycle: 1,
          perceivedSimilarity: 0.5,
          perceivedDifferences: [],
        },
      },
    };
    let applied = 0;
    const applier = { async apply() { applied += 1; } };
    expect((await bridge.receive(envelope, applier)).status).toBe("accepted");
    expect((await bridge.receive(envelope, applier)).status).toBe("duplicate");
    expect(applied).toBe(1);
  });

  it("tracks per-source sequence gaps and rejects replay under a new message ID", async () => {
    const transport: InterSiteTransport = { async deliver() { throw new Error("unused"); } };
    const bridge = new MultiLocationBridge({ localSiteId: "tokyo", transport });
    bridge.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    bridge.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });
    const envelope = (sequence: number, messageId = `msg-${sequence}`): InterSiteEnvelope => ({
      schemaVersion: 1,
      messageId,
      sequence,
      sourceSiteId: "london",
      destinationSiteId: "tokyo",
      createdAt: "2026-01-01T00:00:00Z",
      payload: {
        type: "public_identity_signal",
        signal: {
          individualId: "iris",
          cycle: 1,
          perceivedSimilarity: 0.5,
          perceivedDifferences: [],
        },
      },
    });
    const applier = { async apply() {} };
    expect((await bridge.receive(envelope(2), applier)).status).toBe("accepted");
    expect((await bridge.receive(envelope(1), applier)).status).toBe("accepted");
    await expect(bridge.receive(envelope(2, "msg-replayed-sequence"), applier)).rejects.toThrow(
      /already applied/,
    );
    await expect(bridge.receive(envelope(5_000, "msg-too-far"), applier)).rejects.toThrow(
      /too far ahead/,
    );
  });

  it("documents the apply-to-inbox crash window through an idempotent applier", async () => {
    class FailFirstSaveStore implements InterSiteMessageStore {
      state: InterSiteBridgeState | undefined;
      fail = true;
      async load() { return this.state; }
      async save(state: InterSiteBridgeState) {
        if (this.fail) {
          this.fail = false;
          throw new Error("simulated power loss before inbox marker");
        }
        this.state = structuredClone(state);
      }
    }
    const store = new FailFirstSaveStore();
    const transport: InterSiteTransport = { async deliver() { throw new Error("unused"); } };
    const configure = () => {
      const bridge = new MultiLocationBridge({ localSiteId: "tokyo", transport, store });
      bridge.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
      bridge.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });
      return bridge;
    };
    const envelope: InterSiteEnvelope = {
      schemaVersion: 1,
      messageId: "msg-crash-window",
      sequence: 1,
      sourceSiteId: "london",
      destinationSiteId: "tokyo",
      createdAt: "2026-01-01T00:00:00Z",
      payload: { type: "public_identity_signal", signal: { individualId: "iris", cycle: 1, perceivedSimilarity: 0.5, perceivedDifferences: [] } },
    };
    const applied = new Set<string>();
    let effectCount = 0;
    let applyCalls = 0;
    const applier = {
      async apply(received: InterSiteEnvelope) {
        applyCalls += 1;
        if (!applied.has(received.messageId)) {
          applied.add(received.messageId);
          effectCount += 1;
        }
      },
    };
    await expect(configure().receive(envelope, applier)).rejects.toThrow(/power loss/);
    expect((await configure().receive(envelope, applier)).status).toBe("accepted");
    expect({ applyCalls, effectCount }).toEqual({ applyCalls: 2, effectCount: 1 });
  });

  it("binds public portrait references to registered origins and rejects trust reconfiguration", async () => {
    const transport: InterSiteTransport = { async deliver() { throw new Error("offline"); } };
    const bridge = new MultiLocationBridge({ localSiteId: "london", transport });
    const london = { siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" } as const;
    bridge.registerSite(london);
    bridge.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });
    expect(() => bridge.registerSite({ ...london, artifactOrigin: "https://attacker.example" })).toThrow(
      /different trust metadata/,
    );
    await expect(bridge.send({
      destinationSiteId: "tokyo",
      payload: {
        type: "portrait_share",
        portrait: {
          portraitId: "iris-self-1",
          artistId: "iris",
          subjectId: "iris",
          role: "self",
          cycle: 1,
          createdAt: "2026-01-01T00:00:00Z",
          artifact: {
            artifactId: "opaque-1",
            url: "https://attacker.example/portrait.svg",
            sha256: "a".repeat(64),
            mediaType: "image/svg+xml",
            width: 800,
            height: 1000,
          },
          identitySignal: {
            individualId: "iris",
            cycle: 1,
            perceivedSimilarity: 0.5,
            perceivedDifferences: [],
          },
        },
      },
    })).rejects.toThrow(/registered source site origin/);
  });

  it("rejects cross-site identity impersonation before outbound delivery or inbound apply", async () => {
    let deliveries = 0;
    const transport: InterSiteTransport = {
      async deliver(envelope) {
        deliveries += 1;
        return {
          schemaVersion: 1,
          messageId: envelope.messageId,
          destinationSiteId: envelope.destinationSiteId,
          receivedAt: "2026-01-01T00:00:00Z",
          status: "accepted",
        };
      },
    };
    const outbound = new MultiLocationBridge({ localSiteId: "london", transport });
    outbound.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    outbound.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });

    await expect(outbound.send({
      destinationSiteId: "tokyo",
      payload: {
        type: "public_identity_signal",
        signal: {
          individualId: "morrow",
          cycle: 1,
          perceivedSimilarity: 0.5,
          perceivedDifferences: [],
        },
      },
    })).rejects.toThrow(/ownership violation.*not owned by site "london"/);
    expect(deliveries).toBe(0);
    expect((await outbound.getQueueStatus()).pending).toBe(0);

    const inbound = new MultiLocationBridge({ localSiteId: "tokyo", transport });
    inbound.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    inbound.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });
    let applies = 0;
    await expect(inbound.receive({
      schemaVersion: 1,
      messageId: "msg-impersonation",
      sequence: 1,
      sourceSiteId: "london",
      destinationSiteId: "tokyo",
      createdAt: "2026-01-01T00:00:00Z",
      payload: {
        type: "public_identity_signal",
        signal: {
          individualId: "morrow",
          cycle: 1,
          perceivedSimilarity: 0.5,
          perceivedDifferences: [],
        },
      },
    }, { async apply() { applies += 1; } })).rejects.toThrow(/ownership violation/);
    expect(applies).toBe(0);
  });

  it("enforces explicit self, peer, and social portrait ownership routes", async () => {
    const delivered: InterSiteEnvelope[] = [];
    const transport: InterSiteTransport = {
      async deliver(envelope) {
        delivered.push(envelope);
        return {
          schemaVersion: 1,
          messageId: envelope.messageId,
          destinationSiteId: envelope.destinationSiteId,
          receivedAt: "2026-01-01T00:00:00Z",
          status: "accepted",
        };
      },
    };
    let id = 0;
    const bridge = new MultiLocationBridge({
      localSiteId: "london",
      transport,
      createId: () => `ownership-${++id}`,
    });
    bridge.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    bridge.registerSite({ siteId: "tokyo", siteName: "Mori", localIndividualIds: ["morrow"], artifactOrigin: "https://tokyo.example" });
    const portrait = (input: {
      role: "self" | "peer" | "social";
      artistId: string;
      subjectId: string;
    }) => ({
      portraitId: `portrait-${id + 1}`,
      ...input,
      cycle: 1,
      createdAt: "2026-01-01T00:00:00Z",
      artifact: {
        artifactId: `artifact-${id + 1}`,
        url: `https://london.example/portrait-${id + 1}.svg`,
        sha256: "a".repeat(64),
        mediaType: "image/svg+xml" as const,
        width: 800,
        height: 1000,
      },
      identitySignal: {
        individualId: input.role === "peer" ? input.artistId : input.subjectId,
        cycle: 1,
        perceivedSimilarity: 0.5,
        perceivedDifferences: [],
      },
    });

    await expect(bridge.send({
      destinationSiteId: "tokyo",
      payload: { type: "portrait_share", portrait: portrait({ role: "self", artistId: "iris", subjectId: "morrow" }) },
    })).rejects.toThrow(/self-portrait subject.*not owned by site "london"/);
    await expect(bridge.send({
      destinationSiteId: "tokyo",
      payload: { type: "portrait_share", portrait: portrait({ role: "peer", artistId: "morrow", subjectId: "morrow" }) },
    })).rejects.toThrow(/peer-portrait artist.*not owned by site "london"/);
    await expect(bridge.send({
      destinationSiteId: "tokyo",
      payload: { type: "portrait_share", portrait: portrait({ role: "peer", artistId: "iris", subjectId: "iris" }) },
    })).rejects.toThrow(/peer-portrait subject.*not owned by site "tokyo"/);
    await expect(bridge.send({
      destinationSiteId: "tokyo",
      payload: { type: "portrait_share", portrait: portrait({ role: "social", artistId: "iris", subjectId: "iris" }) },
    })).rejects.toThrow(/artist as the collective/);

    const forgedPeerSignal = portrait({ role: "peer", artistId: "iris", subjectId: "morrow" });
    await expect(bridge.send({
      destinationSiteId: "tokyo",
      payload: {
        type: "portrait_share",
        portrait: {
          ...forgedPeerSignal,
          identitySignal: { ...forgedPeerSignal.identitySignal, individualId: "morrow" },
        },
      },
    })).rejects.toThrow(/identitySignal must describe the source artist/);

    await expect(bridge.send({
      destinationSiteId: "tokyo",
      payload: { type: "portrait_share", portrait: portrait({ role: "peer", artistId: "iris", subjectId: "morrow" }) },
    })).resolves.toMatchObject({ status: "delivered" });
    expect(delivered).toHaveLength(1);
  });

  it("rejects ambiguous Individual ownership across registered sites", () => {
    const transport: InterSiteTransport = { async deliver() { throw new Error("unused"); } };
    const bridge = new MultiLocationBridge({ localSiteId: "london", transport });
    bridge.registerSite({ siteId: "london", siteName: "Tate", localIndividualIds: ["iris"], artifactOrigin: "https://london.example" });
    expect(() => bridge.registerSite({
      siteId: "tokyo",
      siteName: "Mori",
      localIndividualIds: ["iris"],
      artifactOrigin: "https://tokyo.example",
    })).toThrow(/already owned by registered site "london"/);
  });

  it("authenticates migration contents and rejects recomputed or unsigned bundles", () => {
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const auth = new HmacSha256MigrationAuthenticator("s".repeat(32), "venue-handoff-2026");
    const protocol = new MigrationProtocol({
      authenticator: auth,
      now: () => new Date("2026-01-01T00:00:00Z"),
      createId: () => "bundle-1",
    });
    const bundle = protocol.exportBundle({
      snapshot: { manifest, state },
      memories: [],
      sourceSiteId: "london",
      destinationSiteId: "venice",
    });

    const imported = protocol.importBundle(bundle, "venice");
    expect(imported.snapshot.state.selfConcept.narrative).toBe(state.selfConcept.narrative);
    expect(imported.memories[0].content).toContain("Identity handoff from london to venice");

    const unsignedProtocol = new MigrationProtocol({ allowUnauthenticatedImport: false });
    const unsigned = new MigrationProtocol().exportBundle({
      snapshot: { manifest, state },
      memories: [],
      sourceSiteId: "london",
      destinationSiteId: "venice",
    });
    expect(() => unsignedProtocol.importBundle(unsigned, "venice")).toThrow(/Unauthenticated/);

    const tampered = {
      ...bundle,
      snapshot: { ...bundle.snapshot, state: { ...bundle.snapshot.state, cycle: 99 } },
    };
    expect(() => protocol.importBundle(tampered, "venice")).toThrow(/integrity/);
    expect(() => protocol.importBundle(
      { ...bundle, unexpectedPrivateField: true } as typeof bundle,
      "venice",
    )).toThrow(/unsupported field|too many fields/);
    expect(() => protocol.importBundle(
      { ...bundle, bundleId: "../unsafe" },
      "venice",
    )).toThrow(/safe, non-reserved identifier/);
  });

  it("reserves one migration memory slot so imported output never exceeds the configured bound", () => {
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");
    const auth = new HmacSha256MigrationAuthenticator("s".repeat(32), "venue-handoff-2026");
    const protocol = new MigrationProtocol({
      authenticator: auth,
      maxMemories: 2,
      now: () => new Date("2026-01-01T00:00:00Z"),
      createId: () => "bounded-bundle",
    });
    const memory = {
      id: "iris--0--existing",
      individualId: "iris",
      cycle: 0,
      kind: "reflection" as const,
      content: "Existing identity memory.",
      createdAt: "2026-01-01T00:00:00Z",
      relatedIndividualIds: [],
    };
    const bundle = protocol.exportBundle({
      snapshot: { manifest, state },
      memories: [memory],
      sourceSiteId: "london",
      destinationSiteId: "venice",
    });
    expect(protocol.importBundle(bundle, "venice").memories).toHaveLength(2);
    expect(() => protocol.exportBundle({
      snapshot: { manifest, state },
      memories: [memory, { ...memory, id: "iris--0--second" }],
      sourceSiteId: "london",
      destinationSiteId: "venice",
    })).toThrow(/at most 1 memories/);
  });
});
