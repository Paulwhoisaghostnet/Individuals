import { describe, expect, it } from "vitest";
import { generatePortrait } from "../generative";

describe("generative portraits", () => {
  it("reproduces the same portrait for the same identity cycle", () => {
    const first = generatePortrait("contour", "willow", "iris", 7, "self");
    const second = generatePortrait("contour", "willow", "iris", 7, "self");

    expect(second).toEqual(first);
  });

  it("changes the portrait when the cycle or observer changes", () => {
    const self = generatePortrait("thread", "longline", "sable", 7, "self");
    const next = generatePortrait("thread", "longline", "sable", 8, "self");
    const perceived = generatePortrait("thread", "longline", "sable", 7, "peer", "morrow");

    expect(next.seed).not.toBe(self.seed);
    expect(perceived.seed).not.toBe(self.seed);
  });

  it("gives the fragment language a denser field of omissions", () => {
    const portrait = generatePortrait("fragment", "compact", "morrow", 7, "self");

    expect(portrait.fragments).toHaveLength(17);
  });

  it("always generates a complete recognizable body and its ideal registration", () => {
    const portrait = generatePortrait("contour", "willow", "iris", 7, "social");

    expect(portrait.body.torsoPath).toContain("Z");
    expect(portrait.body.leftArmPath).toContain("C");
    expect(portrait.body.rightLegPath).toContain("C");
    expect(portrait.body.fingerCount).toBe(4);
    expect(portrait.idealBody.head.x).toBe(400);
  });
});
