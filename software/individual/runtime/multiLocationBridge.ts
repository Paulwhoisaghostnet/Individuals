import { randomUUID } from "node:crypto";

import {
  DEFAULT_INTER_SITE_APPLICATION_TIMEOUT_MS,
  DEFAULT_INTER_SITE_DELIVERY_TIMEOUT_MS,
  InterSiteDeadlineRunner,
  validateInterSiteTimeout,
} from "./interSiteDeadline";
import {
  SITE_ID_PATTERN,
  assertPortraitArtifactOrigin,
  validateAcknowledgement,
  validateInterSiteEnvelope,
  type InterSiteAcknowledgement,
  type InterSiteEnvelope,
  type InterSitePayload,
  type InterSiteTransport,
  type MultiLocationSiteConfig,
} from "./interSiteProtocol";
import {
  ABSOLUTE_INTER_SITE_LIMITS,
  InMemoryInterSiteMessageStore,
  initialInterSiteState,
  validateInterSiteBridgeState,
  type InterSiteBridgeState,
  type InterSiteMessageStore,
  type InterSiteStateLimits,
  type PendingDelivery,
} from "./interSiteState";
import { acceptInboundSequence } from "./interSiteSequenceTracker";
import { InterSiteSiteRegistry } from "./interSiteSiteRegistry";
import { assertInterSitePayloadOwnership } from "./interSiteAuthorization";
import { planDeliveryFailure } from "./interSiteRetryPolicy";
import type { RuntimeScheduler } from "./scheduler";
import {
  detachedCopy,
  detachedImmutableCopy,
} from "./interSiteValueBoundary";

export type {
  InterSiteAcknowledgement,
  InterSiteEnvelope,
  InterSitePayload,
  InterSiteTransport,
  MultiLocationSiteConfig,
  PublicIdentitySignal,
  PublicPortraitArtifactReference,
  PublicPortraitShare,
} from "./interSiteProtocol";
export {
  validateAcknowledgement,
  validateInterSiteEnvelope,
  validatePublicIdentitySignal,
  validatePublicPortraitShare,
} from "./interSiteProtocol";
export { InterSiteDeadlineExceededError } from "./interSiteDeadline";
export type {
  DeadLetterDelivery,
  InterSiteBridgeState,
  InterSiteMessageStore,
  InterSiteStateLimits,
  PendingDelivery,
} from "./interSiteState";
export { InMemoryInterSiteMessageStore, validateInterSiteBridgeState } from "./interSiteState";

export interface MultiLocationBridgeOptions {
  readonly localSiteId: string;
  readonly transport: InterSiteTransport;
  readonly store?: InterSiteMessageStore;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly maxOutbox?: number;
  readonly maxInboxIds?: number;
  readonly maxDeadLetters?: number;
  readonly maxDeliveryAttempts?: number;
  readonly maxStateBytes?: number;
  /** Hard bridge-owned bound for each outbound transport attempt. */
  readonly deliveryTimeoutMs?: number;
  /** Hard bridge-owned bound for each inbound idempotent application attempt. */
  readonly applicationTimeoutMs?: number;
  /** Deterministic scheduler seam for deadline tests and embedded runtimes. */
  readonly deadlineScheduler?: RuntimeScheduler;
}

export interface DeliveryResult {
  readonly status: "delivered" | "queued" | "dead-lettered";
  readonly messageId: string;
  readonly acknowledgement?: InterSiteAcknowledgement;
  readonly retryAt?: string;
}

export interface InterSiteMessageApplier {
  /**
   * Must be idempotent by envelope.messageId. Delivery is at least once, and a
   * process can fail after apply succeeds but before the inbox marker is saved.
   */
  apply(envelope: InterSiteEnvelope, signal: AbortSignal): Promise<void>;
}

