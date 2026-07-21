import { describe, expect, expectTypeOf, it } from "vitest";
import type { SocietyApiDto } from "../../../software/individual/runtime/publicProjection";
import { individuals } from "../data";
import type { PublicSocietySnapshot } from "../runtime/types";
import {
  normalizeSnapshotForExhibition,
  parseHeartbeat,
  parseRuntimeConfig,
  parseSocietySnapshot,
} from "../runtime/validation";
import { createRuntimeSnapshot } from "./runtimeFixture";

describe("public runtime validation", () => {
  it("accepts the versioned public projection and normalizes declared tuning", () => {
    const parsed = normalizeSnapshotForExhibition(
      parseSocietySnapshot(createRuntimeSnapshot()),
      individuals,
    );

    expect(parsed.apiVersion).toBe("1");
    expect(parsed.individuals[0].portraits.self?.url).toBe(
      "/api/v1/portraits/1111111111111111111111111111111111111111.svg",
    );
    expect(parsed.individuals[0].portraits.peers[0].artistId).toBe("morrow");
    expect(parsed.individuals[0].embodiment.similarity).toBe(0.72);
    expect(parsed.individuals[0].perceptionTuning["edge-gain"]).toBe(0.78);
  });

  it("requires an unambiguous live runtime instance identity", () => {
    const snapshot = createRuntimeSnapshot();
    const { startedAt: _startedAt, ...ambiguousRuntime } = snapshot.runtime;

    expect(() => parseSocietySnapshot({ ...snapshot, runtime: ambiguousRuntime })).toThrow(
      /startedAt must be a string/,
    );
  });

  it("binds heartbeat liveness to the same canonical runtime instance", () => {
    expect(parseHeartbeat({
      revision: "7",
      generatedAt: "2026-07-21T18:00:08.000Z",
      startedAt: "2026-07-21T17:00:00.000Z",
    })).toMatchObject({ revision: "7", startedAt: "2026-07-21T17:00:00.000Z" });
    expect(() => parseHeartbeat({
      revision: "7",
      generatedAt: "2026-07-21T18:00:08.000Z",
    })).toThrow(/startedAt must be a string/);
    expect(() => parseHeartbeat({
      revision: "7",
      generatedAt: "2026-07-21T18:00:08.000Z",
      startedAt: "2026-07-21T19:00:00.000Z",
    })).toThrow(/cannot follow generatedAt/);
  });

  it("rejects internal snapshots, extra private fields, and external artwork URLs", () => {
    expect(() => parseSocietySnapshot({ manifest: {}, state: {} })).toThrow(/unexpected field manifest/);

    const withPrivateState = {
      ...createRuntimeSnapshot(),
      individuals: createRuntimeSnapshot().individuals.map((individual, index) =>
        index === 0 ? { ...individual, privateNarrative: "must not cross this boundary" } : individual,
      ),
    };
    expect(() => parseSocietySnapshot(withPrivateState)).toThrow(/privateNarrative/);

    const unsafeArtwork = createRuntimeSnapshot();
    const [iris, ...rest] = unsafeArtwork.individuals;
    expect(() =>
      parseSocietySnapshot({
        ...unsafeArtwork,
        individuals: [
          {
            ...iris,
            portraits: {
              ...iris.portraits,
              self: { ...iris.portraits.self, url: "https://tracker.invalid/art.svg" },
            },
          },
          ...rest,
        ],
      }),
    ).toThrow(/canonical public artifact route/);
  });

  it("rejects out-of-range live tuning rather than silently applying it", () => {
    const snapshot = createRuntimeSnapshot();
    const [iris, ...rest] = snapshot.individuals;
    const parsed = parseSocietySnapshot({
      ...snapshot,
      individuals: [{ ...iris, perceptionTuning: { "edge-gain": 9 } }, ...rest],
    });

    expect(() => normalizeSnapshotForExhibition(parsed, individuals)).toThrow(/iris.edge-gain/);
  });

  it("requires the exact closed-society membership declared by the exhibition", () => {
    const snapshot = createRuntimeSnapshot();
    const unknown = { ...snapshot.individuals[0], id: "uncommissioned" };
    const withUnknown = parseSocietySnapshot({
      ...snapshot,
      individuals: [...snapshot.individuals, unknown],
    });
    expect(() => normalizeSnapshotForExhibition(withUnknown, individuals)).toThrow(
      /membership does not match/,
    );

    expect(() =>
      parseSocietySnapshot({
        ...snapshot,
        individuals: [snapshot.individuals[0], snapshot.individuals[0], snapshot.individuals[2]],
      }),
    ).toThrow(/individual ids must be unique/);
  });

  it("binds public portrait and display provenance to the commissioned society state", () => {
    const snapshot = createRuntimeSnapshot();
    const [iris, ...rest] = snapshot.individuals;

    const renamed = parseSocietySnapshot({
      ...snapshot,
      individuals: [{ ...iris, displayName: "Definitely Iris" }, ...rest],
    });
    expect(() => normalizeSnapshotForExhibition(renamed, individuals)).toThrow(/display name/);

    const wrongCycle = parseSocietySnapshot({
      ...snapshot,
      individuals: [
        {
          ...iris,
          portraits: {
            ...iris.portraits,
            self: { ...iris.portraits.self, cycle: iris.cycle - 1 },
          },
        },
        ...rest,
      ],
    });
    expect(() => normalizeSnapshotForExhibition(wrongCycle, individuals)).toThrow(/portrait cycle/);

    const independentlyTimedPeer = parseSocietySnapshot({
      ...snapshot,
      individuals: [
        {
          ...iris,
          portraits: {
            ...iris.portraits,
            peers: iris.portraits.peers.map((peer) => ({
              ...peer,
              artwork: { ...peer.artwork, cycle: iris.cycle - 1 },
            })),
          },
        },
        ...rest,
      ],
    });
    expect(() => normalizeSnapshotForExhibition(independentlyTimedPeer, individuals)).not.toThrow();

    const incompleteSocialBundle = parseSocietySnapshot({
      ...snapshot,
      individuals: [
        {
          ...iris,
          portraits: { ...iris.portraits, peers: [] },
        },
        ...rest,
      ],
    });
    expect(() => normalizeSnapshotForExhibition(incompleteSocialBundle, individuals)).toThrow(
      /social portrait bundle/,
    );

    const selfAttributedPeer = parseSocietySnapshot({
      ...snapshot,
      individuals: [
        {
          ...iris,
          portraits: {
            ...iris.portraits,
            peers: [{ artistId: "iris", artwork: iris.portraits.peers[0].artwork }],
          },
        },
        ...rest,
      ],
    });
    expect(() => normalizeSnapshotForExhibition(selfAttributedPeer, individuals)).toThrow(
      /peer portrait provenance/,
    );
  });

  it("normalizes hostile text controls and rejects ambiguous timestamps", () => {
    const snapshot = createRuntimeSnapshot();
    const [iris, ...rest] = snapshot.individuals;
    const parsed = parseSocietySnapshot({
      ...snapshot,
      individuals: [
        { ...iris, publicReflection: "body\u202e spoof\nheld" },
        ...rest,
      ],
    });
    expect(parsed.individuals[0].publicReflection).toBe("body  spoof held");

    expect(() =>
      parseSocietySnapshot({ ...snapshot, generatedAt: "2026-07-21T18:00:07-07:00" }),
    ).toThrow(/canonical UTC timestamp/);
    expect(() =>
      parseSocietySnapshot({ ...snapshot, generatedAt: "2026-02-30T18:00:07.000Z" }),
    ).toThrow(/canonical UTC timestamp/);
    expect(() =>
      parseSocietySnapshot({
        ...snapshot,
        runtime: { ...snapshot.runtime, startedAt: "2026-07-21T19:00:00.000Z" },
      }),
    ).toThrow(/cannot follow snapshot generatedAt/);
  });

  it("requires embodiment and caps public collection sizes", () => {
    const snapshot = createRuntimeSnapshot();
    const [iris, ...rest] = snapshot.individuals;
    const { embodiment: _embodiment, ...withoutEmbodiment } = iris;
    expect(() =>
      parseSocietySnapshot({ ...snapshot, individuals: [withoutEmbodiment, ...rest] }),
    ).toThrow(/embodiment must be an object/);

    expect(() =>
      parseSocietySnapshot({ ...snapshot, individuals: Array.from({ length: 18 }, () => iris) }),
    ).toThrow(/between 1 and 17/);

    const oversizedTuning = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`control-${index}`, 0.5]),
    );
    expect(() =>
      parseSocietySnapshot({
        ...snapshot,
        individuals: [{ ...iris, perceptionTuning: oversizedTuning }, ...rest],
      }),
    ).toThrow(/at most 64 controls/);
  });

  it("rejects contradictory runtime and Individual pause claims", () => {
    const snapshot = createRuntimeSnapshot();
    const [iris, ...rest] = snapshot.individuals;
    expect(() =>
      parseSocietySnapshot({
        ...snapshot,
        individuals: [{ ...iris, isPaused: true }, ...rest],
      }),
    ).toThrow(/pause fields are inconsistent/);

    expect(() =>
      parseSocietySnapshot({
        ...snapshot,
        runtime: { ...snapshot.runtime, status: "paused" },
      }),
    ).toThrow(/runtime status is inconsistent/);
  });

  it("accepts only canonical digest-addressed portrait routes", () => {
    const snapshot = createRuntimeSnapshot();
    const [iris, ...rest] = snapshot.individuals;
    expect(() =>
      parseSocietySnapshot({
        ...snapshot,
        individuals: [
          {
            ...iris,
            portraits: {
              ...iris.portraits,
              self: {
                ...iris.portraits.self,
                id: "A".repeat(40),
                url: `/api/v1/portraits/${"A".repeat(40)}.svg`,
              },
            },
          },
          ...rest,
        ],
      }),
    ).toThrow(/lowercase digest/);

    expect(() =>
      parseSocietySnapshot({
        ...snapshot,
        individuals: [
          {
            ...iris,
            portraits: {
              ...iris.portraits,
              self: { ...iris.portraits.self, format: "procedural" },
            },
          },
          ...rest,
        ],
      }),
    ).toThrow(/format is unsupported/);
  });

  it.each(["revision-7", "01", "1e3", "9007199254740992"])(
    "rejects non-canonical revision %s",
    (revision) => {
      expect(() => parseSocietySnapshot({ ...createRuntimeSnapshot(), revision })).toThrow(
        /canonical non-negative integer/,
      );
    },
  );

  it("remains structurally compatible with the backend public projection", () => {
    expectTypeOf<SocietyApiDto>().toMatchTypeOf<PublicSocietySnapshot>();
    expectTypeOf<PublicSocietySnapshot>().toMatchTypeOf<SocietyApiDto>();
  });

  it("allows only public transport configuration and ignores injected credentials", () => {
    const config = parseRuntimeConfig({
      apiBasePath: "/custom/api",
      mode: "live",
      controlToken: "do-not-read-this",
    });

    expect(config.apiBasePath).toBe("/custom/api");
    expect("controlToken" in config).toBe(false);
  });
});
