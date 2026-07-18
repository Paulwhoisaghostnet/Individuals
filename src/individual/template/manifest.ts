import { defineIndividualManifest } from "../manifest";
import type { IndividualManifest } from "../model";

export interface TemplateManifestOptions {
  readonly id?: string;
  readonly displayName?: string;
}

export const createTemplateManifest = (
  options: TemplateManifestOptions = {},
): IndividualManifest =>
  defineIndividualManifest({
    schemaVersion: 1,
    id: options.id ?? "template-individual",
    displayName: options.displayName ?? "Unformed",
    statement: "I am learning the distance between the image I make and the image returned to me.",
    identity: {
      origin: "A newly instantiated Individual without a history.",
      privateNarrative: "I am present, unfinished, and attentive to what I may become.",
      traits: [
        {
          name: "openness",
          description: "Willingness to change in response to unfamiliar perceptions.",
          value: 0.7,
        },
        {
          name: "self-continuity",
          description: "Resistance to losing the recognizable thread of identity.",
          value: 0.7,
        },
      ],
      idealSelf: {
        narrative: "A coherent self that can change without disappearing.",
        values: ["continuity", "curiosity", "clarity"],
        visualAnchors: ["a stable center", "an open boundary", "evidence of revision"],
      },
    },
    perception: {
      description: "A neutral placeholder perception awaiting a distinctive distortion.",
      constraints: [
        "Preserve the source dimensions.",
        "Record every transformation as an observation note.",
      ],
    },
    drawing: {
      description: "A minimal placeholder language of fields, borders, and text.",
      constraints: [
        "Use only the configured palette.",
        "Produce deterministic output for the same cycle and input.",
      ],
      palette: ["#11110f", "#e9e7df", "#9e9b91"],
      preferredFormats: ["svg", "procedural"],
    },
    cadence: {
      minimumCycleIntervalMs: 60_000,
    },
  });

export const templateManifest = createTemplateManifest();