const boundedInteger = (value: number | undefined, fallback: number, max: number, field: string) => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}.`);
  }
  return resolved;
};

export class MultiLocationBridge {
  private readonly sites: InterSiteSiteRegistry;
  private readonly localSiteId: string;
  private readonly transport: InterSiteTransport;
  private readonly store: InterSiteMessageStore;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly limits: InterSiteStateLimits;
  private readonly deliveryTimeoutMs: number;
  private readonly applicationTimeoutMs: number;
  private readonly deadlines: InterSiteDeadlineRunner;
  private state: InterSiteBridgeState | undefined;
  private stateInitialization: Promise<InterSiteBridgeState> | undefined;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(options: MultiLocationBridgeOptions) {
    if (!SITE_ID_PATTERN.test(options.localSiteId)) throw new Error("localSiteId is invalid.");
    this.localSiteId = options.localSiteId;
    this.transport = options.transport;
    this.store = options.store ?? new InMemoryInterSiteMessageStore();
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.deliveryTimeoutMs = validateInterSiteTimeout(
      options.deliveryTimeoutMs,
      DEFAULT_INTER_SITE_DELIVERY_TIMEOUT_MS,
      "deliveryTimeoutMs",
    );
    this.applicationTimeoutMs = validateInterSiteTimeout(
      options.applicationTimeoutMs,
      DEFAULT_INTER_SITE_APPLICATION_TIMEOUT_MS,
      "applicationTimeoutMs",
    );
    this.deadlines = new InterSiteDeadlineRunner({ scheduler: options.deadlineScheduler });
    this.limits = {
      maxOutbox: boundedInteger(options.maxOutbox, 256, ABSOLUTE_INTER_SITE_LIMITS.maxOutbox, "maxOutbox"),
      maxInboxIds: boundedInteger(options.maxInboxIds, 2_048, ABSOLUTE_INTER_SITE_LIMITS.maxInboxIds, "maxInboxIds"),
      maxDeadLetters: boundedInteger(options.maxDeadLetters, 128, ABSOLUTE_INTER_SITE_LIMITS.maxDeadLetters, "maxDeadLetters"),
      maxDeliveryAttempts: boundedInteger(options.maxDeliveryAttempts, 10, ABSOLUTE_INTER_SITE_LIMITS.maxDeliveryAttempts, "maxDeliveryAttempts"),
      maxStateBytes: boundedInteger(options.maxStateBytes, ABSOLUTE_INTER_SITE_LIMITS.maxStateBytes, ABSOLUTE_INTER_SITE_LIMITS.maxStateBytes, "maxStateBytes"),
      maxInboundSources: ABSOLUTE_INTER_SITE_LIMITS.maxInboundSources,
      maxReceivedAheadPerSource: ABSOLUTE_INTER_SITE_LIMITS.maxReceivedAheadPerSource,
      maxSequenceAdvance: ABSOLUTE_INTER_SITE_LIMITS.maxSequenceAdvance,
    };
    this.sites = new InterSiteSiteRegistry(this.limits.maxInboundSources);
  }

  registerSite(config: MultiLocationSiteConfig): void {
    this.sites.register(config);
  }

  async send(input: {
    readonly destinationSiteId: string;
    readonly payload: InterSitePayload;
  }): Promise<DeliveryResult> {
    // Capture the call-time value before this request waits for the serialized
    // state boundary. A caller cannot rewrite a queued request through aliases.
    const detachedInput = detachedCopy(input);
    return this.exclusive(async () => {
      const state = await this.getState();
      const localSite = this.sites.require(this.localSiteId);
      const destinationSite = this.sites.require(detachedInput.destinationSiteId);
      if (state.outbox.length >= this.limits.maxOutbox) {
        throw new Error("Inter-site outbox is full; delivery was not accepted.");
      }
      if (state.nextSequence >= Number.MAX_SAFE_INTEGER) {
        throw new Error("Inter-site sequence space is exhausted.");
      }
      const now = this.now();
      const envelope = detachedImmutableCopy(validateInterSiteEnvelope({
        schemaVersion: 1,
        messageId: `msg-${this.createId()}`,
        sequence: state.nextSequence,
        sourceSiteId: this.localSiteId,
        destinationSiteId: detachedInput.destinationSiteId,
        createdAt: now.toISOString(),
        payload: detachedInput.payload,
      }));
      assertPortraitArtifactOrigin(
        envelope,
        localSite.artifactOrigin,
      );
      assertInterSitePayloadOwnership(envelope, localSite, destinationSite);
      if (
        [...state.outbox, ...state.deadLetters].some(
          (item) => item.envelope.messageId === envelope.messageId,
        )
      ) {
        throw new Error("Message ID generator produced a duplicate ID.");
      }
      const pending: PendingDelivery = {
        envelope,
        attempts: 0,
        nextAttemptAt: now.toISOString(),
      };
      await this.persist({
        ...state,
        nextSequence: state.nextSequence + 1,
        outbox: [...state.outbox, pending],
      });
      return this.attempt(pending);
    });
  }

  async flushDue(maxBatch = 32): Promise<readonly DeliveryResult[]> {
    return this.exclusive(async () => {
      if (!Number.isSafeInteger(maxBatch) || maxBatch < 1 || maxBatch > 256) {
        throw new Error("maxBatch must be an integer between 1 and 256.");
      }
      const state = await this.getState();
      const nowMs = this.now().getTime();
      const due = state.outbox
        .filter((pending) => Date.parse(pending.nextAttemptAt) <= nowMs)
        .sort((left, right) => left.envelope.sequence - right.envelope.sequence)
        .slice(0, maxBatch);
      const results: DeliveryResult[] = [];
      for (const pending of due) results.push(await this.attempt(pending));
      return results;
    });
  }

  async receive(
    rawEnvelope: InterSiteEnvelope,
    applier: InterSiteMessageApplier,
  ): Promise<InterSiteAcknowledgement> {
    // Detach synchronously, before this receive waits behind another bridge
    // operation. Validation and application operate on that captured value.
    const detachedEnvelope = detachedCopy(rawEnvelope);
    return this.exclusive(async () => {
      const envelope = detachedImmutableCopy(validateInterSiteEnvelope(detachedEnvelope));
      if (envelope.destinationSiteId !== this.localSiteId) {
        throw new Error("Inter-site envelope was delivered to the wrong site.");
      }
      const sourceSite = this.sites.require(envelope.sourceSiteId);
      const destinationSite = this.sites.require(envelope.destinationSiteId);
      assertPortraitArtifactOrigin(
        envelope,
        sourceSite.artifactOrigin,
      );
      assertInterSitePayloadOwnership(envelope, sourceSite, destinationSite);
      const state = await this.getState();
      if (state.receivedMessageIds.includes(envelope.messageId)) {
        return this.acknowledgement(envelope, "duplicate");
      }
      const inboundSequenceBySource = acceptInboundSequence(
        state,
        envelope.sourceSiteId,
        envelope.sequence,
        this.limits,
      );

      // Apply precedes the durable marker. A crash between these operations is
      // why InterSiteMessageApplier has an idempotency contract.
      await this.deadlines.run({
        operation: "message_application",
        timeoutMs: this.applicationTimeoutMs,
        execute: (signal) => applier.apply(envelope, signal),
      });
      await this.persist({
        ...state,
        receivedMessageIds: [...state.receivedMessageIds, envelope.messageId].slice(
          -this.limits.maxInboxIds,
        ),
        inboundSequenceBySource,
      });
      return this.acknowledgement(envelope, "accepted");
    });
  }

  async getQueueStatus(): Promise<{
    readonly pending: number;
    readonly deadLetters: number;
    readonly oldestPendingAt?: string;
  }> {
    const state = await this.getState();
    return {
      pending: state.outbox.length,
      deadLetters: state.deadLetters.length,
      oldestPendingAt: state.outbox[0]?.envelope.createdAt,
    };
  }

  private async attempt(pending: PendingDelivery): Promise<DeliveryResult> {
    try {
      const rawAcknowledgement = await this.deadlines.run({
        operation: "transport_delivery",
        timeoutMs: this.deliveryTimeoutMs,
        execute: (signal) => this.transport.deliver(pending.envelope, signal),
      });
      const acknowledgement = detachedImmutableCopy(validateAcknowledgement(
        detachedCopy(rawAcknowledgement),
        pending.envelope,
      ));
      const state = await this.getState();
      await this.persist({
        ...state,
        outbox: state.outbox.filter(
          (item) => item.envelope.messageId !== pending.envelope.messageId,
        ),
      });
      return { status: "delivered", messageId: pending.envelope.messageId, acknowledgement };
    } catch (error) {
      return this.scheduleFailure(pending, error);
    }
  }

  private async scheduleFailure(pending: PendingDelivery, error: unknown): Promise<DeliveryResult> {
    const state = await this.getState();
    const plan = planDeliveryFailure(pending, error, this.now(), this.limits);
    if (plan.status === "dead-lettered") {
      await this.persist({
        ...state,
        outbox: state.outbox.filter(
          (item) => item.envelope.messageId !== pending.envelope.messageId,
        ),
        deadLetters: [...state.deadLetters, plan.deadLetter].slice(-this.limits.maxDeadLetters),
      });
      return { status: "dead-lettered", messageId: pending.envelope.messageId };
    }

    await this.persist({
      ...state,
      outbox: state.outbox.map((item) =>
        item.envelope.messageId === pending.envelope.messageId ? plan.pending : item,
      ),
    });
    return { status: "queued", messageId: pending.envelope.messageId, retryAt: plan.retryAt };
  }

  private acknowledgement(
    envelope: InterSiteEnvelope,
    status: InterSiteAcknowledgement["status"],
  ): InterSiteAcknowledgement {
    return {
      schemaVersion: 1,
      messageId: envelope.messageId,
      destinationSiteId: this.localSiteId,
      receivedAt: this.now().toISOString(),
      status,
    };
  }

  private async getState(): Promise<InterSiteBridgeState> {
    if (this.state) return this.state;
    this.stateInitialization ??= this.store.load().then((stored) =>
      detachedImmutableCopy(validateInterSiteBridgeState(
        detachedCopy(stored ?? initialInterSiteState()),
        this.limits,
      )));
    const initialized = await this.stateInitialization;
    // Every caller shares the same load promise. Never allow a late read-only
    // load to overwrite state that a concurrent mutation already persisted.
    this.state ??= initialized;
    return this.state;
  }

  private async persist(candidate: InterSiteBridgeState): Promise<void> {
    const validated = detachedImmutableCopy(validateInterSiteBridgeState(
      detachedCopy(candidate),
      this.limits,
    ));
    // The store receives its own graph. It cannot mutate or retain an alias to
    // the bridge's accepted in-memory state, even if it is a custom adapter.
    await this.store.save(detachedImmutableCopy(validated));
    this.state = validated;
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.catch(() => undefined).then(operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
