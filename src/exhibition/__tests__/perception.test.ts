import { describe, expect, it } from "vitest";
import { individuals } from "../data";
import { generatePortrait } from "../generative";
import {
  createDefaultTuning,
  createDefaultTuningMap,
  resolvePerceptionEffect,
  sanitizeTuningMap,
} from "../perception";

describe("perception models", () => {
  it("assigns a unique distortion model to every Individual", () => {
    const modelIds = individuals.map((individual) => individual.perceptionModel.id);
    const kinds = individuals.map((individual) => individual.perceptionModel.kind);

    expect(new Set(modelIds).size).toBe(individuals.length);
    expect(new Set(kinds).size).toBe(individuals.length);
  });

  it("turns each model into a distinct normalized visual effect", () => {
    const effects = individuals.map((individual) =>
      resolvePerceptionEffect(
        individual.perceptionModel,
        createDefaultTuning(individual.perceptionModel),
      ),
    );

    expect(effects[0].fragmentCount).toBe(0);
    expect(effects[1].fragmentCount).toBeGreaterThan(15);
    expect(effects[2].echoCount).toBe(4);
  });

  it("changes peer rendering when a perception slider changes", () => {
    const observer = individuals[1];
    const subject = individuals[0];
    const defaults = createDefaultTuning(observer.perceptionModel);
    const defaultEffect = resolvePerceptionEffect(observer.perceptionModel, defaults);
    const tunedEffect = resolvePerceptionEffect(observer.perceptionModel, {
      ...defaults,
      retention: 0.9,
      "fragment-scale": 0.15,
    });
    const baseline = generatePortrait(
      observer.visualLanguage,
      subject.physicalIdentity.bodyPlan,
      subject.id,
      7,
      "peer",
      observer.id,
      defaultEffect,
    );
    const tuned = generatePortrait(
      observer.visualLanguage,
      subject.physicalIdentity.bodyPlan,
      subject.id,
      7,
      "peer",
      observer.id,
      tunedEffect,
    );

    expect(tuned.fragments.length).toBeLessThan(baseline.fragments.length);
    expect(tuned.seed).not.toBe(baseline.seed);
  });

  it("repairs invalid persisted settings from model defaults", () => {
    const sanitized = sanitizeTuningMap(individuals, {
      iris: { "edge-gain": 4 },
      morrow: { retention: "invalid" },
    });
    const defaults = createDefaultTuningMap(individuals);

    expect(sanitized.iris["edge-gain"]).toBe(defaults.iris["edge-gain"]);
    expect(sanitized.morrow.retention).toBe(defaults.morrow.retention);
  });
});
