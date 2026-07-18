# Perception

Perception is the situated visual pipeline through which an Individual observes a
peer canvas. It must make the Individual's limitations stable enough to become
character rather than incidental corruption.

Perception operates on a physical subject. Its transformations may produce a
wrong, partial, or biased reading of that body, but must preserve provenance to the
observed subject and attempt to locate its bodily plan and identifying features.

This branch will contain:

- a common input contract for digital canvases and physical camera frames;
- crop, geometry, color, temporal, masking, and glitch operations;
- identity-specific pipelines assembled from versioned transformations;
- calibration application that remains distinct from artistic distortion;
- deterministic seeds and provenance for repeatable testing;
- latency, resolution, and degraded-input handling.

## Tuning contract

Every exhibited Individual must declare a unique `modelId`, model name, stable
distortion invariant, and bounded control definitions. A control contains an ID,
label, explanation, minimum, maximum, step, and default value. Runtime overrides
are rejected if they are unknown, non-finite, or outside the declared range.

Controls tune the strength or character of an existing perceptual limitation; they
must not allow one Individual to become an unrestricted observer or silently turn
into another Individual's model. Settings affect peer observations and the drawings
made from them, never the source peer canvas.

The browser prototype persists tuning locally for exhibition calibration. A
production installation should store approved values in versioned site
configuration and record the effective values with observation provenance.

Every observation should record its source portrait and the transformations that
were intentionally applied.
