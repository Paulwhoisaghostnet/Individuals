import type { PublicSocietySnapshot } from "../runtime/types";

export const createRuntimeSnapshot = (
  options: {
    readonly revision?: string;
    readonly generatedAt?: string;
    readonly startedAt?: string;
    readonly runtimeStatus?: PublicSocietySnapshot["runtime"]["status"];
    readonly cycles?: Readonly<Record<string, number>>;
  } = {},
): PublicSocietySnapshot => ({
  apiVersion: "1",
  revision: options.revision ?? "7",
  generatedAt: options.generatedAt ?? "2026-07-21T18:00:07.000Z",
  runtime: {
    mode: "live",
    status: options.runtimeStatus ?? "running",
    startedAt: options.startedAt ?? "2026-07-21T17:00:00.000Z",
  },
  individuals: [
    {
      id: "iris",
      displayName: "Iris",
      cycle: options.cycles?.iris ?? 7,
      status: "reflecting",
      isPaused: false,
      isRunningCycle: false,
      updatedAt: "2026-07-21T18:00:07.000Z",
      publicReflection: "The edge held, but the shoulders remained guarded.",
      embodiment: {
        description: "She sees the intended tall body with one shoulder still held high.",
        similarity: 0.72,
        perceivedDifferences: ["left shoulder held high", "hands partially closed"],
        nextBodilyAdjustment: "Open both hands without losing the contour of the wrists.",
      },
      perceptionTuning: { "edge-gain": 0.78, "interior-loss": 0.64, "symmetry-pull": 0.42 },
      portraits: {
        self: {
          id: "1111111111111111111111111111111111111111",
          cycle: 7,
          format: "svg",
          url: "/api/v1/portraits/1111111111111111111111111111111111111111.svg",
          width: 800,
          height: 1000,
          createdAt: "2026-07-21T18:00:06.000Z",
        },
        social: {
          id: "3333333333333333333333333333333333333333",
          cycle: 7,
          format: "svg",
          url: "/api/v1/portraits/3333333333333333333333333333333333333333.svg",
          width: 800,
          height: 1000,
          createdAt: "2026-07-21T18:00:06.750Z",
        },
        peers: [
          {
            artistId: "morrow",
            artwork: {
              id: "2222222222222222222222222222222222222222",
              cycle: 7,
              format: "svg",
              url: "/api/v1/portraits/2222222222222222222222222222222222222222.svg",
              width: 800,
              height: 1000,
              createdAt: "2026-07-21T18:00:06.500Z",
            },
          },
        ],
      },
    },
    {
      id: "morrow",
      displayName: "Morrow",
      cycle: options.cycles?.morrow ?? 7,
      status: "drawing",
      isPaused: false,
      isRunningCycle: true,
      updatedAt: "2026-07-21T18:00:06.000Z",
      embodiment: {
        description: "They see the intended assembled body with several plates still offset.",
        similarity: 0.58,
        perceivedDifferences: ["sternum plates misaligned"],
      },
      perceptionTuning: { retention: 0.38, "fragment-scale": 0.62, "temporal-lag": 0.55 },
      portraits: { peers: [] },
    },
    {
      id: "sable",
      displayName: "Sable",
      cycle: options.cycles?.sable ?? 7,
      status: "observing",
      isPaused: false,
      isRunningCycle: true,
      updatedAt: "2026-07-21T18:00:05.000Z",
      embodiment: {
        description: "He sees the intended tall body repeated in faint motion echoes.",
        similarity: 0.64,
        perceivedDifferences: ["spine bends right"],
      },
      perceptionTuning: { "echo-count": 4, "echo-spacing": 16, "stillness-fade": 0.58 },
      portraits: { peers: [] },
    },
  ],
});
