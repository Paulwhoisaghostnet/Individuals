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

## Artistic ability scope

Every Individual defines a persistent artistic ability scope. This is the
equivalent of an artist's practiced hand: it describes favored style, permitted
marks, compositional habits, correction behavior, and the limits within which a
seen body can be translated onto the canvas.

The scope records six normalized proficiencies:

- **observational accuracy** — how much of the perceived image can be retained;
- **proportion accuracy** — how reliably relative sizes and distances are drawn;
- **anatomical coherence** — how well body parts remain structurally connected;
- **line control** — steadiness and intentionality of individual marks;
- **detail capacity** — the amount of fine information that reaches the image;
- **spatial coherence** — how reliably the subject is organized in the picture plane.

These values describe drawing proficiency, not perception quality. Rendering must
preserve the causal order: the perception system first produces the Individual's
subjective observation, and the drawing system then attempts to depict that
observation through its artistic ability. A clear observation can therefore be
drawn poorly, while a distorted observation can be drawn with considerable skill.

Artistic ability is authored identity rather than exhibition tuning. Curatorial
perception controls may change what an Individual sees, but they do not grant it
new marks or improve its hand.
