import { describe, expect, it } from "vitest";

import { figureDistance } from "../../core/figureGeometry";
import type { FigureDescriptor, IndividualManifest } from "../../core/model";
import { irisManifest } from "../../identity-packages/iris";
import { morrowManifest } from "../../identity-packages/morrow";
import { sableManifest } from "../../identity-packages/sable";
import { calculateCoherencePressure } from "../coherence";

const runPureIdentityCycles = (
  manifest: IndividualManifest,
  count: number,
): FigureDescriptor => {
  const ideal = manifest.identity.idealPhysicalForm.visualSpecification!.figure;
  const embodiedPrior = manifest.identity.initialPhysicalSelf.bodyBelief!;
  const disposition = manifest.identity.socialDisposition;
  let current = { ...embodiedPrior };
  for (let cycle = 0; cycle < count; cycle += 1) {
    current = calculateCoherencePressure({
      idealFigure: ideal,
      embodiedPrior,
      currentFigure: current,
      selfIntegrity: disposition.selfIntegrity,
      socialPermeability: disposition.socialPermeability,
      resistance: disposition.resistance,
      curiosity: disposition.curiosity,
    }).adjustedFigure;
  }
  return current;
};

describe("identity coherence pressure", () => {
  it.each([
    ["Iris", irisManifest],
    ["Morrow", morrowManifest],
    ["Sable", sableManifest],
  ] as const)(
    "keeps %s's authored embodied tension after 1,000 evidence-free cycles",
    (_name, manifest) => {
      const ideal = manifest.identity.idealPhysicalForm.visualSpecification!.figure;
      const finalFigure = runPureIdentityCycles(manifest, 1_000);
      const residual = figureDistance(finalFigure, ideal);

      expect(residual).toBeGreaterThan(0.001);
      expect(Number((1 - residual).toFixed(4))).toBeLessThan(1);
      expect(finalFigure).not.toEqual(ideal);
    },
  );

  it("settles into different residual geometry for each authored identity", () => {
    const settled = [irisManifest, morrowManifest, sableManifest].map((manifest) =>
      runPureIdentityCycles(manifest, 1_000),
    );

    expect(figureDistance(settled[0], settled[1])).toBeGreaterThan(0.05);
    expect(figureDistance(settled[1], settled[2])).toBeGreaterThan(0.05);
    expect(figureDistance(settled[0], settled[2])).toBeGreaterThan(0.05);
  });
});
