# Drawing

Drawing converts intention or perception into a portrait within the Individual's
authored visual abilities and limitations.

This branch will contain:

- procedural mark, layer, mask, typography, and composition primitives;
- self-portrait and peer-portrait rendering pipelines;
- optional image-model adapters behind a provider-neutral interface;
- palette, resolution, aspect-ratio, and format enforcement;
- deterministic seeds and artifact provenance;
- export paths for digital canvases and physical display targets.

Drawing must not silently bypass the constraints in the identity package, even
when the selected model or renderer is capable of more.
