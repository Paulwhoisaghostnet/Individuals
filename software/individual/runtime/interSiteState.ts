import {
  MESSAGE_ID_PATTERN,
  SITE_ID_PATTERN,
  validateInterSiteEnvelope,
  type InterSiteEnvelope,
} from "./interSiteProtocol";

export interface PendingDelivery {
  readonly envelope: InterSiteEnvelope;
  readonly attempts: number;
  readonly nextAttemptAt: string;
  readonly lastFailureCategory?: string;
}

export interface DeadLetterDelivery extends PendingDelivery {
  readonly failedAt: string;
}

export interface InterSiteBridgeState {
  readonly schemaVersion: 2;
  readonly nextSequence: number;
  readonly outbox: readonly PendingDelivery[];
  readonly receivedMessageIds: readonly string[];
  readonly deadLetters: readonly DeadLetterDelivery[];
  readonly inboundSequenceBySource: Readonly<Record<string, InboundSequenceState>>;
}

export interface InboundSequenceState {
  readonly contiguousThrough: number;
  /** Received out-of-order sequences above contiguousThrough. */
  readonly receivedAhead: readonly number[];
}

export interface InterSiteMessageStore {
  load(): Promise<InterSiteBridgeState | undefined>;
  save(state: InterSiteBridgeState): Promise<void>;
}

export interface InterSiteStateLimits {
  readonly maxOutbox: number;
  readonly maxInboxIds: number;
  readonly maxDeadLetters: number;
  readonly maxDeliveryAttempts: number;
  readonly maxStateBytes: number;
  readonly maxInboundSources: number;
  readonly maxReceivedAheadPerSource: number;
  readonly maxSequenceAdvance: number;
}

export const ABSOLUTE_INTER_SITE_LIMITS: InterSiteStateLimits = {
  maxOutbox: 256,
  maxInboxIds: 4_096,
  maxDeadLetters: 256,
  maxDeliveryAttempts: 100,
  maxStateBytes: 4 * 1024 * 1024,
  maxInboundSources: 64,
  maxReceivedAheadPerSource: 128,
  maxSequenceAdvance: 4_096,
};

export const initialInterSiteState = (): InterSiteBridgeState => ({
  schemaVersion: 2,
  nextSequence: 1,
  outbox: [],
  receivedMessageIds: [],
  deadLetters: [],
  inboundSequenceBySource: {},
});

