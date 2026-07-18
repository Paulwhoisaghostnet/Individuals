import type {
  ExhibitionIndividual,
  PerceptionModel,
  PerceptionTuning,
  PerceptionTuningMap,
} from "./types";

export interface PerceptionEffect {
  readonly modelId: string;
  readonly geometryWarp: number;
  readonly interiorVisibility: number;
  readonly edgeGain: number;
  readonly fragmentCount: number;
  readonly fragmentScale: number;
  readonly echoCount: number;
  readonly echoSpacing: number;
  readonly temporalDrift: number;
}

export const createDefaultTuning = (model: PerceptionModel): PerceptionTuning =>
  Object.fromEntries(model.controls.map((control) => [control.id, control.defaultValue]));

export const createDefaultTuningMap = (
  people: readonly ExhibitionIndividual[],
): PerceptionTuningMap =>
  Object.fromEntries(people.map((individual) => [individual.id, createDefaultTuning(individual.perceptionModel)]));

export const sanitizeTuningMap = (
  people: readonly ExhibitionIndividual[],
  candidate: unknown,
): PerceptionTuningMap => {
  const defaults = createDefaultTuningMap(people);
  if (!candidate || typeof candidate !== "object") return defaults;
  const input = candidate as Record<string, unknown>;

  return Object.fromEntries(
    people.map((individual) => {
      const provided =
        input[individual.id] && typeof input[individual.id] === "object"
          ? (input[individual.id] as Record<string, unknown>)
          : {};
      const tuning = Object.fromEntries(
        individual.perceptionModel.controls.map((control) => {
          const value = provided[control.id];
          const valid =
            typeof value === "number" &&
            Number.isFinite(value) &&
            value >= control.min &&
            value <= control.max;
          return [control.id, valid ? value : control.defaultValue];
        }),
      );
      return [individual.id, tuning];
    }),
  );
};

const value = (tuning: PerceptionTuning, id: string, fallback: number): number =>
  tuning[id] ?? fallback;

export const resolvePerceptionEffect = (
  model: PerceptionModel,
  tuning: PerceptionTuning,
): PerceptionEffect => {
  switch (model.kind) {
    case "boundary-lock": {
      const edgeGain = value(tuning, "edge-gain", 0.78);
      const interiorLoss = value(tuning, "interior-loss", 0.64);
      const symmetryPull = value(tuning, "symmetry-pull", 0.42);
      return {
        modelId: model.id,
        geometryWarp: (1 - symmetryPull) * 0.42,
        interiorVisibility: 1 - interiorLoss * 0.82,
        edgeGain,
        fragmentCount: 0,
        fragmentScale: 0,
        echoCount: Math.round(1 + edgeGain * 2),
        echoSpacing: 3 + edgeGain * 6,
        temporalDrift: 0,
      };
    }
    case "deferred-mosaic": {
      const retention = value(tuning, "retention", 0.38);
      const fragmentScale = value(tuning, "fragment-scale", 0.62);
      const temporalLag = value(tuning, "temporal-lag", 0.55);
      return {
        modelId: model.id,
        geometryWarp: temporalLag * 0.68,
        interiorVisibility: 0.92,
        edgeGain: 0.38,
        fragmentCount: Math.round(5 + (1 - retention) * 27),
        fragmentScale,
        echoCount: Math.round(1 + temporalLag * 2),
        echoSpacing: 4 + temporalLag * 17,
        temporalDrift: temporalLag,
      };
    }
    case "motion-residue": {
      const echoCount = value(tuning, "echo-count", 4);
      const echoSpacing = value(tuning, "echo-spacing", 16);
      const stillnessFade = value(tuning, "stillness-fade", 0.58);
      return {
        modelId: model.id,
        geometryWarp: 0.18 + stillnessFade * 0.2,
        interiorVisibility: 1 - stillnessFade * 0.68,
        edgeGain: 0.52,
        fragmentCount: 0,
        fragmentScale: 0,
        echoCount: Math.round(echoCount),
        echoSpacing,
        temporalDrift: 0.7,
      };
    }
  }
};

export const combinePerceptionEffects = (
  effects: readonly PerceptionEffect[],
): PerceptionEffect | undefined => {
  if (effects.length === 0) return undefined;
  const average = (key: keyof Omit<PerceptionEffect, "modelId">) =>
    effects.reduce((total, effect) => total + effect[key], 0) / effects.length;
  return {
    modelId: effects.map((effect) => effect.modelId).join("+"),
    geometryWarp: average("geometryWarp"),
    interiorVisibility: average("interiorVisibility"),
    edgeGain: average("edgeGain"),
    fragmentCount: Math.round(average("fragmentCount")),
    fragmentScale: average("fragmentScale"),
    echoCount: Math.round(average("echoCount")),
    echoSpacing: average("echoSpacing"),
    temporalDrift: average("temporalDrift"),
  };
};
