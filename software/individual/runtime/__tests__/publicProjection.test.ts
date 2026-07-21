import { describe, expect, it } from "vitest";

import { createSocietyApiDto } from "../publicProjection";
import type { RuntimeSummary } from "../societyRuntimeTypes";

const summary = (startedAt?: string): RuntimeSummary => ({
  lifecycle: "running",
  revision: 1,
  ...(startedAt === undefined ? {} : { startedAt }),
  activeCycles: 0,
  pausedIndividuals: 0,
  policy: {
    windowCycles: 0,
    windowLimit: 12,
    estimatedProviderCallsToday: 0,
    dailyProviderCallLimit: 1_000,
  },
});

describe("public society projection", () => {
  it("fails closed when a live runtime has no instance start identity", () => {
    expect(() =>
      createSocietyApiDto([], summary(), "2026-07-21T18:00:00.000Z"),
    ).toThrow(/runtime instance start time/);
  });

  it("publishes the exact runtime instance start identity", () => {
    const startedAt = "2026-07-21T17:00:00.000Z";
    expect(
      createSocietyApiDto([], summary(startedAt), "2026-07-21T18:00:00.000Z").runtime.startedAt,
    ).toBe(startedAt);
  });
});
