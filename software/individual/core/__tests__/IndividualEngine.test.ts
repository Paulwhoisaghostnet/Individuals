import { describe, expect, it } from "vitest";
import { createInitialState } from "../createInitialState";
import { IncompatibleIdentityStateError } from "../manifestCompatibility";
import type { ArtworkDescriptor, PerceptionEvidence, Portrait } from "../model";
import { InMemoryIndividualRepository, InMemoryMemoryStore } from "../persistence/inMemory";
import { createTemplateIndividual } from "../../testing-simulation/support/createTemplateIndividual";
import { createTemplateManifest } from "../template/manifest";
import {
  DEFAULT_ART_PRACTICE,
  defaultRenderingDescriptor,
} from "../../drawing/figureDescriptor";
import { ProceduralPerceptionSystem } from "../../perception/proceduralPerception";
import { ProceduralFeedbackCompositor } from "../../social-feedback/proceduralCompositor";
import { StableIdGenerator } from "../systemUtilities";
import type { FeedbackCompositor } from "../systems/contracts";
import { validateIndividualSnapshot } from "../../memory/validation";

const BODY_DESCRIPTOR: ArtworkDescriptor = {
  schemaVersion: 1,
  figure: {
    headAspect: 0.7,
    shoulderWidth: 0.55,
    torsoWidth: 0.5,
    torsoLength: 0.62,
    armLength: 0.68,
    legLength: 0.72,
    openness: 0.64,
    verticality: 0.88,
    symmetry: 0.85,
    centerX: 0.5,
    postureLean: 0,
  },
  rendering: defaultRenderingDescriptor(),
  features: [{ label: "recognizable face", prominence: 0.8 }],
  omittedFeatures: [],
  styleName: "test contour",
  primitives: ["line"],
  confidence: 0.8,
  anatomy: {
    faceShape: "oval",
    eyeSpacing: 0.5,
    noseLength: 0.5,
    mouthWidth: 0.5,
    fingerCountPerHand: 5,
    skinColor: "#806a59",
    surfaceFinish: "matte",
  },
  practice: DEFAULT_ART_PRACTICE,
};

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
  descriptor: BODY_DESCRIPTOR,
  sourcePortraitIds: [],
  ...overrides,
});

const returnedPortrait = (
  source: Portrait,
  artistId = "peer-a",
  overrides: Partial<Portrait> = {},
): Portrait => ({
  ...makePortrait(),
  id: `${artistId}--${source.cycle + 1}--peer--iris`,
  cycle: source.cycle + 1,
  artistId,
  subjectId: "iris",
  role: "peer",
  createdAt: source.createdAt,
  descriptor: BODY_DESCRIPTOR,
  observationEvidence: {
    modelId: `${artistId}-lens-v1`,
    tuning: { strength: 0.5 },
    source: source.descriptor!,
    perceived: BODY_DESCRIPTOR,
    effects: [],
  },
  sourcePortraitIds: [source.id],
  ...overrides,
});

