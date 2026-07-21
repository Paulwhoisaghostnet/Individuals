# Browser release pass

This checklist covers behavior that DOM serialization and unit tests cannot prove.
Run it in a real Chromium browser for every exhibition release candidate, against
temporary runtime state and non-production ports. `npm run check` remains the
automated contract gate; completing it is not evidence that this checklist passed.

## Isolated setup

1. Create a temporary directory outside the repository.
2. Generate a fresh curator token of at least 32 random bytes.
3. Start the runtime with that directory, the token, an accelerated cycle interval,
   and loopback-only host/port settings.
4. Start Vite on loopback with its API proxy aimed at that runtime.
5. Open the exhibition in Chromium and confirm the console begins without errors.

Never point a browser release pass at the production volume. Do not commit the
token, runtime state, console capture, or screenshots.

## Required scenarios

- **Live provenance:** the footer reports verified live state, cycles advance from
  the API, and self/peer/social canvases resolve to same-origin runtime artifacts.
- **Keyboard and focus:** every gallery card and header control is reachable by
  keyboard; opening About, Tune, and an Individual places focus inside the new
  surface; Tab and Shift+Tab remain contained in a modal; Escape closes it and
  restores focus to the exact trigger.
- **Curator lifecycle:** an invalid token produces a bounded, useful error; a valid
  token can pause, resume, tune, and reset; closing and reopening Tune clears the
  token field.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, animated marks and the
  cycle indicator stop moving without hiding state.
- **Narrow viewport:** at 320 CSS pixels wide, controls, cards, modals, captions,
  and sliders remain reachable with no horizontal document overflow.
- **Artwork failure:** block or invalidate one portrait request; the failed image is
  replaced by an explicitly labeled local study and no broken-image fiction is
  presented as live artwork.
- **Outage and recovery:** stop the runtime after a verified snapshot; the browser
  retains the last verified state, identifies the outage/fallback honestly, and
  does not manufacture live cycles.
- **Late reconnection:** restart the same runtime after the client has entered
  recovery; a fresh valid snapshot replaces the fallback, provenance returns to
  verified live, and no stale revision overwrites the newer state.
- **Console and network:** finish with no uncaught errors, rejected mixed-origin
  artwork, leaked curator token, unbounded request loop, or failed request that the
  interface has silently hidden.

## Evidence to record

Record the commit, browser/version, viewport, runtime/API ports, completion time,
and pass/fail result for each scenario. A failure blocks release until its owning
domain is fixed and the affected scenario is rerun; route it using
[`../architecture/issue-routing.md`](../architecture/issue-routing.md).