const requireRecord = (raw: unknown, field: string): Record<string, unknown> => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${field} must be an object.`);
  }
  return raw as Record<string, unknown>;
};

const onlyKeys = (value: Record<string, unknown>, keys: readonly string[], field: string): void => {
  const allowed = new Set(keys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`${field} contains unsupported field "${unexpected}".`);
};

const validDate = (value: unknown, field: string): string => {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`${field} is not a valid timestamp.`);
  }
  return value;
};

const validateFailureCategory = (value: unknown, field: string): void => {
  if (
    value !== undefined &&
    (typeof value !== "string" || value.length === 0 || value.length > 80)
  ) {
    throw new Error(`${field} is invalid.`);
  }
};

const validatePending = (
  raw: unknown,
  field: string,
  limits: InterSiteStateLimits,
): PendingDelivery => {
  const pending = requireRecord(raw, field);
  onlyKeys(pending, ["envelope", "attempts", "nextAttemptAt", "lastFailureCategory"], field);
  validateInterSiteEnvelope(pending.envelope);
  if (
    !Number.isSafeInteger(pending.attempts) ||
    (pending.attempts as number) < 0 ||
    (pending.attempts as number) >= limits.maxDeliveryAttempts
  ) {
    throw new Error(`${field}.attempts is outside the retry policy.`);
  }
  validDate(pending.nextAttemptAt, `${field}.nextAttemptAt`);
  validateFailureCategory(pending.lastFailureCategory, `${field}.lastFailureCategory`);
  return raw as PendingDelivery;
};

const validateDeadLetter = (
  raw: unknown,
  field: string,
  limits: InterSiteStateLimits,
): DeadLetterDelivery => {
  const dead = requireRecord(raw, field);
  onlyKeys(
    dead,
    ["envelope", "attempts", "nextAttemptAt", "lastFailureCategory", "failedAt"],
    field,
  );
  validateInterSiteEnvelope(dead.envelope);
  if (
    !Number.isSafeInteger(dead.attempts) ||
    (dead.attempts as number) < 1 ||
    (dead.attempts as number) > limits.maxDeliveryAttempts
  ) {
    throw new Error(`${field}.attempts is outside the retry policy.`);
  }
  validDate(dead.nextAttemptAt, `${field}.nextAttemptAt`);
  validDate(dead.failedAt, `${field}.failedAt`);
  validateFailureCategory(dead.lastFailureCategory, `${field}.lastFailureCategory`);
  return raw as DeadLetterDelivery;
};

export const validateInterSiteBridgeState = (
  raw: unknown,
  limits: InterSiteStateLimits = ABSOLUTE_INTER_SITE_LIMITS,
): InterSiteBridgeState => {
  if (Buffer.byteLength(JSON.stringify(raw), "utf8") + 1 > limits.maxStateBytes) {
    throw new Error("Persisted inter-site state exceeds its aggregate byte limit.");
  }
  const state = requireRecord(raw, "bridge state");
  onlyKeys(
    state,
    ["schemaVersion", "nextSequence", "outbox", "receivedMessageIds", "deadLetters", "inboundSequenceBySource"],
    "bridge state",
  );
  if (state.schemaVersion !== 1 && state.schemaVersion !== 2) {
    throw new Error("Unsupported bridge state schema.");
  }
  if (!Number.isSafeInteger(state.nextSequence) || (state.nextSequence as number) < 1) {
    throw new Error("Bridge sequence is invalid.");
  }
  if (!Array.isArray(state.outbox) || state.outbox.length > limits.maxOutbox) {
    throw new Error("Bridge outbox is invalid or exceeds capacity.");
  }
  if (
    !Array.isArray(state.receivedMessageIds) ||
    state.receivedMessageIds.length > limits.maxInboxIds
  ) {
    throw new Error("Bridge inbox is invalid or exceeds capacity.");
  }
  if (!Array.isArray(state.deadLetters) || state.deadLetters.length > limits.maxDeadLetters) {
    throw new Error("Bridge dead-letter queue is invalid or exceeds capacity.");
  }
  const inboundRaw = state.schemaVersion === 1 && state.inboundSequenceBySource === undefined
    ? {}
    : requireRecord(state.inboundSequenceBySource, "bridge state.inboundSequenceBySource");
  if (Object.keys(inboundRaw).length > limits.maxInboundSources) {
    throw new Error("Bridge inbound sequence tracker exceeds source capacity.");
  }
  const inboundSequenceBySource: Record<string, InboundSequenceState> = {};
  for (const [sourceSiteId, rawTracker] of Object.entries(inboundRaw)) {
    if (!SITE_ID_PATTERN.test(sourceSiteId)) {
      throw new Error("Bridge inbound sequence tracker has an unsafe source site ID.");
    }
    const tracker = requireRecord(rawTracker, `bridge state.inboundSequenceBySource.${sourceSiteId}`);
    onlyKeys(
      tracker,
      ["contiguousThrough", "receivedAhead"],
      `bridge state.inboundSequenceBySource.${sourceSiteId}`,
    );
    if (!Number.isSafeInteger(tracker.contiguousThrough) || (tracker.contiguousThrough as number) < 0) {
      throw new Error(`Bridge inbound sequence for "${sourceSiteId}" is invalid.`);
    }
    if (
      !Array.isArray(tracker.receivedAhead) ||
      tracker.receivedAhead.length > limits.maxReceivedAheadPerSource ||
      tracker.receivedAhead.some((sequence) =>
        !Number.isSafeInteger(sequence) ||
        sequence <= (tracker.contiguousThrough as number) ||
        sequence > (tracker.contiguousThrough as number) + limits.maxSequenceAdvance
      )
    ) {
      throw new Error(`Bridge received-ahead sequence set for "${sourceSiteId}" is invalid.`);
    }
    const ahead = [...tracker.receivedAhead] as number[];
    if (
      new Set(ahead).size !== ahead.length ||
      ahead.some((sequence, index) => index > 0 && sequence <= ahead[index - 1])
    ) {
      throw new Error(`Bridge received-ahead sequence set for "${sourceSiteId}" is not unique and sorted.`);
    }
    inboundSequenceBySource[sourceSiteId] = {
      contiguousThrough: tracker.contiguousThrough as number,
      receivedAhead: ahead,
    };
  }

  const outbox = state.outbox.map((pending, index) =>
    validatePending(pending, `bridge state.outbox[${index}]`, limits),
  );
  const deadLetters = state.deadLetters.map((dead, index) =>
    validateDeadLetter(dead, `bridge state.deadLetters[${index}]`, limits),
  );
  const receivedMessageIds = state.receivedMessageIds.map((id, index) => {
    if (typeof id !== "string" || !MESSAGE_ID_PATTERN.test(id)) {
      throw new Error(`bridge state.receivedMessageIds[${index}] is unsafe.`);
    }
    return id;
  });

  const outboundIds = [...outbox, ...deadLetters].map((entry) => entry.envelope.messageId);
  const outboundSequences = [...outbox, ...deadLetters].map((entry) => entry.envelope.sequence);
  if (new Set(outboundIds).size !== outboundIds.length) {
    throw new Error("Bridge state contains duplicate outbound message IDs.");
  }
  if (new Set(outboundSequences).size !== outboundSequences.length) {
    throw new Error("Bridge state contains duplicate outbound sequences.");
  }
  if (new Set(receivedMessageIds).size !== receivedMessageIds.length) {
    throw new Error("Bridge state contains duplicate received message IDs.");
  }
  const highestSequence = outboundSequences.reduce((highest, value) => Math.max(highest, value), 0);
  if ((state.nextSequence as number) <= highestSequence) {
    throw new Error("Bridge nextSequence does not follow persisted outbound messages.");
  }

  return {
    schemaVersion: 2,
    nextSequence: state.nextSequence as number,
    outbox,
    receivedMessageIds,
    deadLetters,
    inboundSequenceBySource,
  };
};

export class InMemoryInterSiteMessageStore implements InterSiteMessageStore {
  private state: InterSiteBridgeState | undefined;

  async load(): Promise<InterSiteBridgeState | undefined> {
    return this.state ? structuredClone(this.state) : undefined;
  }

  async save(state: InterSiteBridgeState): Promise<void> {
    validateInterSiteBridgeState(state);
    this.state = structuredClone(state);
  }
}
