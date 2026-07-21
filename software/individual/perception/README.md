# Perception

Perception is the situated visual pipeline through which an Individual observes a
peer canvas. It must make the Individual's limitations stable enough to become
character rather than incidental corruption.

Perception operates on a physical subject. Its transformations may produce a
wrong, partial, or biased reading of that body, but must preserve provenance to the
observed subject and attempt to locate its bodily plan and identifying features.

The prototype implements:

- a common input contract for digital canvases and physical camera frames;
- identity-specific geometry, feature, color, masking, and glitch operations;
- identity-specific pipelines assembled from versioned transformations;
- calibration application that remains distinct from artistic distortion;
- deterministic seeds and provenance for repeatable testing;
- provenance and explicit degraded-input handling.

Deterministic lens bias is keyed to the observer (and, for cameras, the fixed
route), not to portrait or cycle IDs. A later portrait can change what is seen,
but chronology alone cannot randomly reverse an Individual's characteristic lens.

## Tuning contract

Every exhibited Individual must declare a unique `modelId`, model name, stable
distortion invariant, and bounded control definitions. A control contains an ID,
label, explanation, minimum, maximum, step, and default value. Runtime overrides
are rejected if they are unknown, non-finite, or outside the declared range.

Controls tune the strength or character of an existing perceptual limitation; they
must not allow one Individual to become an unrestricted observer or silently turn
into another Individual's model. Settings affect peer observations and the drawings
made from them, never the source peer canvas.

The browser sends tuning to authenticated runtime controls. Approved values are
validated against the manifest, committed to the runtime's durable calibration
store before acknowledgement, and recorded with observation provenance. Local
simulation tuning is visibly separate from live calibration.

Every observation should record its source portrait and the transformations that
were intentionally applied.

## Physical acquisition boundary

Digital and physical frames are a discriminated union. A digital-canvas frame may
carry its routed structured descriptor. A physical-camera frame must contain only
raster-reference artwork and capture/route metadata; a runtime check rejects even
type-cast attempts to attach the source descriptor. The frame interpreter receives
that descriptor-free view, and an unchanged pass-through of the routed portrait
descriptor is rejected.

Physical evidence records raw portrait lineage, the pixel interpretation, the
canonical optical calibration result, and the later identity-specific perception
result as separate stages. The engine recomputes calibration and verifies lineage
before drawing, so optical effects no longer masquerade as source metadata.

Categorical anatomy participates in this pipeline too. A lens may miscount
fingers, quantize facial proportions, or lose joints, plates, and spinal marks;
the drawing stage then independently decides which perceived details the artist's
skill can reproduce. These losses are represented in typed descriptors rather
than inferred from prose.
