import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ExhibitionIndividual } from "../types";
import {
  createFreshnessWatchdog,
  heartbeatRequiresSnapshot,
  type FreshnessWatchdog,
} from "./freshness";
import { SocietyApiClient } from "./societyApi";
import {
  boundedBackoffDelay,
  createInitialConnectionState,
  reconcileSocietySnapshot,
  snapshotConfirmsDisplayedState,
  societyConnectionReducer,
} from "./state";
import type { PublicSocietySnapshot, RuntimeConfig, SocietyConnectionState } from "./types";
import {
  normalizeSnapshotForExhibition,
  parseHeartbeat,
  parseJsonText,
  parseSocietySnapshot,
} from "./validation";

export interface LiveSocietyConnection {
  readonly state: SocietyConnectionState;
  readonly acceptControlSnapshot: (snapshot: PublicSocietySnapshot) => void;
}

export function useLiveSocietyConnection(
  people: readonly ExhibitionIndividual[],
  config: RuntimeConfig,
  client: SocietyApiClient,
): LiveSocietyConnection {
  const [state, dispatch] = useReducer(
    societyConnectionReducer,
    config.mode,
    createInitialConnectionState,
  );
  const snapshotRef = useRef<PublicSocietySnapshot | undefined>(state.snapshot);
  // React may render an older reducer snapshot after a transport callback has
  // already advanced this imperative ordering fence. Never move the fence back.
  if (state.snapshot) {
    snapshotRef.current = reconcileSocietySnapshot(snapshotRef.current, state.snapshot);
  }
  const normalize = useCallback(
    (snapshot: PublicSocietySnapshot) => normalizeSnapshotForExhibition(snapshot, people),
    [people],
  );

  const acceptControlSnapshot = useCallback(
    (snapshot: PublicSocietySnapshot) => {
      const normalized = normalize(snapshot);
      snapshotRef.current = reconcileSocietySnapshot(snapshotRef.current, normalized);
      dispatch({ type: "snapshot-received", snapshot: normalized, transport: "polling" });
    },
    [normalize],
  );

  useEffect(() => {
    if (config.mode === "local") {
      dispatch({ type: "local-only" });
      return undefined;
    }

    let disposed = false;
    let eventSource: EventSource | undefined;
    let reconnectTimer: number | undefined;
    let pollingTimer: number | undefined;
    let fallbackTimer: number | undefined;
    let streamWatchdog: FreshnessWatchdog | undefined;
    let pollingActive = false;
    let pollInFlight = false;
    let reconnectAttempt = 0;
    let pollFailures = 0;
    let streamHasSnapshot = false;
    const requestControllers = new Set<AbortController>();

    const receiveSnapshot = (
      snapshot: PublicSocietySnapshot,
      transport: "sse" | "polling",
    ): boolean => {
      if (disposed) return false;
      const normalized = normalize(snapshot);
      const confirmsCurrent = snapshotConfirmsDisplayedState(snapshotRef.current, normalized);
      snapshotRef.current = reconcileSocietySnapshot(snapshotRef.current, normalized);
      dispatch({ type: "snapshot-received", snapshot: normalized, transport });
      return confirmsCurrent;
    };

    const fetchSnapshot = async (): Promise<boolean> => {
      if (pollInFlight || disposed) return false;
      pollInFlight = true;
      const controller = new AbortController();
      requestControllers.add(controller);
      try {
        receiveSnapshot(await client.getSnapshot(controller.signal), "polling");
        pollFailures = 0;
        return true;
      } catch {
        if (!disposed) {
          pollFailures += 1;
          dispatch({ type: "poll-failed", attempt: pollFailures });
        }
        return false;
      } finally {
        requestControllers.delete(controller);
        pollInFlight = false;
      }
    };

    const schedulePoll = (delay = config.pollIntervalMs) => {
      if (!pollingActive || disposed || pollingTimer !== undefined) return;
      pollingTimer = window.setTimeout(async () => {
        pollingTimer = undefined;
        await fetchSnapshot();
        schedulePoll();
      }, delay);
    };

    const startPolling = () => {
      if (pollingActive || disposed) return;
      pollingActive = true;
      schedulePoll(0);
    };

    const stopPolling = () => {
      pollingActive = false;
      if (pollingTimer !== undefined) window.clearTimeout(pollingTimer);
      pollingTimer = undefined;
    };

    const connectStream = () => {
      if (disposed) return;
      dispatch({ type: "stream-connecting", attempt: reconnectAttempt });

      let source: EventSource;
      try {
        source = new EventSource(client.eventStreamUrl);
      } catch {
        reconnectAttempt += 1;
        dispatch({ type: "stream-failed", attempt: reconnectAttempt });
        startPolling();
        reconnectTimer = window.setTimeout(connectStream, boundedBackoffDelay(reconnectAttempt));
        return;
      }

      eventSource = source;
      let failed = false;
      const failStream = () => {
        if (disposed || failed) return;
        failed = true;
        streamWatchdog?.stop();
        streamWatchdog = undefined;
        source.close();
        if (eventSource === source) eventSource = undefined;
        reconnectAttempt += 1;
        dispatch({ type: "stream-failed", attempt: reconnectAttempt });
        startPolling();
        reconnectTimer = window.setTimeout(connectStream, boundedBackoffDelay(reconnectAttempt));
      };
      streamWatchdog?.stop();
      streamWatchdog = createFreshnessWatchdog(failStream);
      streamWatchdog.touch();

      source.addEventListener("open", () => {
        if (disposed || failed) return;
        streamWatchdog?.touch();
        dispatch({ type: "stream-open", attempt: reconnectAttempt });
      });

      const onSnapshot = (event: Event) => {
        if (disposed || failed || !(event instanceof MessageEvent)) return;
        try {
          const confirmsCurrent = receiveSnapshot(
            parseSocietySnapshot(parseJsonText(event.data as string)),
            "sse",
          );
          if (confirmsCurrent) {
            streamHasSnapshot = true;
            reconnectAttempt = 0;
            streamWatchdog?.touch();
            stopPolling();
          } else {
            startPolling();
            void fetchSnapshot();
          }
        } catch {
          // A malformed stream payload invalidates the transport, never the last verified state.
          failStream();
        }
      };

      source.addEventListener("society.snapshot", onSnapshot);
      source.addEventListener("message", onSnapshot);
      source.addEventListener("society.heartbeat", (event) => {
        if (disposed || failed || !(event instanceof MessageEvent)) return;
        try {
          const heartbeat = parseHeartbeat(parseJsonText(event.data as string));
          reconnectAttempt = 0;
          streamWatchdog?.touch();
          dispatch({ type: "heartbeat", heartbeat });
          if (heartbeatRequiresSnapshot(snapshotRef.current, heartbeat)) {
            startPolling();
            void fetchSnapshot();
          } else {
            stopPolling();
          }
        } catch {
          // A malformed heartbeat carries no state and can be ignored safely.
        }
      });
      source.addEventListener("society.invalidate", () => void fetchSnapshot());
      source.addEventListener("error", failStream);
    };

    if (config.mode === "auto") {
      fallbackTimer = window.setTimeout(
        () => dispatch({ type: "fallback-activated" }),
        config.localFallbackAfterMs,
      );
    }
    void fetchSnapshot().then((connected) => {
      if (!connected && !streamHasSnapshot) startPolling();
    });
    connectStream();

    return () => {
      disposed = true;
      eventSource?.close();
      streamWatchdog?.stop();
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (pollingTimer !== undefined) window.clearTimeout(pollingTimer);
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      for (const controller of requestControllers) controller.abort();
    };
  }, [client, config.localFallbackAfterMs, config.mode, config.pollIntervalMs, normalize]);

  return { state, acceptControlSnapshot };
}
