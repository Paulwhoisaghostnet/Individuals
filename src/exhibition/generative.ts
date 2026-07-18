import type { PortraitMode, VisualLanguage } from "./types";

const mulberry32 = (seed: number) => {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashSeed = (...parts: readonly (string | number)[]): number => {
  const value = parts.join("|");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export interface GeneratedMark {
  readonly id: string;
  readonly path: string;
  readonly width: number;
  readonly opacity: number;
}

export interface GeneratedFragment {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly opacity: number;
}

export interface GeneratedPortrait {
  readonly seed: number;
  readonly marks: readonly GeneratedMark[];
  readonly fragments: readonly GeneratedFragment[];
  readonly focusX: number;
  readonly focusY: number;
}

const contourPath = (random: () => number, index: number): string => {
  const radiusX = 128 + index * 18;
  const radiusY = 168 + index * 22;
  const wobble = 18 + index * 2;
  const points = Array.from({ length: 12 }, (_, point) => {
    const angle = (Math.PI * 2 * point) / 12;
    const variation = (random() - 0.5) * wobble;
    const x = 400 + Math.cos(angle) * (radiusX + variation);
    const y = 468 + Math.sin(angle) * (radiusY + variation);
    return [x, y] as const;
  });
  return `${points.map(([x, y], point) => `${point === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} Z`;
};

const threadPath = (random: () => number, index: number): string => {
  const startY = 130 + index * 34;
  const bend = (random() - 0.5) * 180;
  const endY = 860 - index * 12 + (random() - 0.5) * 80;
  return `M${80 + random() * 150} ${startY} C${270 + bend} ${260 + random() * 180}, ${530 - bend} ${610 + random() * 140}, ${570 + random() * 150} ${endY}`;
};

export const generatePortrait = (
  language: VisualLanguage,
  identityId: string,
  cycle: number,
  mode: PortraitMode,
  observerId = "self",
): GeneratedPortrait => {
  const seed = hashSeed(language, identityId, cycle, mode, observerId);
  const random = mulberry32(seed);
  const count = mode === "social" ? 18 : mode === "peer" ? 11 : 14;
  const marks = Array.from({ length: count }, (_, index) => ({
    id: `${seed}-mark-${index}`,
    path:
      language === "contour"
        ? contourPath(random, index)
        : threadPath(random, index),
    width: language === "thread" ? 0.7 + random() * 1.8 : 0.6 + random() * 1.2,
    opacity: 0.18 + random() * 0.66,
  }));
  const fragmentCount = language === "fragment" ? 28 : mode === "social" ? 10 : 5;
  const fragments = Array.from({ length: fragmentCount }, (_, index) => ({
    id: `${seed}-fragment-${index}`,
    x: 80 + random() * 570,
    y: 80 + random() * 760,
    width: 20 + random() * (language === "fragment" ? 180 : 80),
    height: 4 + random() * (language === "fragment" ? 76 : 18),
    rotation: -12 + random() * 24,
    opacity: 0.12 + random() * 0.58,
  }));

  return {
    seed,
    marks,
    fragments,
    focusX: 280 + random() * 240,
    focusY: 340 + random() * 250,
  };
};
