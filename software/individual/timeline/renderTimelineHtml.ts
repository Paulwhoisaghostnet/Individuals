import { createHash } from "node:crypto";

import { validatePublicSvg, type ValidatedPublicSvg } from "../security/publicSvg";
import type {
  TimelineIndividual,
  TimelineMemoryGroup,
  TimelinePortrait,
} from "./timelineTypes";
import {
  assertValidatedTimelineDocument,
  type ValidatedTimelineDocument,
} from "./validatedTimelineDocument";

const STYLES = `
:root {
  color-scheme: dark;
  --paper: #11110f;
  --panel: #191916;
  --panel-raised: #22221e;
  --ink: #f0eee5;
  --muted: #b8b5aa;
  --line: #48483f;
  --accent: #d69a61;
  --warning: #ffd6a3;
  --warning-bg: #3d2414;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
}
* { box-sizing: border-box; }
html { background: var(--paper); color: var(--ink); line-height: 1.5; }
body { margin: 0; min-width: 18rem; }
a { color: var(--accent); text-underline-offset: 0.2em; }
a:focus-visible, summary:focus-visible { outline: 0.2rem solid var(--warning); outline-offset: 0.2rem; }
.skip-link { position: absolute; left: 1rem; top: -5rem; z-index: 10; padding: 0.7rem 1rem; background: var(--ink); color: var(--paper); }
.skip-link:focus { top: 1rem; }
.page-header, main, .page-footer { width: min(100% - 2rem, 96rem); margin-inline: auto; }
.page-header { padding-block: clamp(2rem, 6vw, 5rem) 2rem; border-bottom: 1px solid var(--line); }
.eyebrow { margin: 0 0 0.5rem; color: var(--accent); font-size: 0.78rem; font-weight: 750; letter-spacing: 0.14em; text-transform: uppercase; }
h1, h2, h3 { line-height: 1.08; text-wrap: balance; }
h1 { max-width: 18ch; margin: 0; font-family: ui-serif, Georgia, serif; font-size: clamp(2.3rem, 8vw, 6.5rem); font-weight: 500; }
h2 { margin: 0; font-family: ui-serif, Georgia, serif; font-size: clamp(1.8rem, 4vw, 3.5rem); font-weight: 500; }
h3 { font-size: 1rem; letter-spacing: 0.04em; }
.lede { max-width: 66ch; color: var(--muted); font-size: 1.05rem; }
.metadata { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; margin-top: 1.5rem; color: var(--muted); font-size: 0.88rem; }
.privacy-warning { margin-top: 1.5rem; padding: 1rem 1.2rem; border: 2px solid var(--warning); background: var(--warning-bg); color: var(--warning); }
.privacy-warning strong { display: block; font-size: 1.05rem; }
.contents { padding-block: 1.5rem; }
.contents ul { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; padding: 0; list-style: none; }
.individual { padding-block: clamp(2.5rem, 7vw, 6rem); border-top: 1px solid var(--line); }
.individual-heading { display: grid; gap: 0.5rem; margin-bottom: 2rem; }
.individual-heading p { margin: 0; color: var(--muted); }
.section-heading { margin: 2.5rem 0 1rem; }
.section-heading p { max-width: 72ch; margin: 0.4rem 0 0; color: var(--muted); }
.portrait-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: 1rem; align-items: start; }
.portrait-card { min-width: 0; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 0.5rem; background: var(--panel); }
.artwork-shell { display: grid; place-items: center; min-height: 14rem; background: #080807; }
.artwork { display: block; width: 100%; height: auto; max-height: 70vh; object-fit: contain; }
figcaption { display: grid; gap: 0.25rem; padding: 0.85rem 1rem 1rem; }
figcaption span { color: var(--muted); font-size: 0.84rem; overflow-wrap: anywhere; }
.empty-state, .retention-note { padding: 1rem; border-left: 0.2rem solid var(--line); background: var(--panel); color: var(--muted); }
.memory-block { margin: 1rem; border-top: 1px solid var(--line); }
.memory-block summary { padding-block: 0.75rem; cursor: pointer; color: var(--warning); font-weight: 700; }
.memory-list { display: grid; gap: 0.75rem; padding: 0 0 1rem; }
.memory-entry { padding: 0.8rem; background: var(--panel-raised); }
.memory-entry p { margin: 0.4rem 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.memory-meta { color: var(--muted); font-size: 0.78rem; }
.page-footer { padding-block: 2rem 4rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.88rem; }
@media (max-width: 38rem) {
  .page-header, main, .page-footer { width: min(100% - 1rem, 96rem); }
  .portrait-grid { grid-template-columns: 1fr; }
  .individual { padding-block: 2.5rem; }
}
@media print {
  :root { color-scheme: light; --paper: #fff; --panel: #fff; --panel-raised: #f4f4f1; --ink: #111; --muted: #444; --line: #aaa; --accent: #7a4214; }
  .portrait-card { break-inside: avoid; }
  .artwork { max-height: 55vh; }
  .skip-link, .contents { display: none; }
}
`;

