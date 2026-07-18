import { describe, expect, it } from "vitest";
import { createCycleEvent, getPresence } from "../cycle";
import { individuals } from "../data";

describe("exhibition cycle", () => {
  it("gives every Individual a distinct activity in the same cycle", () => {
    const presences = individuals.map((individual) => getPresence(individual, individuals, 7));

    expect(new Set(presences.map((presence) => presence.phase)).size).toBe(3);
    expect(presences.every((presence) => presence.activity.length > 0)).toBe(true);
  });

  it("creates a concise event for each cycle", () => {
    expect(createCycleEvent(individuals, 8)).toEqual({
      cycle: 8,
      sentence: "Sable received 2 interpretations and began again.",
    });
  });
});
