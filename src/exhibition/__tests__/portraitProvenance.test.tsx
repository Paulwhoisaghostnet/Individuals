import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExhibitionGallery } from "../ExhibitionGallery";
import { individuals } from "../data";
import type { RuntimeIndividualView } from "../runtime/types";

const awaitingRuntime = Object.fromEntries(
  individuals.map((individual): [string, RuntimeIndividualView] => [
    individual.id,
    {
      id: individual.id,
      cycle: 0,
      phase: "idle",
      activity: "awaiting verified runtime",
      isPaused: false,
      isRunningCycle: false,
      portraits: { peers: [] },
    },
  ]),
);

describe("portrait provenance", () => {
  it("marks connecting artwork as an unverified local study and exposes one entry action", () => {
    const markup = renderToStaticMarkup(
      <ExhibitionGallery
        people={individuals}
        runtime={awaitingRuntime}
        artworkMode="unverified-study"
        onSelect={() => undefined}
      />,
    );

    expect(markup).toContain("unverified local study · awaiting runtime portrait");
    expect(markup.match(/<button/g)).toHaveLength(individuals.length);
    expect(markup).toContain('aria-describedby="iris-gallery-description"');
  });

  it("does not overlay local simulation studies with live provenance", () => {
    const markup = renderToStaticMarkup(
      <ExhibitionGallery
        people={individuals}
        runtime={awaitingRuntime}
        artworkMode="local-simulation"
        onSelect={() => undefined}
      />,
    );

    expect(markup).not.toContain("awaiting live");
    expect(markup).not.toContain("unverified local study");
  });
});
