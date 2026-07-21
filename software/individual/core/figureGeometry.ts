import type {
  FigureDescriptor,
  FigureDimension,
  SignedBodyAdjustment,
} from "./model";

export const FIGURE_DIMENSIONS: readonly FigureDimension[] = [
  "headAspect",
  "shoulderWidth",
  "torsoWidth",
  "torsoLength",
  "armLength",
  "legLength",
  "openness",
  "verticality",
  "symmetry",
  "centerX",
  "postureLean",
];

export const clampFigureDimension = (dimension: FigureDimension, value: number): number => {
  const minimum = dimension === "postureLean" ? -1 : 0;
  return Math.min(1, Math.max(minimum, Number.isFinite(value) ? value : 0));
};

export const normalizedDimensionDelta = (
  dimension: FigureDimension,
  left: number,
  right: number,
): number => Math.abs(left - right) / (dimension === "postureLean" ? 2 : 1);

export const figureDistance = (left: FigureDescriptor, right: FigureDescriptor): number =>
  FIGURE_DIMENSIONS.reduce(
    (sum, dimension) =>
      sum + normalizedDimensionDelta(dimension, left[dimension], right[dimension]),
    0,
  ) / FIGURE_DIMENSIONS.length;

export const applyBodyAdjustments = (
  figure: FigureDescriptor,
  adjustments: readonly SignedBodyAdjustment[],
): FigureDescriptor => {
  const next = { ...figure };
  for (const adjustment of adjustments) {
    if (
      !FIGURE_DIMENSIONS.includes(adjustment.dimension) ||
      (adjustment.direction !== -1 && adjustment.direction !== 1) ||
      !Number.isFinite(adjustment.magnitude) ||
      adjustment.magnitude < 0 ||
      adjustment.magnitude > 0.25 ||
      !["ideal", "social", "self"].includes(adjustment.basis)
    ) {
      throw new Error("Body adjustment violates the signed geometry contract.");
    }
    const range = adjustment.dimension === "postureLean" ? 2 : 1;
    next[adjustment.dimension] = clampFigureDimension(
      adjustment.dimension,
      next[adjustment.dimension] + adjustment.direction * adjustment.magnitude * range,
    );
  }
  return next;
};

export const adjustmentsToward = (input: {
  readonly from: FigureDescriptor;
  readonly target: FigureDescriptor;
  readonly rate: number;
  readonly basis: SignedBodyAdjustment["basis"];
  readonly minimumMagnitude?: number;
  readonly maximumMagnitude?: number;
}): readonly SignedBodyAdjustment[] => {
  const rate = Math.min(1, Math.max(0, input.rate));
  const minimum = input.minimumMagnitude ?? 0.0005;
  const maximum = input.maximumMagnitude ?? 0.08;
  return FIGURE_DIMENSIONS.flatMap((dimension) => {
    const range = dimension === "postureLean" ? 2 : 1;
    const signedDistance = (input.target[dimension] - input.from[dimension]) / range;
    const magnitude = Math.min(maximum, Math.abs(signedDistance) * rate);
    if (magnitude < minimum) return [];
    return [
      {
        dimension,
        direction: signedDistance >= 0 ? (1 as const) : (-1 as const),
        magnitude,
        basis: input.basis,
      },
    ];
  });
};
