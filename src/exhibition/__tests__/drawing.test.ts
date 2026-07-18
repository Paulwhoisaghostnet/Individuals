import { describe, expect, it } from "vitest";
import { individuals } from "../data";
import { resolveDrawingEffect } from "../drawing";
import { generatePortrait } from "../generative";

describe("artistic ability scopes", () => {
  it("gives every Individual a distinct style and bounded drawing proficiency", () => {
    const styleNames = individuals.map(({ artisticAbility }) => artisticAbility.name);
    expect(new Set(styleNames).size).toBe(individuals.length);

    for (const { artisticAbility } of individuals) {
      expect(artisticAbility.primitives.length).toBeGreaterThan(0);
      expect(artisticAbility.limitations.length).toBeGreaterThan(0);
      for (const value of Object.values(artisticAbility.skill)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("turns artistic limitations into a stable rendering effect", () => {
    const iris = resolveDrawingEffect(individuals[0].artisticAbility);
    const morrow = resolveDrawingEffect(individuals[1].artisticAbility);

    expect(iris.lineInstability).toBeLessThan(morrow.lineInstability);
    expect(iris.geometryError).toBeLessThan(morrow.geometryError);
  });

  it("applies the artist's hand after observation and changes the rendered result", () => {
    const irisHand = resolveDrawingEffect(individuals[0].artisticAbility);
    const morrowHand = resolveDrawingEffect(individuals[1].artisticAbility);
    const irisDrawing = generatePortrait("contour", "willow", "sable", 4, "peer", "artist", undefined, irisHand);
    const morrowDrawing = generatePortrait("contour", "willow", "sable", 4, "peer", "artist", undefined, morrowHand);

    expect(irisDrawing.seed).not.toBe(morrowDrawing.seed);
    expect(irisDrawing.drawingEffect?.styleName).toBe("Unbroken Contour");
    expect(morrowDrawing.drawingEffect?.styleName).toBe("Assembled Planes");
  });
});
