import { describe, expect, it } from "vitest";
import type { Portrait } from "../model";
import { InMemoryIndividualRepository, InMemoryMemoryStore } from "../persistence/inMemory";
import { createTemplateIndividual } from "../template/createTemplateIndividual";
import { createTemplateManifest } from "../template/manifest";

const makePortrait = (overrides: Partial<Portrait> = {}): Portrait => ({
  id: "peer-a--1--self",
  cycle: 1,
  artistId: "peer-a",
  subjectId: "peer-a",
  role: "self",
  createdAt: "2026-01-01T00:00:00.000Z",
  artwork: {
    format: "procedural",
    width: 800,
    height: 1000,
    content: "{}",
  },
  sourcePortraitIds: [],
  ...overrides,
});

describe("IndividualEngine", () => {
  it("runs a first cycle and persists the evolving identity", async () => {
    const repository = new InMemoryIndividualRepository();
    const memory = new InMemoryMemoryStore();
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const individual = createTemplateIndividual({ manifest, repository, memory });

    const firstCycle = await individual.runCycle({
      peerSelfPortraits: [makePortrait()],
      receivedPeerPortraits: [],
    });

    expect(firstCycle.cycle).toBe(1);
    expect(firstCycle.selfPortrait.subjectId).toBe("iris");
    expect(firstCycle.peerPortraits).toHaveLength(1);
    expect(firstCycle.peerPortraits[0].subjectId).toBe("peer-a");
    expect(firstCycle.socialPortrait).toBeUndefined();

    const secondCycle = await individual.runCycle({
      peerSelfPortraits: [makePortrait({ cycle: 2, id: "peer-a--2--self" })],
      receivedPeerPortraits: [
        makePortrait({
          id: "peer-a--1--peer--iris",
          artistId: "peer-a",
          subjectId: "iris",
          role: "peer",
        }),
      ],
    });

    expect(secondCycle.cycle).toBe(2);
    expect(secondCycle.socialPortrait?.sourcePortraitIds).toEqual(["peer-a--1--peer--iris"]);
    expect(secondCycle.state.selfConcept.confidence).toBeGreaterThan(
      firstCycle.state.selfConcept.confidence,
    );

    const saved = await repository.load("iris");
    const memories = await memory.recall({ individualId: "iris", limit: 10 });
    expect(saved?.state.cycle).toBe(2);
    expect(memories).toHaveLength(2);
  });

  it("rejects feedback that is not a peer portrait of the Individual", async () => {
    const individual = createTemplateIndividual({
      manifest: createTemplateManifest({ id: "iris", displayName: "Iris" }),
    });

    await expect(
      individual.runCycle({
        peerSelfPortraits: [],
        receivedPeerPortraits: [makePortrait()],
      }),
    ).rejects.toThrow('must be a peer portrait of "iris"');
  });

  it("rejects invalid manifest trait ranges", () => {
    const manifest = createTemplateManifest();

    expect(() =>
      createTemplateIndividual({
        manifest: {
          ...manifest,
          identity: {
            ...manifest.identity,
            traits: [{ name: "impossible", description: "Out of range.", value: 2 }],
          },
        },
      }),
    ).toThrow('Trait "impossible" must have a value between 0 and 1.');
  });
});
