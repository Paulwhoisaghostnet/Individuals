import { describe, expect, it } from "vitest";

import type { FigureDescriptor } from "../../core/model";
import { applyBodyAdjustments, FIGURE_DIMENSIONS } from "../geometry";

const neutralFigure: FigureDescriptor = {
  headAspect: 0.5,
  shoulderWidth: 0.5,
  torsoWidth: 0.5,
  torsoLength: 0.5,
  armLength: 0.5,
  legLength: 0.5,
  openness: 0.5,
  verticality: 0.5,
  symmetry: 0.5,
  centerX: 0.5,
  postureLean: 0,
};

describe("signed body geometry", () => {
  it.each(FIGURE_DIMENSIONS)("honors positive and negative direction for %s", (dimension) => {
    const positive = applyBodyAdjustments(neutralFigure, [
      { dimension, direction: 1, magnitude: 0.1, basis: "ideal" },
    ]);
    const negative = applyBodyAdjustments(neutralFigure, [
      { dimension, direction: -1, magnitude: 0.1, basis: "social" },
    ]);

    expect(positive[dimension]).toBeGreaterThan(neutralFigure[dimension]);
    expect(negative[dimension]).toBeLessThan(neutralFigure[dimension]);
  });

  it("fails closed on non-finite or out-of-contract adjustments", () => {
    expect(() =>
      applyBodyAdjustments(neutralFigure, [
        { dimension: "openness", direction: 1, magnitude: Number.NaN, basis: "self" },
      ]),
    ).toThrow(/signed geometry contract/);
    expect(() =>
      applyBodyAdjustments(neutralFigure, [
        { dimension: "openness", direction: 1, magnitude: 0.5, basis: "self" },
      ]),
    ).toThrow(/signed geometry contract/);
  });
});