const escapeHtml = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? "");

const htmlInteger = (value: number): string => escapeHtml(String(value));

const svgDataUrl = (svg: ValidatedPublicSvg): string => {
  // Revalidate at the serialization boundary. The brand prevents accidental
  // raw strings in normal TypeScript flows; this check also protects JS callers.
  const validated = validatePublicSvg(svg);
  return `data:image/svg+xml;base64,${Buffer.from(validated, "utf8").toString("base64")}`;
};

const roleLabel = (portrait: TimelinePortrait): string => {
  if (portrait.role === "self") return "Self-portrait";
  if (portrait.role === "social") return "Social composite";
  return `Peer portrait by ${portrait.artistId}`;
};

const renderMemoryGroup = (group: TimelineMemoryGroup | undefined): string => {
  if (!group || group.entries.length === 0) return "";
  const omitted = group.omittedCount > 0
    ? `<p class="retention-note">${htmlInteger(group.omittedCount)} additional private memories from this cycle were intentionally omitted by the export bound.</p>`
    : "";
  const entries = group.entries.map((entry) => `
    <article class="memory-entry">
      <div class="memory-meta">${escapeHtml(entry.kind)} · <time datetime="${escapeHtml(entry.createdAt)}">${escapeHtml(entry.createdAt)}</time></div>
      <p>${escapeHtml(entry.content)}</p>
    </article>`).join("");
  return `
    <details class="memory-block">
      <summary>Private memory included for cycle ${htmlInteger(group.cycle)}</summary>
      <div class="memory-list">${entries}${omitted}</div>
    </details>`;
};

const renderPortrait = (
  portrait: TimelinePortrait,
  memoryGroup?: TimelineMemoryGroup,
): string => `
  <figure class="portrait-card">
    <div class="artwork-shell">
      <img class="artwork" src="${svgDataUrl(portrait.svg)}" alt="${escapeHtml(`${roleLabel(portrait)} of ${portrait.subjectId}, cycle ${htmlInteger(portrait.cycle)}.`)}" width="${htmlInteger(portrait.width)}" height="${htmlInteger(portrait.height)}" loading="lazy" decoding="async">
    </div>
    <figcaption>
      <strong>${escapeHtml(roleLabel(portrait))} · cycle ${htmlInteger(portrait.cycle)}</strong>
      <span>Created <time datetime="${escapeHtml(portrait.createdAt)}">${escapeHtml(portrait.createdAt)}</time></span>
      <span>Artwork ID: ${escapeHtml(portrait.id)}</span>
    </figcaption>
    ${renderMemoryGroup(memoryGroup)}
  </figure>`;

const renderSelfHistory = (individual: TimelineIndividual): string => {
  if (individual.selfPortraits.length === 0) {
    return '<p class="empty-state">No retained self-portrait is available for this Individual.</p>';
  }
  const memories = new Map(
    (individual.privateMemoryGroups ?? []).map((group) => [group.cycle, group] as const),
  );
  const omission = individual.omittedSelfPortraitCount > 0
    ? `<p class="retention-note">${htmlInteger(individual.omittedSelfPortraitCount)} retained self-${individual.omittedSelfPortraitCount === 1 ? "portrait was" : "portraits were"} omitted by the selected view bound.</p>`
    : "";
  return `${omission}<div class="portrait-grid">${individual.selfPortraits
    .map((portrait) => renderPortrait(portrait, memories.get(portrait.cycle)))
    .join("")}</div>`;
};

const renderSocialView = (individual: TimelineIndividual): string => {
  if (!individual.socialPortrait) {
    return '<p class="empty-state">No retained social composite is available.</p>';
  }
  return `<div class="portrait-grid">${renderPortrait(individual.socialPortrait)}</div>`;
};

