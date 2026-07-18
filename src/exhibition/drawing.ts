import type { ArtisticAbility } from "./types";

export interface DrawingEffect {
  readonly styleName: string;
  readonly observationalAccuracy: number;
  readonly proportionAccuracy: number;
  readonly anatomicalCoherence: number;
  readonly lineControl: number;
  readonly detailCapacity: number;
  readonly spatialCoherence: number;
  readonly geometryError: number;
  readonly lineInstability: number;
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

export const resolveDrawingEffect = (ability: ArtisticAbility): DrawingEffect => ({
  styleName: ability.name,
  ...ability.skill,
  geometryError:
    1 -
    mean([
      ability.skill.observationalAccuracy,
      ability.skill.proportionAccuracy,
      ability.skill.anatomicalCoherence,
      ability.skill.spatialCoherence,
    ]),
  lineInstability: 1 - ability.skill.lineControl,
});

export const combineDrawingEffects = (
  effects: readonly DrawingEffect[],
): DrawingEffect | undefined => {
  if (effects.length === 0) return undefined;
  const average = (field: keyof Omit<DrawingEffect, "styleName">) =>
    mean(effects.map((effect) => effect[field]));

  return {
    styleName: effects.map((effect) => effect.styleName).join(" + "),
    observationalAccuracy: average("observationalAccuracy"),
    proportionAccuracy: average("proportionAccuracy"),
    anatomicalCoherence: average("anatomicalCoherence"),
    lineControl: average("lineControl"),
    detailCapacity: average("detailCapacity"),
    spatialCoherence: average("spatialCoherence"),
    geometryError: average("geometryError"),
    lineInstability: average("lineInstability"),
  };
};
