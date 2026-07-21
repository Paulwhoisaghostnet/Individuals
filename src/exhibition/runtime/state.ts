import type {
  PublicSocietySnapshot,
  RuntimeMode,
  RuntimeSource,
  SocietyConnectionState,
  SocietyHeartbeat,
} from "./types";

export const MIN_RECONNECT_DELAY_MS = 1_000;
export const MAX_RECONNECT_DELAY_MS = 30_000;

export const boundedBackoffDelay = (
  attempt: number,
  random: () => number = Math.random,
): number => {
  const exponent = Math.max(0, Math.min(10, Math.floor(attempt) - 1));
  const uncapped = MIN_RECONNECT_DELAY_MS * 2 ** exponent;
  const capped = Math.min(MAX_RECONNECT_DELAY_MS, uncapped);
  const jitter = 0.8 + Math.max(0, Math.min(1, random())) * 0.4;
  return Math.min(MAX_RECONNECT_DELAY_MS, Math.round(capped * jitter));
};

/**
 * Prevents a slower poll or control response from overwriting a newer SSE
 * snapshot. Revisions are monotonic within one runtime instance; a changed
 * startedAt explicitly identifies a restarted instance whose revision may reset.
 */
export const reconcileSocietySnapshot = (
  current: PublicSocietySnapshot | undefined,
  incoming: PublicSocietySnapshot,
): PublicSocietySnapshot => {
  if (!current) return incoming;
  const currentStartedAt = current.runtime.startedAt;
  const incomingStartedAt = incoming.runtime.startedAt;
  const knownRestart = currentStartedAt !== incomingStartedAt;
  if (knownRestart) {
    return Date.parse(incomingStartedAt) > Date.parse(currentStartedAt) ? incoming : current;
  }

  const currentRevision = Number(current.revision);
  const incomingRevision = Number(incoming.revision);
  if (incomingRevision <= currentRevision) return current;

  const currentCycles = new Map(current.individuals.map(({ id, cycle }) => [id, cycle]));
  const regressed = incoming.individuals.some(({ id, cycle }) => {
    const priorCycle = currentCycles.get(id);
    return priorCycle !== undefined && cycle < priorCycle;
  });
  return regressed ? current : incoming;
};

/** True when an incoming payload proves that the state currently on screen is current. */
export const snapshotConfirmsDisplayedState = (
  current: PublicSocietySnapshot | undefined,
  incoming: PublicSocietySnapshot,
): boolean => {
  if (!current) return true;
  const reconciled = reconcileSocietySnapshot(current, incoming);
  if (reconciled === incoming) return true;
  return (
    current.runtime.startedAt === incoming.runtime.startedAt &&
    current.revision === incoming.revision
  );
};

export type SocietyConnectionAction =
  | { readonly type: "local-only" }
  | { readonly type: "stream-connecting"; readonly attempt: number }
  | { readonly type: "stream-open"; readonly attempt: number }
  | {
      readonly type: "snapshot-received";
      readonly snapshot: PublicSocietySnapshot;
      readonly transport: "sse" | "polling";
    }
  | { readonly type: "heartbeat"; readonly heartbeat: SocietyHeartbeat }
  | { readonly type: "stream-failed"; readonly attempt: number }
  | { readonly type: "poll-failed"; readonly attempt: number }
  | { readonly type: "fallback-activated" };

export const createInitialConnectionState = (mode: RuntimeMode): SocietyConnectionState => ({
  connection:
    mode === "local"
      ? {
          phase: "local",
          transport: "none",
          attempt: 0,
          hasConnected: false,
          snapshotCurrent: false,
          message: "Local simulation selected",
        }
      : {
          phase: "connecting",
          transport: "none",
          attempt: 0,
          hasConnected: false,
          snapshotCurrent: false,
          message: "Contacting the society runtime",
        },
  fallbackActive: mode === "local",
});

