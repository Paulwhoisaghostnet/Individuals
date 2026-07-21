import { describe, expect, it } from "vitest";
import { individuals } from "../data";
import { createLocalRuntimeState, parseLocalRuntimeState } from "../runtime/localSimulation";

describe("exhibition local persistence", () => {
  it("accepts only the versioned deterministic local state", () => {
    const state = createLocalRuntimeState(individuals, 12);
    expect(parseLocalRuntimeState(state, individuals)).toEqual(state);
  });

  it("repairs malformed cycles without trusting persisted input", () => {
    const repaired = parseLocalRuntimeState(
      { version: 1, paused: "yes", cycles: { iris: -4, morrow: "12", sable: 9 } },
      individuals,
    );
    expect(repaired).toEqual(createLocalRuntimeState(individuals));
  });
});
