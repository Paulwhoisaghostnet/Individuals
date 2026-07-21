import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { individuals } from "../data";
import { createDefaultTuning } from "../perception";
import { PerceptionCalibration } from "../PerceptionCalibration";
import type { RuntimeIndividualView } from "../runtime/types";

const morrowRuntime: RuntimeIndividualView = {
  id: "morrow",
  cycle: 9,
  phase: "idle",
  activity: "between cycles",
  isPaused: false,
  isRunningCycle: false,
  portraits: {
    self: {
      id: "3333333333333333333333333333333333333333",
      cycle: 9,
      format: "svg",
      url: "/api/v1/portraits/3333333333333333333333333333333333333333.svg",
      width: 800,
      height: 1000,
      createdAt: "2026-07-21T18:00:09.000Z",
    },
    peers: [],
  },
};

describe("perception calibration provenance", () => {
  it("uses a verified subject artwork while identifying the transformed pane as modeled", () => {
    const markup = renderToStaticMarkup(
      <PerceptionCalibration
        people={individuals}
        observer={individuals[0]}
        tuning={createDefaultTuning(individuals[0].perceptionModel)}
        fallbackCycle={7}
        verifiedSource="live"
        controlTarget="live"
        runtimeIndividuals={{ morrow: morrowRuntime }}
      />,
    );

    expect(markup).toContain(morrowRuntime.portraits.self?.url);
    expect(markup).toContain("verified runtime source");
    expect(markup).toContain("modeled local preview");
    expect(markup).toContain("not a live peer drawing");
    expect(markup).not.toContain("Live comparison");
  });

  it("does not describe a generated study as verified while targeting live controls", () => {
    const markup = renderToStaticMarkup(
      <PerceptionCalibration
        people={individuals}
        observer={individuals[0]}
        tuning={createDefaultTuning(individuals[0].perceptionModel)}
        fallbackCycle={7}
        verifiedSource="local"
        controlTarget="live"
        runtimeIndividuals={{}}
      />,
    );

    expect(markup).toContain("unverified source study");
    expect(markup).toContain("no verified live artwork displayed");
    expect(markup).not.toContain("verified runtime source");
  });
});
