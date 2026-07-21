import { useEffect, useState } from "react";
import { createDefaultTuning, createDefaultTuningMap, sanitizeTuningMap } from "./perception";
import type { ExhibitionIndividual, PerceptionTuningMap } from "./types";

const STORAGE_KEY = "individuals.perception-tuning.v1";

export function usePerceptionTuning(people: readonly ExhibitionIndividual[]) {
  const [tuningMap, setTuningMap] = useState<PerceptionTuningMap>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved || saved.length > 100_000) return createDefaultTuningMap(people);
      return sanitizeTuningMap(people, JSON.parse(saved) as unknown);
    } catch {
      return createDefaultTuningMap(people);
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tuningMap));
    } catch {
      // Persistence is optional; the in-memory calibration remains usable.
    }
  }, [tuningMap]);

  const setControl = (individualId: string, controlId: string, value: number) => {
    const individual = people.find(({ id }) => id === individualId);
    const control = individual?.perceptionModel.controls.find(({ id }) => id === controlId);
    if (!control || !Number.isFinite(value) || value < control.min || value > control.max) return;
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
