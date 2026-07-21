import { describe, expect, it } from "vitest";
import { SocietySimulation } from "../SocietySimulation";

describe("SocietySimulation (Phase 2)", () => {
  it("runs a multi-cycle simulation of three Individuals to completion deterministically", async () => {
    const sim = new SocietySimulation();
    const results = await sim.run(3);

    expect(results).toHaveLength(3);

    // Cycle 1: initial self portraits produced (no peer self portraits to observe yet)
    const cycle1 = results[0];
    expect(cycle1.cycle).toBe(1);
    expect(cycle1.selfPortraits).toHaveLength(3);
    expect(Object.keys(cycle1.records)).toEqual(["iris", "morrow", "sable"]);

    // Cycle 2: peers observe cycle 1 self portraits and draw peer portraits
    const cycle2 = results[1];
    expect(cycle2.cycle).toBe(2);
    expect(cycle2.peerPortraits).toHaveLength(6);

    // Cycle 3: received peer portraits from cycle 2 are composited into social portraits
    const cycle3 = results[2];
    expect(cycle3.cycle).toBe(3);
    expect(cycle3.socialPortraits).toHaveLength(3);
    for (const id of ["iris", "morrow", "sable"]) {
      const record = cycle3.records[id];
      expect(record).toBeDefined();
      expect(record?.socialPortrait).toBeDefined();
      expect(record?.reflection.summary).toContain("Group reflected a composite body");
      expect(record?.state.relationships).toBeDefined();
    }
  });

  it("produces identical outcomes across independent deterministic runs", async () => {
    const simA = new SocietySimulation();
    const simB = new SocietySimulation();

    const resultsA = await simA.run(2);
    const resultsB = await simB.run(2);

    expect(resultsA[0].selfPortraits[0].artwork.content).toBe(resultsB[0].selfPortraits[0].artwork.content);
    expect(resultsA[1].records.iris.reflection.summary).toBe(resultsB[1].records.iris.reflection.summary);
    expect(resultsA[1].records.morrow.state.selfConcept.physicalSelf.perceivedSimilarity).toBe(
      resultsB[1].records.morrow.state.selfConcept.physicalSelf.perceivedSimilarity,
    );
  });

  it("preserves non-negotiable physical features during reflection and adaptation", async () => {
    const sim = new SocietySimulation();
    const results = await sim.run(2);

    const irisRecord = results[1].records.iris;
    expect(irisRecord.reflection.physicalAssessment.retainedFeatures).toEqual([
      "shaved oval head",
      "long neck",
      "four-fingered hands",
    ]);

    const sableRecord = results[1].records.sable;
    expect(sableRecord.reflection.physicalAssessment.retainedFeatures).toEqual([
      "elongated face",
      "six-fingered hands",
      "red spinal line",
    ]);
  });

  it("keeps coherence tensioned across a long run instead of converging to one", async () => {
    const sim = new SocietySimulation();
    const results = await sim.run(18);

    for (const id of ["iris", "morrow", "sable"] as const) {
      const records = results.map((result) => result.records[id]);
      const assessments = records
        .slice(2)
        .map((record) => record.reflection.physicalAssessment);
      for (const assessment of assessments) {
        expect(assessment.geometry).toBeDefined();
        expect(assessment.similarityDelta).toBeCloseTo(
          (assessment.geometry?.selfIdealDistance ?? 0) -
            (assessment.geometry?.predictedIdealDistance ?? 0),
          3,
        );
      }
      const finalGeometry = assessments.at(-1)?.geometry;
      // The internal body can approach its ideal, but peers' stable lenses keep
      // the social return measurably elsewhere. That unresolved triangle—not a
      // synthetic oscillation—is the installation's endless pressure.
      expect(finalGeometry?.selfSocialDistance).toBeGreaterThan(0.01);
      expect(finalGeometry?.socialIdealDistance).toBeGreaterThan(0.01);
      expect(finalGeometry?.socialIdealDistance).toBeGreaterThan(
        finalGeometry?.selfIdealDistance ?? 1,
      );
    }
  });

  it("makes reflected bodily adjustments visible in the next self portrait", async () => {
    const sim = new SocietySimulation();
    const results = await sim.run(5);

    for (const id of ["iris", "morrow", "sable"] as const) {
      const beforeReflection = results[2].records[id];
      const afterReflection = results[3].records[id];
      expect(beforeReflection.intent.statement).not.toEqual(afterReflection.intent.statement);
      // Cycle N reflection becomes cycle N+1 intent and therefore body geometry.
      expect(results[3].records[id].intent.statement).toBe(
        results[2].records[id].reflection.nextIntention,
      );
      expect(results[3].records[id].selfPortrait.descriptor?.figure).not.toEqual(
        results[2].records[id].selfPortrait.descriptor?.figure,
      );
    }
  });
});
