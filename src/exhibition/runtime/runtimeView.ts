import { createCycleEvent, getPresence } from "../cycle";
import { createDefaultTuningMap, sanitizeTuningMap } from "../perception";
import type { ExhibitionIndividual, PerceptionTuningMap } from "../types";
import type { LocalRuntimeState } from "./localSimulation";
import type {
  PublicIndividualRuntime,
  RuntimeIndividualView,
  RuntimeSource,
  SocietyConnectionState,
  SocietyRuntimeView,
} from "./types";

const statusActivity = (
  runtime: PublicIndividualRuntime,
): Pick<RuntimeIndividualView, "phase" | "activity"> => {
  if (runtime.isPaused || runtime.status === "paused") {
    return { phase: "paused", activity: "paused by curator" };
  }
  switch (runtime.status) {
    case "observing":
      return { phase: "observing", activity: "observing a peer" };
    case "drawing":
      return { phase: "drawing", activity: "drawing now" };
    case "reflecting":
      return { phase: "reflecting", activity: "reconsidering the image" };
    case "idle":
      return { phase: "idle", activity: runtime.isRunningCycle ? "cycle in progress" : "between cycles" };
  }
};

export const formatCycleRange = (cycles: readonly number[]): string => {
  if (cycles.length === 0) return "000";
  const minimum = Math.min(...cycles);
  const maximum = Math.max(...cycles);
  const format = (cycle: number) => String(cycle).padStart(3, "0");
  return minimum === maximum ? format(maximum) : `${format(minimum)}–${format(maximum)}`;
};

interface BuildRuntimeViewInput {
  readonly people: readonly ExhibitionIndividual[];
  readonly source: RuntimeSource;
  readonly connectionState: SocietyConnectionState;
  readonly localState: LocalRuntimeState;
  readonly localTuning: PerceptionTuningMap;
  readonly localOperational: boolean;
}

export const buildRuntimeView = ({
  people,
  source,
  connectionState,
  localState,
  localTuning,
  localOperational,
}: BuildRuntimeViewInput): SocietyRuntimeView => {
  const snapshot = connectionState.snapshot;
  if (source === "live" && snapshot) {
    const runtimeIndividuals: Record<string, RuntimeIndividualView> = Object.create(null) as Record<
      string,
      RuntimeIndividualView
    >;
    for (const runtime of snapshot.individuals) {
      runtimeIndividuals[runtime.id] = {
        id: runtime.id,
        cycle: runtime.cycle,
        ...statusActivity(runtime),
        isPaused: runtime.isPaused,
        isRunningCycle: runtime.isRunningCycle,
        updatedAt: runtime.updatedAt,
        publicReflection: runtime.publicReflection,
        embodiment: runtime.embodiment,
        portraits: runtime.portraits,
      };
    }
    const newestReflection = [...snapshot.individuals]
      .filter(({ publicReflection }) => Boolean(publicReflection))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
    const tuningMap = sanitizeTuningMap(
      people,
      Object.fromEntries(snapshot.individuals.map(({ id, perceptionTuning }) => [id, perceptionTuning])),
    );
    const cycles = people.map(({ id }) => runtimeIndividuals[id]?.cycle ?? 0);
    const transportDegraded =
      connectionState.connection.phase !== "live" ||
      !connectionState.connection.snapshotCurrent;
    const runtimeDegraded = snapshot.runtime.status === "degraded";
    const runtimePaused = snapshot.runtime.status === "paused";
    let sourceLabel = "live society";
    let sourceDescription = connectionState.connection.message;
    if (transportDegraded) {
      sourceLabel = connectionState.connection.snapshotCurrent
        ? "live · polling"
        : "last live · reconnecting";
    } else if (runtimeDegraded) {
      sourceLabel = "live · degraded";
      sourceDescription =
        "Live runtime connected; one or more Individuals are operating in a degraded state";
    } else if (runtimePaused) {
      sourceLabel = "live · paused";
      sourceDescription = "Live runtime connected; society cycles are paused";
    }
    return {
      source: "live",
      artworkMode: "verified-live",
      controlTarget: "live",
      sourceLabel,
      sourceDescription,
      connection: connectionState.connection,
      individuals: runtimeIndividuals,
      tuningMap,
      eventSentence: newestReflection?.publicReflection
        ? `${newestReflection.displayName}: ${newestReflection.publicReflection}`
        : `The society completed cycle ${formatCycleRange(cycles)}.`,
      cycleLabel: formatCycleRange(cycles),
      allPaused: snapshot.individuals.every(({ isPaused }) => isPaused),
      localFallback: false,
    };
  }

  const runtimeIndividuals: Record<string, RuntimeIndividualView> = Object.create(null) as Record<
    string,
    RuntimeIndividualView
  >;
  for (const person of people) {
    const cycle = localOperational ? (localState.cycles[person.id] ?? 7) : 0;
    const presence = localOperational ? getPresence(person, people, cycle) : undefined;
    runtimeIndividuals[person.id] = {
      id: person.id,
      cycle,
      phase: localOperational ? (localState.paused ? "paused" : presence!.phase) : "idle",
      activity: localOperational
        ? localState.paused
          ? "local study paused"
          : presence!.activity
        : "awaiting verified runtime",
      isPaused: localOperational && localState.paused,
      isRunningCycle: localOperational && !localState.paused,
      portraits: { peers: [] },
    };
  }
  const cycles = localOperational ? Object.values(localState.cycles) : [0];
  const maximumCycle = cycles.length > 0 ? Math.max(...cycles) : 7;
  const localEvent = createCycleEvent(people, maximumCycle);
  return {
    source: "local",
    artworkMode: localOperational ? "local-simulation" : "unverified-study",
    controlTarget: localOperational ? "local" : "live",
    sourceLabel: localOperational ? "local simulation" : "connecting",
    sourceDescription: localOperational
      ? "Deterministic browser fallback; no live runtime data is being shown"
      : "Local study held still while the first live state is validated",
    connection: connectionState.connection,
    individuals: runtimeIndividuals,
    tuningMap: localOperational ? localTuning : createDefaultTuningMap(people),
    eventSentence: localOperational ? localEvent.sentence : "Awaiting verified live society state.",
    cycleLabel: formatCycleRange(cycles),
    allPaused: !localOperational || localState.paused,
    localFallback: localOperational,
  };
};
