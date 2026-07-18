# Drawing

Drawing converts intention or perception into a portrait within the Individual's
authored visual abilities and limitations.

Every portrait must attempt to depict a physical subject. A renderer may simplify,
omit, repeat, glitch, or misproportion anatomy according to the Individual's
limitations, but a purely non-representational composition is not a valid self or
peer portrait.

This branch will contain:

- procedural mark, layer, mask, typography, and composition primitives;
- self-portrait and peer-portrait rendering pipelines;
- physical-form registration for anatomy, face, posture, surface, and invariant features;
- optional image-model adapters behind a provider-neutral interface;
- palette, resolution, aspect-ratio, and format enforcement;
- deterministic seeds and artifact provenance;
- export paths for digital canvases and physical display targets.

Drawing must not silently bypass the constraints in the identity package, even
when the selected model or renderer is capable of more.
