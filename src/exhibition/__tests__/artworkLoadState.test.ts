import { describe, expect, it } from "vitest";
import { transitionArtworkLoadState } from "../portrait/useArtworkLoadState";

describe("live artwork load state", () => {
  it("does not replace a loaded artwork when its old watchdog fires", () => {
    const loaded = transitionArtworkLoadState(undefined, "/portrait-a.svg", "loaded");
    expect(transitionArtworkLoadState(loaded, "/portrait-a.svg", "timed-out")).toBe(loaded);
  });

  it("tracks failures by exact URL so a newer portrait gets its own attempt", () => {
    const failed = transitionArtworkLoadState(undefined, "/portrait-a.svg", "failed");
    const loaded = transitionArtworkLoadState(failed, "/portrait-b.svg", "loaded");

    expect(loaded).toEqual({ url: "/portrait-b.svg", status: "loaded" });
  });
});
