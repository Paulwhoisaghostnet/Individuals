/**
 * Export a local timeline page of each Individual's portrait history.
 *
 *   npx tsx scripts/exportTimeline.ts            (live society, default)
 *   npx tsx scripts/exportTimeline.ts demo       (demo society)
 *
 * Writes .data/portrait-exports/timeline.html — open it in a browser.
 * Development aid only; reads state files directly, no server required.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.argv[2] === "demo" ? ".data/demo-individuals" : ".data/individuals";
const outDir = ".data/portrait-exports";
const outFile = join(outDir, "timeline.html");

interface PortraitEntry {
  readonly cycle: number;
  readonly artwork: { readonly content: string };
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sections: string[] = [];
const snapshotDir = join(dataDir, "snapshots");

for (const file of readdirSync(snapshotDir).filter((name) => name.endsWith(".json")).sort()) {
  const snapshot = JSON.parse(readFileSync(join(snapshotDir, file), "utf8"));
  const state = snapshot.state;
  const id: string = state.individualId;

  let memoriesByCycle = new Map<number, string>();
  try {
    const memoriesRaw = JSON.parse(readFileSync(join(dataDir, "memories", `${id}.json`), "utf8"));
    const entries = Array.isArray(memoriesRaw) ? memoriesRaw : (memoriesRaw.entries ?? []);
    memoriesByCycle = new Map(
      entries.map((entry: { cycle: number; content: string }) => [entry.cycle, entry.content]),
    );
  } catch {
    // Memories are optional for the timeline; portraits still render.
  }

  const history: PortraitEntry[] = [
    ...(state.selfPortraitHistory ?? []),
    ...(state.currentSelfPortrait ? [state.currentSelfPortrait] : []),
  ];
  const byCycle = new Map(history.map((entry) => [entry.cycle, entry]));
  const cells = [...byCycle.values()]
    .sort((left, right) => left.cycle - right.cycle)
    .map((entry) => {
      const memory = memoriesByCycle.get(entry.cycle);
      return `<figure>
        <div class="art">${entry.artwork.content}</div>
        <figcaption><strong>cycle ${entry.cycle}</strong>${
          memory ? `<br>${escapeHtml(memory)}` : ""
        }</figcaption>
      </figure>`;
    });

  const social = state.latestSocialPortrait
    ? `<figure class="social">
        <div class="art">${state.latestSocialPortrait.artwork.content}</div>
        <figcaption><strong>social composite · cycle ${state.latestSocialPortrait.cycle}</strong><br>how the others see ${escapeHtml(id)}</figcaption>
      </figure>`
    : "";

  sections.push(`<section>
    <h2>${escapeHtml(id)} <small>· cycle ${state.cycle}</small></h2>
    <div class="row">${cells.join("")}${social}</div>
  </section>`);
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Individuals — timeline</title>
<style>
  body { background: #141412; color: #d8d4c8; font: 14px/1.5 Georgia, serif; margin: 2rem; }
  h1 { font-weight: normal; letter-spacing: 0.06em; }
  h2 { font-weight: normal; border-bottom: 1px solid #3a382f; padding-bottom: 0.3rem; }
  h2 small { color: #8a8578; }
  .row { display: flex; gap: 1rem; overflow-x: auto; padding: 1rem 0 2rem; }
  figure { margin: 0; flex: 0 0 220px; }
  .art svg { width: 220px; height: auto; display: block; border: 1px solid #3a382f; }
  figcaption { color: #a09a8a; font-size: 12px; margin-top: 0.5rem; }
  .social { border-left: 1px dashed #5a5648; padding-left: 1rem; }
</style>
</head>
<body>
<h1>Individuals — portrait timeline</h1>
<p>Generated ${new Date().toISOString()} from ${dataDir}. Re-run <code>npx tsx scripts/exportTimeline.ts</code> to refresh.</p>
${sections.join("\n")}
</body>
</html>`;

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, html);
console.log(`timeline written to ${outFile}`);