export const societyConnectionReducer = (
  state: SocietyConnectionState,
  action: SocietyConnectionAction,
): SocietyConnectionState => {
  switch (action.type) {
    case "local-only":
      return {
        connection: {
          phase: "local",
          transport: "none",
          attempt: 0,
          hasConnected: false,
          snapshotCurrent: false,
          message: "Deterministic local simulation",
        },
        fallbackActive: true,
      };
    case "stream-connecting":
      return {
        ...state,
        connection: {
          ...state.connection,
          phase: state.snapshot ? "degraded" : "connecting",
          transport: state.snapshot ? "polling" : "none",
          attempt: action.attempt,
          message: state.snapshot
            ? "Live state held while the stream reconnects"
            : "Connecting to the live society",
        },
      };
    case "stream-open":
      return {
        ...state,
        connection: {
          ...state.connection,
          phase: state.snapshot ? state.connection.phase : "connecting",
          transport: state.snapshot ? state.connection.transport : "none",
          attempt: action.attempt,
          message: "Live stream opened; validating state",
        },
      };
    case "snapshot-received": {
      const snapshot = reconcileSocietySnapshot(state.snapshot, action.snapshot);
      const confirmsDisplayedRevision = snapshotConfirmsDisplayedState(
        state.snapshot,
        action.snapshot,
      );
      const transport =
        action.transport === "polling" && state.connection.transport === "sse"
          ? "sse"
          : action.transport;
      const snapshotCurrent =
        transport === "sse" && action.transport === "polling"
          ? state.connection.snapshotCurrent
          : confirmsDisplayedRevision;
      return {
        snapshot,
        fallbackActive: state.fallbackActive,
        connection: {
          phase: transport === "sse" && snapshotCurrent ? "live" : "degraded",
          transport,
          attempt: transport === "sse" ? 0 : state.connection.attempt,
          hasConnected: true,
          snapshotCurrent,
          lastDataAt: snapshot.generatedAt,
          message:
            transport === "sse"
              ? snapshotCurrent
                ? "Live stream connected"
                : "Stale stream state ignored; reconciling verified state"
              : "Live runtime connected through polling",
        },
      };
    }
    case "heartbeat":
      {
        const revisionMatches =
          state.snapshot?.revision === action.heartbeat.revision &&
          state.snapshot.runtime.startedAt === action.heartbeat.startedAt;
        const hasSnapshot = state.snapshot !== undefined;
        return {
          ...state,
          connection: {
            ...state.connection,
            phase: hasSnapshot ? (revisionMatches ? "live" : "degraded") : "connecting",
            transport: hasSnapshot ? (revisionMatches ? "sse" : "polling") : "none",
            attempt: revisionMatches ? 0 : state.connection.attempt,
            snapshotCurrent: revisionMatches,
            lastDataAt: action.heartbeat.generatedAt,
            message: revisionMatches
              ? "Live stream connected"
              : hasSnapshot
                ? "Live stream advanced; reconciling verified state"
                : "Live stream connected; awaiting state",
          },
        };
      }
    case "stream-failed":
      return {
        ...state,
        connection: {
          ...state.connection,
          phase: state.snapshot ? "degraded" : "connecting",
          transport: state.snapshot ? "polling" : "none",
          attempt: action.attempt,
          snapshotCurrent: false,
          message: state.snapshot
            ? "Live state held; reconnecting with polling"
            : "Live stream unavailable; retrying",
        },
      };
    case "poll-failed":
      return {
        ...state,
        connection: {
          ...state.connection,
          phase: state.snapshot ? "degraded" : "connecting",
          transport: state.snapshot ? state.connection.transport : "none",
          attempt: action.attempt,
          snapshotCurrent: false,
          message: state.snapshot
            ? "Last verified live state held while reconnecting"
            : "Live runtime unavailable; retrying",
        },
      };
    case "fallback-activated":
      if (state.snapshot) return state;
      return {
        ...state,
        fallbackActive: true,
        connection: {
          ...state.connection,
          phase: "local",
          transport: "none",
          message: "Live runtime unavailable; deterministic local simulation active",
        },
      };
  }
};

export const selectRuntimeSource = (
  state: SocietyConnectionState,
  mode: RuntimeMode,
): RuntimeSource => {
  if (state.snapshot) return "live";
  if (mode === "local" || state.fallbackActive) return "local";
  // The static local study remains visible while the first live payload is validated,
  // but its connection label makes clear that it is not live runtime state.
  return "local";
};