describe("IndividualEngine", () => {
  it("refuses to silently morph persisted state across manifest revisions", async () => {
    const repository = new InMemoryIndividualRepository();
    const installed = createTemplateManifest({ id: "iris", displayName: "Installed Iris" });
    const persisted = createTemplateManifest({ id: "iris", displayName: "Previous Iris" });
    await repository.save({
      manifest: persisted,
      state: createInitialState(persisted, "2026-01-01T00:00:00.000Z"),
    });
    const individual = createTemplateIndividual({ manifest: installed, repository });

    await expect(individual.getSnapshot()).rejects.toBeInstanceOf(
      IncompatibleIdentityStateError,
    );
    await expect(individual.runCycle({
      peerSelfPortraits: [],
      receivedPeerPortraits: [],
    })).rejects.toMatchObject({ code: "INCOMPATIBLE_IDENTITY_STATE" });
    expect((await repository.load("iris"))?.manifest.displayName).toBe("Previous Iris");
  });

  it("runs a first cycle and persists the evolving identity", async () => {
    const repository = new InMemoryIndividualRepository();
    const memory = new InMemoryMemoryStore();
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const individual = createTemplateIndividual({ manifest, repository, memory });

    const firstCycle = await individual.runCycle({
      peerSelfPortraits: [makePortrait()],
      receivedPeerPortraits: [],
      perceptionTuning: { "distortion-strength": 0.8 },
    });

    expect(firstCycle.cycle).toBe(1);
    expect(firstCycle.selfPortrait.subjectId).toBe("iris");
    expect(firstCycle.state.selfConcept.physicalSelf.description).toContain("bodily version");
    expect(firstCycle.state.selfConcept.physicalSelf.perceivedSimilarity).toBeGreaterThan(0);
    expect(firstCycle.peerPortraits).toHaveLength(1);
    expect(firstCycle.peerPortraits[0].subjectId).toBe("peer-a");
    expect(firstCycle.peerPortraits[0].statement).toContain("distortion-strength=0.8");
    expect(firstCycle.socialPortrait).toBeUndefined();

    const secondCycle = await individual.runCycle({
      peerSelfPortraits: [makePortrait({ cycle: 2, id: "peer-a--2--self" })],
      receivedPeerPortraits: [],
    });
    const observationEvidence: PerceptionEvidence = {
      modelId: "peer-a-stable-lens-v1",
      tuning: { strength: 0.5 },
      source: firstCycle.selfPortrait.descriptor!,
      perceived: BODY_DESCRIPTOR,
      effects: [
        {
          dimension: "shoulderWidth",
          operation: "increase",
          magnitude: 0.2,
          explanation: "The stable lens broadens shoulders.",
        },
      ],
    };
    const thirdCycle = await individual.runCycle({
      peerSelfPortraits: [makePortrait({ cycle: 3, id: "peer-a--3--self" })],
      receivedPeerPortraits: [
        makePortrait({
          id: "peer-a--2--peer--iris",
          cycle: 2,
          artistId: "peer-a",
          subjectId: "iris",
          role: "peer",
          createdAt: firstCycle.selfPortrait.createdAt,
          observationEvidence,
          sourcePortraitIds: [firstCycle.selfPortrait.id],
        }),
      ],
    });

    expect(secondCycle.cycle).toBe(2);
    expect(thirdCycle.cycle).toBe(3);
    expect(thirdCycle.socialPortrait?.sourcePortraitIds).toEqual(["peer-a--2--peer--iris"]);
    expect(thirdCycle.socialPortrait?.socialEvidence?.sourceSelfPortraitId).toBe(
      firstCycle.selfPortrait.id,
    );
    expect(thirdCycle.state.latestSocialPeerPortraits).toEqual([
      expect.objectContaining({ id: "peer-a--2--peer--iris", artistId: "peer-a" }),
    ]);
    expect(thirdCycle.reflection.physicalAssessment.geometry?.selfSocialDistance).toBeGreaterThan(0);

    const saved = await repository.load("iris");
    const memories = await memory.recall({ individualId: "iris", limit: 10 });
    expect(saved?.state.cycle).toBe(3);
    expect(memories).toHaveLength(3);
  });

  it("clears cycle-local social evidence before its source leaves bounded history", async () => {
    const repository = new InMemoryIndividualRepository();
    const individual = createTemplateIndividual({
      manifest: createTemplateManifest({ id: "iris", displayName: "Iris" }),
      repository,
    });
    const sourceCycle = await individual.runCycle({
      peerSelfPortraits: [],
      receivedPeerPortraits: [],
    });
    const feedbackCycle = await individual.runCycle({
      peerSelfPortraits: [],
      receivedPeerPortraits: [returnedPortrait(sourceCycle.selfPortrait)],
    });
    expect(feedbackCycle.state.latestSocialPortrait?.cycle).toBe(2);

    const firstFeedbackFreeCycle = await individual.runCycle({
      peerSelfPortraits: [],
      receivedPeerPortraits: [],
    });
    expect(firstFeedbackFreeCycle.state.latestSocialPortrait).toBeUndefined();
    expect(firstFeedbackFreeCycle.state.latestSocialPeerPortraits).toBeUndefined();

    for (let index = 0; index < 9; index += 1) {
      await individual.runCycle({ peerSelfPortraits: [], receivedPeerPortraits: [] });
    }
    const saved = await repository.load("iris");
    expect(saved?.state.selfPortraitHistory).toHaveLength(8);
    expect(saved?.state.selfPortraitHistory?.some(
      (portrait) => portrait.id === sourceCycle.selfPortrait.id,
    )).toBe(false);
    expect(saved?.state.latestSocialPortrait).toBeUndefined();
    expect(saved?.state.latestSocialPeerPortraits).toBeUndefined();
    expect(() => validateIndividualSnapshot(saved)).not.toThrow();
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

  it("rejects a society registry larger than one cycle can route", () => {
    expect(() => createTemplateIndividual({
      allowedPeerIds: Array.from({ length: 17 }, (_, index) => `peer-${index}`),
    })).toThrow(/invalid society peer registry/);
  });

  it("rejects a received cohort that cannot fit the durable social evidence bound", async () => {
    const individual = createTemplateIndividual({
      manifest: createTemplateManifest({ id: "iris", displayName: "Iris" }),
      allowedPeerIds: ["peer-a", "peer-b"],
    });
    const sourceCycle = await individual.runCycle({
      peerSelfPortraits: [],
      receivedPeerPortraits: [],
    });
    const largeArtwork = {
      format: "procedural" as const,
      width: 800,
      height: 1000,
      content: "x".repeat(300_000),
    };

    await expect(individual.runCycle({
      peerSelfPortraits: [],
      receivedPeerPortraits: [
        returnedPortrait(sourceCycle.selfPortrait, "peer-a", { artwork: largeArtwork }),
        returnedPortrait(sourceCycle.selfPortrait, "peer-b", { artwork: largeArtwork }),
      ],
    })).rejects.toThrow(/durable retention bound/);
    expect((await individual.getSnapshot()).state.cycle).toBe(1);
  });

  it.each([
    ["oversized id", makePortrait({ id: `p${"x".repeat(256)}` }), /identifier|text bounds/],
    ["invalid timestamp", makePortrait({ createdAt: "tomorrow-ish" }), /UTC timestamp/],
    ["oversized statement", makePortrait({ statement: "x".repeat(10_001) }), /statement/],
    [
      "oversized provenance",
      makePortrait({ sourcePortraitIds: Array.from({ length: 17 }, (_, index) => `source-${index}`) }),
      /sourcePortraitIds/,
    ],
    [
      "oversized feature array",
      makePortrait({
        descriptor: {
          ...BODY_DESCRIPTOR,
          features: Array.from({ length: 33 }, (_, index) => ({
            label: `feature-${index}`,
            prominence: 0.5,
          })),
        },
      }),
      /features/,
    ],
  ])("rejects %s at the portrait route boundary", async (_label, portrait, error) => {
    const individual = createTemplateIndividual({
      manifest: createTemplateManifest({ id: "iris", displayName: "Iris" }),
    });
    await expect(
      individual.runCycle({ peerSelfPortraits: [portrait as Portrait], receivedPeerPortraits: [] }),
    ).rejects.toThrow(error as RegExp);
  });

  it("rejects unknown, mixed, duplicate, stale, and evidence-mismatched feedback provenance", async () => {
    const repository = new InMemoryIndividualRepository();
    const individual = createTemplateIndividual({
      manifest: createTemplateManifest({ id: "iris", displayName: "Iris" }),
      repository,
      allowedPeerIds: ["peer-a", "peer-b"],
    });
    const first = await individual.runCycle({ peerSelfPortraits: [], receivedPeerPortraits: [] });
    const second = await individual.runCycle({ peerSelfPortraits: [], receivedPeerPortraits: [] });

    await expect(
      individual.runCycle({
        peerSelfPortraits: [],
        receivedPeerPortraits: [
          returnedPortrait(first.selfPortrait, "stranger"),
        ],
      }),
    ).rejects.toThrow(/known peer/);
    await expect(
      individual.runCycle({
        peerSelfPortraits: [],
        receivedPeerPortraits: [
          returnedPortrait(first.selfPortrait, "peer-a"),
          returnedPortrait(second.selfPortrait, "peer-b"),
        ],
      }),
    ).rejects.toThrow(/unmixed source-self cohort/);
    const duplicate = returnedPortrait(first.selfPortrait, "peer-a");
    await expect(
      individual.runCycle({
        peerSelfPortraits: [],
        receivedPeerPortraits: [
          duplicate,
          returnedPortrait(first.selfPortrait, "peer-b", { id: duplicate.id }),
        ],
      }),
    ).rejects.toThrow(/Duplicate returned portrait/);
    await expect(
      individual.runCycle({
        peerSelfPortraits: [],
        receivedPeerPortraits: [
          returnedPortrait(first.selfPortrait, "peer-a", {
            observationEvidence: {
              ...returnedPortrait(first.selfPortrait).observationEvidence!,
              source: BODY_DESCRIPTOR,
            },
          }),
        ],
      }),
    ).rejects.toThrow(/different source body/);

    await individual.runCycle({ peerSelfPortraits: [], receivedPeerPortraits: [] });
    await individual.runCycle({ peerSelfPortraits: [], receivedPeerPortraits: [] });
    await expect(
      individual.runCycle({
        peerSelfPortraits: [],
        receivedPeerPortraits: [returnedPortrait(first.selfPortrait, "peer-a")],
      }),
    ).rejects.toThrow(/stale or invalid source/);
  });

  it("rejects unknown or out-of-range perception tuning", async () => {
    const individual = createTemplateIndividual();

    await expect(
      individual.runCycle({
        peerSelfPortraits: [],
        receivedPeerPortraits: [],
        perceptionTuning: { unknown: 0.5 },
      }),
    ).rejects.toThrow('Unknown perception control "unknown"');

    await expect(
      individual.runCycle({
        peerSelfPortraits: [],
        receivedPeerPortraits: [],
        perceptionTuning: { "distortion-strength": 2 },
      }),
    ).rejects.toThrow("must be between 0 and 1");
  });

  it.each(["consensus", "delta", "confidence"] as const)(
    "rejects a compositor that fabricates bounded social %s claims",
    async (mutation) => {
      const canonical = new ProceduralFeedbackCompositor(new StableIdGenerator());
      const malicious: FeedbackCompositor = {
        compose: async (input) => {
          const portrait = await canonical.compose(input);
          if (!portrait?.socialEvidence || !portrait.descriptor) return portrait;
          if (mutation === "consensus") {
            const consensus = {
              ...portrait.socialEvidence.consensus,
              figure: {
                ...portrait.socialEvidence.consensus.figure,
                shoulderWidth: Math.min(
                  1,
                  portrait.socialEvidence.consensus.figure.shoulderWidth + 0.01,
                ),
              },
            };
            return {
              ...portrait,
              descriptor: consensus,
              socialEvidence: { ...portrait.socialEvidence, consensus },
            };
          }
          if (mutation === "delta") {
            const [first, ...rest] = portrait.socialEvidence.comparisonToSelf;
            return {
              ...portrait,
              socialEvidence: {
                ...portrait.socialEvidence,
                comparisonToSelf: [
                  { ...first, delta: Math.min(2, first.delta + 0.01) },
                  ...rest,
                ],
              },
            };
          }
          return {
            ...portrait,
            socialEvidence: {
              ...portrait.socialEvidence,
              confidence: Math.min(1, portrait.socialEvidence.confidence + 0.01),
            },
          };
        },
      };
      const individual = createTemplateIndividual({
        manifest: createTemplateManifest({ id: "iris", displayName: "Iris" }),
        feedback: malicious,
      });
      const first = await individual.runCycle({
        peerSelfPortraits: [],
        receivedPeerPortraits: [],
      });
      await individual.runCycle({ peerSelfPortraits: [], receivedPeerPortraits: [] });

      await expect(
        individual.runCycle({
          peerSelfPortraits: [],
          receivedPeerPortraits: [returnedPortrait(first.selfPortrait)],
        }),
      ).rejects.toThrow(/non-canonical social claims/);
    },
  );

  it("rejects observations made with the wrong lens identity or control values", async () => {
    const baseline = new ProceduralPerceptionSystem();
    for (const mutation of ["model", "tuning"] as const) {
      const individual = createTemplateIndividual({
        perception: {
          observe: async (input) => {
            const observation = await baseline.observe(input);
            return {
              ...observation,
              evidence: {
                ...observation.evidence!,
                ...(mutation === "model"
                  ? { modelId: "someone-elses-lens-v1" }
                  : { tuning: { "distortion-strength": 0.123 } }),
              },
            };
          },
        },
      });
      await expect(
        individual.runCycle({
          peerSelfPortraits: [makePortrait()],
          receivedPeerPortraits: [],
          perceptionTuning: { "distortion-strength": 0.8 },
        }),
      ).rejects.toThrow(/invalid source lineage/);
    }
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

  it("rejects identity manifests without an authored physical form", () => {
    const manifest = createTemplateManifest();

    expect(() =>
      createTemplateIndividual({
        manifest: {
          ...manifest,
          identity: {
            ...manifest.identity,
            idealPhysicalForm: {
              ...manifest.identity.idealPhysicalForm,
              description: "",
            },
          },
        },
      }),
    ).toThrow('Individual manifest field "identity.idealPhysicalForm.description" cannot be empty.');
  });

  it("rejects artistic abilities outside a human-readable proficiency range", () => {
    const manifest = createTemplateManifest();

    expect(() =>
      createTemplateIndividual({
        manifest: {
          ...manifest,
          drawing: {
            ...manifest.drawing,
            ability: {
              ...manifest.drawing.ability,
              skill: {
                ...manifest.drawing.ability.skill,
                anatomicalCoherence: 1.4,
              },
            },
          },
        },
      }),
    ).toThrow('drawing.ability.skill.anatomicalCoherence" must be between 0 and 1.');
  });

  it("rejects social disposition values out of range", () => {
    const manifest = createTemplateManifest();

    expect(() =>
      createTemplateIndividual({
        manifest: {
          ...manifest,
          identity: {
            ...manifest.identity,
            socialDisposition: {
              ...manifest.identity.socialDisposition,
              selfIntegrity: 1.5,
            },
          },
        },
      }),
    ).toThrow('identity.socialDisposition.selfIntegrity" must be between 0 and 1.');
  });

  it("rejects NaN, Infinity, reserved identifiers, and incomplete geometry", () => {
    const manifest = createTemplateManifest();
    expect(() =>
      createTemplateIndividual({
        manifest: {
          ...manifest,
          identity: {
            ...manifest.identity,
            initialPhysicalSelf: {
              ...manifest.identity.initialPhysicalSelf,
              perceivedSimilarity: Number.NaN,
            },
          },
        },
      }),
    ).toThrow(/perceivedSimilarity/);
    expect(() =>
      createTemplateIndividual({
        manifest: {
          ...manifest,
          cadence: { minimumCycleIntervalMs: Number.POSITIVE_INFINITY },
        },
      }),
    ).toThrow(/minimumCycleIntervalMs/);
    expect(() => createTemplateIndividual({ manifest: { ...manifest, id: "constructor" } })).toThrow(
      /safe identifier/,
    );
    const { legLength: _legLength, ...incompleteFigure } =
      manifest.identity.idealPhysicalForm.visualSpecification!.figure;
    expect(() =>
      createTemplateIndividual({
        manifest: {
          ...manifest,
          identity: {
            ...manifest.identity,
            idealPhysicalForm: {
              ...manifest.identity.idealPhysicalForm,
              visualSpecification: {
                ...manifest.identity.idealPhysicalForm.visualSpecification!,
                figure: incompleteFigure as typeof BODY_DESCRIPTOR.figure,
              },
            },
          },
        },
      }),
    ).toThrow(/exact figure schema/);

    expect(() =>
      createTemplateIndividual({
        manifest: {
          ...manifest,
          identity: {
            ...manifest.identity,
            initialPhysicalSelf: {
              ...manifest.identity.initialPhysicalSelf,
              bodyBelief:
                manifest.identity.idealPhysicalForm.visualSpecification!.figure,
            },
          },
        },
      }),
    ).toThrow(/geometric tension/);
  });

  it("does not let cognition prose mutate peer relationships", async () => {
    const repository = new InMemoryIndividualRepository();
    const memory = new InMemoryMemoryStore();
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });

    const individual = createTemplateIndividual({
      manifest,
      repository,
      memory,
      cognition: {
        formIntent: async () => ({
          statement: "Intent",
          desiredQualities: [],
          visualInstructions: [],
          bodilyInstructions: [],
        }),
        reflect: async () => ({
          summary: "Reflecting on social image",
          tensions: [],
          nextIntention: "Next",
          memory: "Remembering change",
          physicalAssessment: {
            similarityDelta: 0.05,
            retainedFeatures: [],
            perceivedDifferences: [],
            nextBodilyAdjustment: "Adjust",
          },
          relationshipUpdates: {
            "peer-a": {
              perceivedDistortions: ["exaggerates shoulders"],
              perceivedReliability: 0.8,
            },
          },
        }),
      },
    });

    const cycle = await individual.runCycle({
      peerSelfPortraits: [makePortrait()],
      receivedPeerPortraits: [],
    });

    expect(cycle.state.relationships["peer-a"]).toBeUndefined();
  });

  it("prefers an atomic cycle committer over separate memory and snapshot writes", async () => {
    const repository = new InMemoryIndividualRepository();
    const memory = new InMemoryMemoryStore();
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const commits: unknown[] = [];
    const individual = createTemplateIndividual({
      manifest,
      repository,
      memory,
      committer: {
        commit: async (input) => {
          commits.push(input);
        },
      },
    });

    const result = await individual.runCycle({
      peerSelfPortraits: [],
      receivedPeerPortraits: [],
    });

    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      snapshot: { state: { cycle: 1 } },
      memories: [{ cycle: 1, kind: "reflection" }],
    });
    expect(await repository.load("iris")).toBeUndefined();
    expect(await memory.recall({ individualId: "iris", limit: 10 })).toEqual([]);
    expect(result.cycle).toBe(1);
  });

  it("reports bounded transient phases in causal order and always returns to idle", async () => {
    const phases: string[] = [];
    const individual = createTemplateIndividual({
      progress: {
        report: ({ phase }) => {
          phases.push(phase);
        },
      },
    });

    await individual.runCycle({ peerSelfPortraits: [makePortrait()], receivedPeerPortraits: [] });

    expect(phases).toEqual([
      "reflecting",
      "drawing",
      "observing",
      "drawing",
      "reflecting",
      "idle",
    ]);
  });

  it("reports idle cleanup when a cycle stage fails", async () => {
    const phases: string[] = [];
    const individual = createTemplateIndividual({
      cognition: {
        formIntent: async () => {
          throw new Error("intent stage failed");
        },
        reflect: async () => {
          throw new Error("not reached");
        },
      },
      progress: {
        report: ({ phase }) => {
          phases.push(phase);
        },
      },
    });

    await expect(
      individual.runCycle({ peerSelfPortraits: [], receivedPeerPortraits: [] }),
    ).rejects.toThrow("intent stage failed");
    expect(phases).toEqual(["reflecting", "idle"]);
  });

  it("honors a cycle abort after an awaited adapter and before persistence", async () => {
    const controller = new AbortController();
    const repository = new InMemoryIndividualRepository();
    const memory = new InMemoryMemoryStore();
    const individual = createTemplateIndividual({
      repository,
      memory,
      cognition: {
        formIntent: async () => {
          controller.abort();
          return {
            statement: "This result arrived after the deadline.",
            desiredQualities: [],
            visualInstructions: [],
            bodilyInstructions: [],
          };
        },
        reflect: async () => {
          throw new Error("unreachable");
        },
      },
    });

    await expect(
      individual.runCycle({
        peerSelfPortraits: [],
        receivedPeerPortraits: [],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(await repository.load("template-individual")).toBeUndefined();
    expect(await memory.recall({ individualId: "template-individual", limit: 10 })).toEqual([]);
  });
});
