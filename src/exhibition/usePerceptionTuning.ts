import { useEffect, useState } from "react";
import { createDefaultTuning, createDefaultTuningMap, sanitizeTuningMap } from "./perception";
import type { ExhibitionIndividual, PerceptionTuningMap } from "./types";

const STORAGE_KEY = "individuals.perception-tuning.v1";

export function usePerceptionTuning(people: readonly ExhibitionIndividual[]) {
  const [tuningMap, setTuningMap] = useState<PerceptionTuningMap>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return sanitizeTuningMap(people, saved ? JSON.parse(saved) : undefined);
    } catch {
      return createDefaultTuningMap(people);
    }
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tuningMap));
  }, [tuningMap]);

  const setControl = (individualId: string, controlId: string, value: number) => {
    setTuningMap((current) => ({
      ...current,
      [individualId]: {
        ...current[individualId],
        [controlId]: value,
      },
    }));
  };

  const resetIndividual = (individual: ExhibitionIndividual) => {
    setTuningMap((current) => ({
      ...current,
      [individual.id]: createDefaultTuning(individual.perceptionModel),
    }));
  };

  const resetAll = () => setTuningMap(createDefaultTuningMap(people));

  return { tuningMap, setControl, resetIndividual, resetAll };
}
