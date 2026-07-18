# Perception

Perception is the situated visual pipeline through which an Individual observes a
peer canvas. It must make the Individual's limitations stable enough to become
character rather than incidental corruption.

This branch will contain:

- a common input contract for digital canvases and physical camera frames;
- crop, geometry, color, temporal, masking, and glitch operations;
- identity-specific pipelines assembled from versioned transformations;
- calibration application that remains distinct from artistic distortion;
- deterministic seeds and provenance for repeatable testing;
- latency, resolution, and degraded-input handling.

Every observation should record its source portrait and the transformations that
were intentionally applied.
