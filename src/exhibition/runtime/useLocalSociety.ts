import { useCallback, useEffect, useState } from "react";
import type { ExhibitionIndividual } from "../types";
import { usePerceptionTuning } from "../usePerceptionTuning";
import {
  advanceLocalRuntime,
  createLocalRuntimeState,
  LOCAL_CYCLE_DURATION_MS,
  LOCAL_RUNTIME_STORAGE_KEY,
  parseLocalRuntimeState,
  setLocalRuntimePaused,
  type LocalRuntimeState,
} from "./localSimulation";

const readPersistedState = (people: readonly ExhibitionIndividual[]): LocalRuntimeState => {
  try {
    const serialized = window.localStorage.getItem(LOCAL_RUNTIME_STORAGE_KEY);
    if (!serialized || serialized.length > 100_000) return createLocalRuntimeState(people);
    return parseLocalRuntimeState(JSON.parse(serialized) as unknown, people);
  } catch {
    return createLocalRuntimeState(people);
  }
};

export interface LocalSociety {
  readonly state: LocalRuntimeState;
  readonly tuning: ReturnType<typeof usePerceptionTuning>;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly advance: () => void;
}

export function useLocalSociety(
  people: readonly ExhibitionIndividual[],
  enabled: boolean,
): LocalSociety {
  const [state, setState] = useState<LocalRuntimeState>(() => readPersistedState(people));
  const tuning = usePerceptionTuning(people);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_RUNTIME_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The deterministic fallback remains available for this browser session.
    }
  }, [state]);

  useEffect(() => {
    if (!enabled || state.paused) return undefined;
    const timer = window.setInterval(
      () => setState((current) => advanceLocalRuntime(current)),
      LOCAL_CYCLE_DURATION_MS,
    );
    return () => window.clearInterval(timer);
  }, [enabled, state.paused]);

  const pause = useCallback(() => {
    if (enabled) setState((current) => setLocalRuntimePaused(current, true));
  }, [enabled]);
  const resume = useCallback(() => {
    if (enabled) setState((current) => setLocalRuntimePaused(current, false));
  }, [enabled]);
  const advance = useCallback(() => {
    if (enabled) setState((current) => advanceLocalRuntime(current));
  }, [enabled]);

  return { state, tuning, pause, resume, advance };
}
