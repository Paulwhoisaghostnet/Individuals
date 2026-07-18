import { describe, expect, it } from "vitest";
import { generatePortrait } from "../generative";

describe("generative portraits", () => {
  it("reproduces the same portrait for the same identity cycle", () => {
    const first = generatePortrait("contour", "iris", 7, "self");
    const second = generatePortrait("contour", "iris", 7, "self");

    expect(second).toEqual(first);
  });

  it("changes the portrait when the cycle or observer changes", () => {
    const self = generatePortrait("thread", "sable", 7, "self");
    const next = generatePortrait("thread", "sable", 8, "self");
    const perceived = generatePortrait("thread", "sable", 7, "peer", "morrow");

    expect(next.seed).not.toBe(self.seed);
    expect(perceived.seed).not.toBe(self.seed);
  });

  it("gives the fragment language a denser field of omissions", () => {
    const portrait = generatePortrait("fragment", "morrow", 7, "self");

    expect(portrait.fragments).toHaveLength(28);
  });
});
