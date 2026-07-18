import type {
  CycleEvent,
  ExhibitionIndividual,
  IndividualPhase,
  IndividualPresence,
} from "./types";

const phases: readonly IndividualPhase[] = ["drawing", "observing", "receiving", "reflecting"];

const peerName = (
  individual: ExhibitionIndividual,
  people: readonly ExhibitionIndividual[],
  cycle: number,
): string => {
  const peers = people.filter((peer) => peer.id !== individual.id);
  return peers[(cycle + individual.cycleOffset) % peers.length]?.name ?? "a peer";
};

export const getPresence = (
  individual: ExhibitionIndividual,
  people: readonly ExhibitionIndividual[],
  cycle: number,
): IndividualPresence => {
  const phase = phases[(cycle + individual.cycleOffset) % phases.length];
  const peer = peerName(individual, people, cycle);
  const activities: Record<IndividualPhase, string> = {
    drawing: "drawing a new self",
    observing: `observing ${peer}`,
    receiving: "receiving the world",
    reflecting: "reconsidering the image",
  };

  return { individual, phase, activity: activities[phase] };
};

export const createCycleEvent = (
  people: readonly ExhibitionIndividual[],
  cycle: number,
): CycleEvent => {
  const subject = people[cycle % people.length];
  const peers = people.filter((person) => person.id !== subject.id);
  return {
    cycle,
    sentence: `${subject.name} received ${peers.length} interpretations and began again.`,
  };
};
