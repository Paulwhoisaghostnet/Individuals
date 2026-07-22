import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createInitialState } from "../../core/createInitialState";
import type {
  ArtworkDescriptor,
  IndividualSnapshot,
  MemoryEntry,
  Portrait,
} from "../../core/model";
import { buildSocialFeedbackEvidence } from "../../core/socialEvidence";
import {
  DEFAULT_ART_PRACTICE,
  defaultRenderingDescriptor,
} from "../../drawing/figureDescriptor";
import { renderArtworkSvg, renderSocialCompositeSvg } from "../../drawing/svgRenderer";
import { irisManifest } from "../../identity-packages";
import { parseTimelineCliArgs } from "../cli";
import { exportTimeline } from "../exportTimeline";
import { TimelineExportError } from "../errors";
import { loadTimelineDocument } from "../loadTimeline";
import { PRIVATE_MEMORY_EXPORT_ACKNOWLEDGEMENT } from "../timelineTypes";

let testDir: string;

const descriptorFor = (snapshot: IndividualSnapshot): ArtworkDescriptor => {
  const specification = snapshot.manifest.identity.idealPhysicalForm.visualSpecification!;
  return {
    schemaVersion: 1,
    figure: specification.figure,
    rendering: defaultRenderingDescriptor(),
    features: [{ label: "recognizable face", prominence: 0.8 }],
    omittedFeatures: [],
    styleName: "retained contour",
    primitives: ["line"],
    confidence: 0.8,
    anatomy: specification.anatomy,
    practice: DEFAULT_ART_PRACTICE,
  };
};

const selfPortrait = (
  id: string,
  cycle: number,
  descriptor: ArtworkDescriptor,
  title: string,
): Portrait => ({
  id,
  cycle,
  artistId: "iris",
  subjectId: "iris",
  role: "self",
  createdAt: `2026-01-01T00:00:0${cycle}Z`,
  artwork: {
    format: "svg",
    width: 800,
    height: 1_000,
    content: renderArtworkSvg({
      title,
      subtitle: `cycle ${cycle}`,
      descriptor,
      palette: ["#11110f", "#e9e7df", "#c57d4d", "#5d574d"],
      dataRole: "self",
    }),
  },
  descriptor,
  sourcePortraitIds: [],
});

const validSnapshot = (): IndividualSnapshot => {
  const manifest = irisManifest;
  const initial = { manifest, state: createInitialState(manifest, "2026-01-01T00:00:00Z") };
  const descriptor = descriptorFor(initial);
  const source = selfPortrait("iris--1--self", 1, descriptor, "Iris cycle one");
  const current = selfPortrait("iris--2--self", 2, descriptor, "Iris cycle two");
  const peerDescriptor: ArtworkDescriptor = {
    ...descriptor,
    figure: { ...descriptor.figure, shoulderWidth: 0.61, postureLean: 0.08 },
    confidence: 0.72,
  };
  const peer: Portrait = {
    id: "morrow--2--peer--iris",
    cycle: 2,
    artistId: "morrow",
    subjectId: "iris",
    role: "peer",
    createdAt: "2026-01-01T00:00:02Z",
    artwork: {
      format: "svg",
      width: 800,
      height: 1_000,
      content: renderArtworkSvg({
        title: "Morrow sees Iris",
        subtitle: "peer drawing",
        descriptor: peerDescriptor,
        palette: ["#11110f", "#e9e7df", "#809593", "#4d5458"],
        dataRole: "peer",
      }),
    },
    descriptor: peerDescriptor,
    observationEvidence: {
      modelId: "morrow-lens-v1",
      tuning: { strength: 0.5 },
      source: descriptor,
      perceived: peerDescriptor,
      effects: [],
    },
    sourcePortraitIds: [source.id],
  };
  const evidence = buildSocialFeedbackEvidence({
    subjectId: "iris",
    portraits: [peer],
    sourceSelfPortrait: source,
    idealFigure: manifest.identity.idealPhysicalForm.visualSpecification!.figure,
  });
  const social: Portrait = {
    id: "iris--2--social",
    cycle: 2,
    artistId: "collective",
    subjectId: "iris",
    role: "social",
    createdAt: "2026-01-01T00:00:02Z",
    artwork: {
      format: "svg",
      width: 800,
      height: 1_000,
      content: renderSocialCompositeSvg({
        title: "Social Iris",
        subtitle: "cycle two",
        consensus: evidence.consensus,
        layers: [{ descriptor: peerDescriptor, weight: 1 }],
        palette: ["#11110f", "#e9e7df", "#c57d4d", "#5d574d"],
      }),
    },
    descriptor: evidence.consensus,
    socialEvidence: evidence,
    sourcePortraitIds: [peer.id],
  };
  return {
    manifest,
    state: {
      ...initial.state,
      cycle: 2,
      currentSelfPortrait: current,
      selfPortraitHistory: [source],
      latestSocialPortrait: social,
      latestSocialPeerPortraits: [peer],
      updatedAt: "2026-01-01T00:00:02Z",
    },
  };
};

