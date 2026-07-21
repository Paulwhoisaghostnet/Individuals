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
    schemaVersion: 4,
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
        visualAnchors: ["an upright body", "an open stance", "evidence of revision"],
      },
      idealPhysicalForm: {
        description:
          "A tall, androgynous, human-proportioned figure whose calm face and open hands remain unmistakably its own.",
        bodyPlan: "Bilateral humanoid: one head, one torso, two arms, two hands, two legs, and two feet.",
        stature: "Tall and narrow with a level posture and long, balanced limbs.",
        surface: "Warm matte skin interrupted by fine, visible lines of revision.",
        face: ["oval face", "two level eyes", "straight nose", "closed mouth"],
        anatomy: ["long neck", "open hands", "balanced shoulders", "upright spine"],
        movement: "Slow, deliberate movement that returns to a calm frontal stance.",
        nonNegotiableFeatures: ["recognizable face", "open hands", "continuous upright silhouette"],
        visualSpecification: {
          figure: {
            headAspect: 0.7,
            shoulderWidth: 0.55,
            torsoWidth: 0.5,
            torsoLength: 0.62,
            armLength: 0.68,
            legLength: 0.72,
            openness: 0.64,
            verticality: 0.88,
            symmetry: 0.85,
            centerX: 0.5,
            postureLean: 0,
          },
          anatomy: {
            faceShape: "oval",
            eyeSpacing: 0.5,
            noseLength: 0.5,
            mouthWidth: 0.5,
            fingerCountPerHand: 5,
            skinColor: "#9b735c",
            surfaceFinish: "matte",
            jointContourColor: "#c7b39d",
          },
        },
      },
      initialPhysicalSelf: {
        description:
          "I see myself as an incomplete but bodily version of this figure: recognizably upright, with a face and hands that have not settled into their ideal proportions.",
        perceivedSimilarity: 0.52,
        perceivedDifferences: [
          "my shoulders feel uneven",
          "my hands are less open than they should be",
          "my face does not yet hold its intended calm",
        ],
        bodyBelief: {
          headAspect: 0.68,
          shoulderWidth: 0.51,
          torsoWidth: 0.47,
          torsoLength: 0.62,
          armLength: 0.66,
          legLength: 0.71,
          openness: 0.48,
          verticality: 0.82,
          symmetry: 0.73,
          centerX: 0.48,
          postureLean: 0.08,
        },
      },
      socialDisposition: {
        selfIntegrity: 0.7,
        socialPermeability: 0.5,
        needForRecognition: 0.6,
        resistance: 0.3,
        curiosity: 0.7,
        trustByPeer: { "peer-a": 0.5 },
      },
    },
    perception: {
      modelId: "template-lens",
      modelName: "Undifferentiated lens",
      description: "A neutral placeholder perception awaiting a distinctive distortion.",
      constraints: [
        "Preserve the source dimensions.",
        "Record every transformation as an observation note.",
      ],
      controls: [
        {
          id: "distortion-strength",
          label: "Distortion strength",
          description: "Overall strength of the placeholder visual alteration.",
          min: 0,
          max: 1,
          step: 0.01,
          defaultValue: 0.25,
        },
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
      ability: {
        styleName: "Measured contour",
        styleDescription: "A restrained observational practice built from contour and sparse hatching.",
        favoredPrimitives: ["continuous contour", "short hatch", "registration line"],
        markBehavior: "Draw slowly from large bodily boundaries toward internal features.",
        compositionBehavior: "Center one frontal body with a stable horizon and generous negative space.",
        correctionBehavior: "Place a revised line beside an error instead of erasing it.",
        skill: {
          observationalAccuracy: 0.62,
          proportionAccuracy: 0.58,
          anatomicalCoherence: 0.56,
          lineControl: 0.68,
          detailCapacity: 0.42,
          spatialCoherence: 0.65,
        },
        limitations: [
          "Cannot produce photorealistic surface detail.",
          "Complex overlaps are reduced to a single dominant contour.",
        ],
        practice: {
          markMode: "continuous-contour",
          compositionMode: "isolated-frontal",
          correctionMode: "adjacent-line",
          lineLiftAllowed: false,
          erasureAllowed: false,
          minimumRepetitions: 1,
          detailSuppression: 0.35,
          curveQuantization: 0.05,
          overlapSimplification: 0.3,
        },
      },
    },
    cadence: {
      minimumCycleIntervalMs: 60_000,
    },
  });

export const templateManifest = createTemplateManifest();
