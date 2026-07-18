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

Every observation should record its source portrait and the transformations that
were intentionally applied.