const renderPeerView = (individual: TimelineIndividual): string => {
  if (individual.peerPortraits.length === 0) {
    return '<p class="empty-state">No persisted peer-drawing cohort is available for this retained social view.</p>';
  }
  const omission = individual.omittedPeerPortraitCount > 0
    ? `<p class="retention-note">${htmlInteger(individual.omittedPeerPortraitCount)} peer portraits were omitted by the selected view bound.</p>`
    : "";
  return `${omission}<div class="portrait-grid">${individual.peerPortraits.map((portrait) => renderPortrait(portrait)).join("")}</div>`;
};

const renderIndividual = (individual: TimelineIndividual): string => `
  <section class="individual" id="individual-${escapeHtml(individual.id)}" aria-labelledby="heading-${escapeHtml(individual.id)}">
    <header class="individual-heading">
      <p class="eyebrow">Individual ${escapeHtml(individual.id)}</p>
      <h2 id="heading-${escapeHtml(individual.id)}">${escapeHtml(individual.displayName)}</h2>
      <p>Current cycle ${htmlInteger(individual.cycle)} · snapshot updated <time datetime="${escapeHtml(individual.updatedAt)}">${escapeHtml(individual.updatedAt)}</time></p>
    </header>
    <div class="section-heading">
      <h3>Retained self-portrait history</h3>
      <p>This is the bounded history still present in the latest validated snapshot, not a complete lifetime archive.</p>
    </div>
    ${renderSelfHistory(individual)}
    <div class="section-heading">
      <h3>Latest retained social composite</h3>
      <p>The most recent social artwork retained by the snapshot. Its cycle may precede the current self-portrait.</p>
    </div>
    ${renderSocialView(individual)}
    <div class="section-heading">
      <h3>Persisted peer drawings</h3>
      <p>Only the exact peer cohort persisted with the retained social composite can appear here.</p>
    </div>
    ${renderPeerView(individual)}
  </section>`;

const renderTimelineHtml = (document: ValidatedTimelineDocument): string => {
  const styleHash = createHash("sha256").update(STYLES, "utf8").digest("base64");
  const csp = [
    "default-src 'none'",
    "script-src 'none'",
    `style-src 'sha256-${styleHash}'`,
    "img-src data:",
    "connect-src 'none'",
    "font-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const privacyWarning = document.includesPrivateMemory
    ? `<aside class="privacy-warning" role="alert"><strong>PRIVATE MEMORY IS INCLUDED.</strong>This portable file contains private narrative material that the public API deliberately excludes. Do not publish, upload, email, or share it without an explicit curatorial review.</aside>`
    : "";
  const contents = document.individuals.map((individual) =>
    `<li><a href="#individual-${escapeHtml(individual.id)}">${escapeHtml(individual.displayName)}</a></li>`
  ).join("");
  const individuals = document.individuals.map(renderIndividual).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Individuals · Retained portrait timeline</title>
  <style>${STYLES}</style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to retained portraits</a>
  <header class="page-header">
    <p class="eyebrow">Curatorial artifact · offline</p>
    <h1>Retained portrait timeline</h1>
    <p class="lede">A bounded export of validated portrait artifacts held in the current durable snapshots. It is not a complete historical archive and it performs no network requests.</p>
    <div class="metadata">
      <span>Generated <time datetime="${escapeHtml(document.generatedAt)}">${escapeHtml(document.generatedAt)}</time></span>
      <span>${htmlInteger(document.individuals.length)} Individual${document.individuals.length === 1 ? "" : "s"}</span>
      <span>Source: validated retained snapshots</span>
    </div>
    ${privacyWarning}
  </header>
  <nav class="contents" aria-label="Exported Individuals">
    <ul>${contents}</ul>
  </nav>
  <main id="main-content">${individuals}</main>
  <footer class="page-footer">Artwork is embedded as validated, base64-encoded SVG image data. This document contains no scripts, remote resources, or live runtime connection.</footer>
</body>
</html>
`;
};

/** The raw renderer is intentionally private; only opaque validated documents cross it. */
export const renderValidatedTimelineHtml = (
  document: ValidatedTimelineDocument,
): string => {
  assertValidatedTimelineDocument(document);
  return renderTimelineHtml(document);
};
