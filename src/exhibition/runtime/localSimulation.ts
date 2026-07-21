import type { ExhibitionIndividual } from "../types";

export const LOCAL_CYCLE_DURATION_MS = 14_000;
export const LOCAL_RUNTIME_STORAGE_KEY = "individuals.local-runtime.v1";

export interface LocalRuntimeState {
  readonly version: 1;
  readonly cycles: Readonly<Record<string, number>>;
  readonly paused: boolean;
}

export const createLocalRuntimeState = (
  people: readonly ExhibitionIndividual[],
  initialCycle = 7,
): LocalRuntimeState => ({
  version: 1,
  cycles: Object.fromEntries(people.map(({ id }) => [id, initialCycle])),
  paused: false,
});

export const parseLocalRuntimeState = (
  candidate: unknown,
  people: readonly ExhibitionIndividual[],
): LocalRuntimeState => {
  const fallback = createLocalRuntimeState(people);
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return fallback;
  const input = candidate as Record<string, unknown>;
  if (input.version !== 1 || typeof input.paused !== "boolean") return fallback;
  if (typeof input.cycles !== "object" || input.cycles === null || Array.isArray(input.cycles)) {
    return fallback;
  }
  const cyclesInput = input.cycles as Record<string, unknown>;
  const cycles: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const { id } of people) {
    const cycle = cyclesInput[id];
    if (!Number.isInteger(cycle) || (cycle as number) < 0 || (cycle as number) > 10_000_000) {
      return fallback;
    }
    cycles[id] = cycle as number;
  }
  return { version: 1, cycles, paused: input.paused };
};

export const advanceLocalRuntime = (state: LocalRuntimeState): LocalRuntimeState => ({
  ...state,
  cycles: Object.fromEntries(Object.entries(state.cycles).map(([id, cycle]) => [id, cycle + 1])),
});

export const setLocalRuntimePaused = (
  state: LocalRuntimeState,
  paused: boolean,
): LocalRuntimeState => ({ ...state, paused });
