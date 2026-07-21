import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FileCycleBudgetStore } from "../cycleBudgetStore";
import { CyclePolicy } from "../cyclePolicy";

describe("durable cycle provider budget", () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ));
  });

  it("preserves the UTC-day provider ceiling across process restarts", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "individuals-budget-"));
    directories.push(directory);
    const nowMs = Date.parse("2026-01-01T12:00:00Z");
    const config = {
      maxEstimatedProviderCallsPerUtcDay: 2,
      estimatedProviderCallsPerCycle: 1,
      minimumCycleSpacingMs: 0,
    };
    const first = new CyclePolicy(config, new FileCycleBudgetStore(directory));
    expect((await first.tryReserve({ individualId: "iris", nowMs, runningCycles: 0 })).allowed).toBe(true);

    const restarted = new CyclePolicy(config, new FileCycleBudgetStore(directory));
    expect((await restarted.tryReserve({ individualId: "morrow", nowMs, runningCycles: 0 })).allowed).toBe(true);
    expect(await restarted.tryReserve({ individualId: "sable", nowMs, runningCycles: 0 })).toMatchObject({
      allowed: false,
      reason: "daily_provider_budget",
    });

    const nextDay = Date.parse("2026-01-02T00:00:01Z");
    expect((await restarted.tryReserve({ individualId: "sable", nowMs: nextDay, runningCycles: 0 })).allowed).toBe(true);
  });
});
