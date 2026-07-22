import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validatePublicSvg } from "../../security/publicSvg";
import { runTimelineCli } from "../cli";
import {
  MAX_TIMELINE_OPERATOR_ERROR_CHARACTERS,
  sanitizeTimelineOperatorText,
  TimelineExportError,
  timelineErrorMessage,
} from "../errors";
import { loadTimelineDocument } from "../loadTimeline";
import { renderValidatedTimelineHtml } from "../renderTimelineHtml";
import {
  createValidatedTimelineDocument,
  type ValidatedTimelineDocument,
} from "../validatedTimelineDocument";

const createdDirectories: string[] = [];
const timestamp = "2026-01-01T00:00:00Z";
const svg = validatePublicSvg(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#111111"/></svg>',
);

const selfPortrait = {
  id: "iris--1--self",
  role: "self",
  cycle: 1,
  artistId: "iris",
  subjectId: "iris",
  createdAt: timestamp,
  width: 10,
  height: 10,
  svg,
} as const;

const individual = {
  id: "iris",
  displayName: "Iris <img src=x onerror=alert(1)> & witness",
  cycle: 1,
  updatedAt: timestamp,
  selfPortraits: [selfPortrait],
  omittedSelfPortraitCount: 0,
  socialPortrait: undefined,
  peerPortraits: [],
  omittedPeerPortraitCount: 0,
  privateMemoryGroups: undefined,
} as const;

const document = {
  generatedAt: timestamp,
  sourceKind: "validated-retained-snapshots",
  includesPrivateMemory: false,
  individuals: [individual],
} as const;

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

describe("timeline adversarial render and error boundaries", () => {
  it("requires the opaque document brand and escapes every accepted text scalar", () => {
    expect(() => renderValidatedTimelineHtml(
      document as unknown as ValidatedTimelineDocument,
    )).toThrow(/opaque validated document/);

    const validated = createValidatedTimelineDocument(document);
    const html = renderValidatedTimelineHtml(validated);
    expect(html).toContain("Iris &lt;img src=x onerror=alert(1)&gt; &amp; witness");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/<script\b/i);
  });

  it("rejects raw string and numeric interpolation payloads before rendering", () => {
    expect(() => createValidatedTimelineDocument({
      ...document,
      generatedAt: `${timestamp}\"><script>alert(1)</script>`,
    })).toThrow(/render model failed validation/);
    expect(() => createValidatedTimelineDocument({
      ...document,
      individuals: [{
        ...individual,
        cycle: '1</p><script>alert("cycle")</script>',
      }],
    })).toThrow(/bounded integer/);
    expect(() => createValidatedTimelineDocument({
      ...document,
      individuals: [{
        ...individual,
        selfPortraits: [{
          ...selfPortrait,
          width: '10" onerror="alert(1)',
        }],
      }],
    })).toThrow(/bounded integer/);
  });

  it("cannot serialize private memory without enabling the warning mode", () => {
    const privateMemoryGroups = [{
      cycle: 1,
      entries: [{
        id: "iris--1--memory",
        individualId: "iris",
        cycle: 1,
        kind: "reflection",
        content: "private material",
        createdAt: timestamp,
        relatedIndividualIds: [],
      }],
      omittedCount: 0,
    }];
    expect(() => createValidatedTimelineDocument({
      ...document,
      individuals: [{ ...individual, privateMemoryGroups }],
    })).toThrow(/requires the document privacy warning/);

    const privateDocument = createValidatedTimelineDocument({
      ...document,
      includesPrivateMemory: true,
      individuals: [{ ...individual, privateMemoryGroups }],
    });
    const html = renderValidatedTimelineHtml(privateDocument);
    expect(html).toContain("PRIVATE MEMORY IS INCLUDED");
    expect(html).toContain("private material");
  });

  it("projects ANSI, multiline, bidi, and flood errors as one bounded operator line", async () => {
    const hostile = `\u001b]8;;https://attacker.example\u0007click\u001b]8;;\u0007\u001b[31mRED\u001b[0m\nsecond\rline\u202E${"x".repeat(10_000)}`;
    const sanitized = sanitizeTimelineOperatorText(hostile);
    expect(sanitized).toContain("clickRED second line");
    expect(sanitized).not.toMatch(/[\u0000-\u001F\u007F-\u009F\u202E]/);
    expect([...sanitized]).toHaveLength(MAX_TIMELINE_OPERATOR_ERROR_CHARACTERS);
    expect(sanitized.endsWith("…")).toBe(true);

    const dataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `individuals-timeline-errors-${process.pid}-${randomUUID()}-`),
    );
    createdDirectories.push(dataDir);
    await fs.mkdir(path.join(dataDir, "snapshots"), { recursive: true });
    const hostileKey = `\u001b[35mhostile\nfield\u001b[0m-${"z".repeat(8_000)}`;
    await fs.writeFile(
      path.join(dataDir, "snapshots", "iris.json"),
      JSON.stringify({ manifest: {}, [hostileKey]: {} }),
      "utf8",
    );

    const failure = await loadTimelineDocument({ dataDir }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TimelineExportError);
    expect((failure as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    const projected = timelineErrorMessage(failure);
    expect(projected).not.toMatch(/[\u0000-\u001F\u007F-\u009F]/);
    expect([...projected].length).toBeLessThanOrEqual(MAX_TIMELINE_OPERATOR_ERROR_CHARACTERS);

    const stderr: string[] = [];
    expect(await runTimelineCli(["--data-dir", dataDir], {
      stdout: () => undefined,
      stderr: (message) => stderr.push(message),
    })).toBe(1);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).not.toMatch(/[\u0000-\u001F\u007F-\u009F]/);
    expect([...stderr[0]].length).toBeLessThanOrEqual(MAX_TIMELINE_OPERATOR_ERROR_CHARACTERS);
  });
});