const writeFixture = async (
  snapshot: IndividualSnapshot = validSnapshot(),
  memoryContent: string = "not-json-and-must-not-be-read-by-default",
): Promise<{ dataDir: string; outputPath: string }> => {
  const dataDir = path.join(testDir, "individuals");
  await fs.mkdir(path.join(dataDir, "snapshots"), { recursive: true });
  await fs.mkdir(path.join(dataDir, "memories"), { recursive: true });
  await fs.writeFile(
    path.join(dataDir, "snapshots", "iris.json"),
    JSON.stringify(snapshot),
    "utf8",
  );
  await fs.writeFile(path.join(dataDir, "memories", "iris.json"), memoryContent, "utf8");
  return { dataDir, outputPath: path.join(testDir, "exports", "timeline.html") };
};

const withCurrentArtwork = (
  snapshot: IndividualSnapshot,
  artwork: Portrait["artwork"],
): IndividualSnapshot => ({
  ...snapshot,
  state: {
    ...snapshot.state,
    currentSelfPortrait: snapshot.state.currentSelfPortrait
      ? { ...snapshot.state.currentSelfPortrait, artwork }
      : undefined,
  },
});

describe("curatorial timeline exporter", () => {
  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), `individuals-timeline-${process.pid}-${randomUUID()}-`));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("exports validated bounded art without reading or disclosing private memory", async () => {
    const { dataDir, outputPath } = await writeFixture();
    const result = await exportTimeline({
      dataDir,
      outputPath,
      now: () => new Date("2026-01-02T00:00:00Z"),
    });
    const html = await fs.readFile(outputPath, "utf8");
    const mode = (await fs.stat(outputPath)).mode & 0o777;

    expect(result).toMatchObject({
      individualCount: 1,
      portraitCount: 4,
      includesPrivateMemory: false,
    });
    expect(mode).toBe(0o600);
    expect(html).toContain("Retained portrait timeline");
    expect(html).toContain("Iris");
    expect(html).toContain('src="data:image/svg+xml;base64,');
    expect(html).toContain('alt="Self-portrait of iris, cycle 1."');
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("not-json-and-must-not-be-read-by-default");
    expect(html).not.toContain("PRIVATE MEMORY IS INCLUDED");
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/(?:src|href)="https?:/i);
    expect(html).toMatch(/Content-Security-Policy[^>]+script-src 'none'/);
    expect(html).toMatch(/style-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(html).toContain("img-src data:");
    expect(html).toContain("connect-src 'none'");
    expect(await fs.readdir(path.dirname(outputPath))).toEqual(["timeline.html"]);
  });

  it("defaults output into the runtime volume and rejects identity-state subtrees", async () => {
    const { dataDir } = await writeFixture();
    const result = await exportTimeline({ dataDir });
    expect(result.outputPath).toBe(path.join(dataDir, "exports", "timeline.html"));
    expect(await fs.readFile(result.outputPath, "utf8")).toContain("Retained portrait timeline");

    await expect(exportTimeline({
      dataDir,
      outputPath: path.join(dataDir, "snapshots", "timeline.html"),
    })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(exportTimeline({
      dataDir,
      outputPath: path.join(dataDir, "memories", ".quarantine", "timeline.html"),
    })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("requires the exact scary acknowledgement and escapes opted-in private memory", async () => {
    const memory: MemoryEntry = {
      id: "iris--2--private",
      individualId: "iris",
      cycle: 2,
      kind: "reflection",
      content: "PRIVATE <script>alert('memory')</script> & narrative",
      createdAt: "2026-01-01T00:00:02Z",
      relatedIndividualIds: [],
    };
    const { dataDir, outputPath } = await writeFixture(validSnapshot(), JSON.stringify([memory]));

    await expect(loadTimelineDocument({
      dataDir,
      privateMemoryAcknowledgement: "yes",
    })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });

    await exportTimeline({
      dataDir,
      outputPath,
      privateMemoryAcknowledgement: PRIVATE_MEMORY_EXPORT_ACKNOWLEDGEMENT,
    });
    const html = await fs.readFile(outputPath, "utf8");
    expect(html).toContain("PRIVATE MEMORY IS INCLUDED");
    expect(html).toContain("PRIVATE &lt;script&gt;alert(&#39;memory&#39;)&lt;/script&gt; &amp; narrative");
    expect(html).not.toMatch(/<script\b/i);
  });

  it("rejects snapshots authored by a different installed manifest", async () => {
    const snapshot = validSnapshot();
    const incompatible: IndividualSnapshot = {
      ...snapshot,
      manifest: {
        ...snapshot.manifest,
        displayName: "A persisted impostor",
      },
    };
    const { dataDir } = await writeFixture(incompatible);

    await expect(loadTimelineDocument({ dataDir })).rejects.toMatchObject({
      code: "INPUT_INVALID",
    });
  });

  it("rejects legacy memory quarantine evidence when active memory is absent", async () => {
    const { dataDir } = await writeFixture(validSnapshot(), JSON.stringify([]));
    const memoryPath = path.join(dataDir, "memories", "iris.json");
    const quarantineDir = path.join(dataDir, "memories", ".quarantine");
    await fs.rm(memoryPath);
    await fs.mkdir(quarantineDir, { recursive: true });
    await fs.writeFile(
      path.join(quarantineDir, "iris.json.1700000000000.legacy.corrupt"),
      "damaged private memory",
      "utf8",
    );

    await expect(loadTimelineDocument({
      dataDir,
      privateMemoryAcknowledgement: PRIVATE_MEMORY_EXPORT_ACKNOWLEDGEMENT,
    })).rejects.toMatchObject({ code: "INPUT_INVALID" });
    await expect(fs.readFile(
      path.join(quarantineDir, "iris.blocked.json"),
      "utf8",
    )).resolves.toContain('"reason":"legacy_quarantine_artifact"');
  });

  it("fails closed on unsafe or unsupported artwork without replacing prior output", async () => {
    const baseline = validSnapshot();
    const unsafe = withCurrentArtwork(baseline, {
      ...baseline.state.currentSelfPortrait!.artwork,
      content: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    });
    const { dataDir, outputPath } = await writeFixture(unsafe);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, "previous-good-export", { encoding: "utf8", mode: 0o600 });

    await expect(exportTimeline({ dataDir, outputPath })).rejects.toMatchObject({
      code: "ARTWORK_INVALID",
    });
    expect(await fs.readFile(outputPath, "utf8")).toBe("previous-good-export");

    const supportedBaseline = validSnapshot();
    const unsupported = withCurrentArtwork(supportedBaseline, {
      ...supportedBaseline.state.currentSelfPortrait!.artwork,
      format: "procedural",
      content: "bounded but unsupported procedural instructions",
    });
    await fs.writeFile(
      path.join(dataDir, "snapshots", "iris.json"),
      JSON.stringify(unsupported),
      "utf8",
    );
    await expect(exportTimeline({ dataDir, outputPath })).rejects.toMatchObject({
      code: "ARTWORK_UNSUPPORTED",
    });
    expect(await fs.readFile(outputPath, "utf8")).toBe("previous-good-export");
  });

  it("applies explicit self and peer view bounds", async () => {
    const { dataDir, outputPath } = await writeFixture();
    const result = await exportTimeline({
      dataDir,
      outputPath,
      maxSelfPortraits: 1,
      maxPeerPortraits: 0,
    });
    const html = await fs.readFile(outputPath, "utf8");
    expect(result.portraitCount).toBe(2);
    expect(html).toContain("1 retained self-portrait was omitted");
    expect(html).toContain("No persisted peer-drawing cohort is available");
  });

  it("parses robust CLI arguments and rejects unknown or duplicate options", () => {
    expect(parseTimelineCliArgs([
      "--data-dir=/tmp/individuals",
      "--output", "/tmp/timeline.html",
      "--individual", "iris",
      "--individual=morrow",
      "--max-self-portraits", "4",
      "--max-peer-portraits=3",
    ])).toEqual({
      help: false,
      options: {
        dataDir: "/tmp/individuals",
        outputPath: "/tmp/timeline.html",
        individualIds: ["iris", "morrow"],
        maxSelfPortraits: 4,
        maxPeerPortraits: 3,
      },
    });
    expect(() => parseTimelineCliArgs(["--wat"])).toThrow(TimelineExportError);
    expect(() => parseTimelineCliArgs(["--output", "a.html", "--output", "b.html"]))
      .toThrow(/supplied twice/);
    expect(() => parseTimelineCliArgs(["positional"])).toThrow(/Unknown/);
  });
});
