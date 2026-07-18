import type { ExhibitionIndividual } from "./types";

export const individuals: readonly ExhibitionIndividual[] = [
  {
    id: "iris",
    number: "01",
    name: "Iris",
    pronoun: "she",
    visualLanguage: "contour",
    physicalIdentity: {
      bodyPlan: "willow",
      ideal:
        "A tall humanlike woman with copper-brown skin, a shaved oval head, a long neck, level shoulders, and open four-fingered hands.",
      current:
        "She sees the same woman already present, but with a guarded chest, uneven shoulders, and hands that have not fully opened.",
      face: "An oval face with wide-set dark eyes, a narrow nose, and a level closed mouth.",
      surface: "Warm matte skin crossed by fine pale contour lines at the joints.",
      posture: "Upright and frontal, chin level, arms held slightly away from the torso.",
      invariantFeatures: ["shaved oval head", "long neck", "four-fingered hands"],
      currentDifferences: ["left shoulder held high", "hands partially closed", "chest drawn inward"],
    },
    statement: "This is my body. I preserve its edges because I am afraid of losing it.",
    idealSelf: "A woman whose tall, open body can remain distinct without becoming closed.",
    selfView: "I already have her face and limbs; my posture has not yet learned her openness.",
    socialView: "Her peers return the same recognizable woman, but see tension in her shoulders and hands.",
    perception: "Edges remain sharp while interiors lose information.",
    drawingConstraint: "She can draw only continuous lines. Nothing may be erased.",
    palette: ["#181814", "#ded9ca", "#c57d4d", "#5d574d"],
    cycleOffset: 0,
  },
  {
    id: "morrow",
    number: "02",
    name: "Morrow",
    pronoun: "they",
    visualLanguage: "fragment",
    physicalIdentity: {
      bodyPlan: "compact",
      ideal:
        "A compact androgynous human body with a broad torso, silver-grey skin, a square face, strong legs, and translucent plates fitted over the sternum and hips.",
      current:
        "They see that body assembled and alive, though several plates sit out of alignment and the left side of the face arrives less clearly than the right.",
      face: "A square face with close-set pale eyes, a broad nose, and a soft asymmetric mouth.",
      surface: "Silver-grey skin with translucent rectangular plates protecting the chest and hips.",
      posture: "Weight centered low over both feet, elbows bent slightly forward.",
      invariantFeatures: ["broad torso", "square face", "translucent chest plates"],
      currentDifferences: ["left cheek incomplete", "sternum plates misaligned", "right knee turned inward"],
    },
    statement: "This assembled body is mine, including the pieces I cannot yet place.",
    idealSelf: "An androgynous body whose plates hold history without restricting movement.",
    selfView: "I possess the intended torso, face, and legs; some pieces remain incorrectly fitted.",
    socialView: "Their peers recognize the whole body before they do and disagree about which plates are missing.",
    perception: "Every image arrives late and with portions already forgotten.",
    drawingConstraint: "They may keep only one third of what they perceive.",
    palette: ["#111417", "#d9ddd8", "#809593", "#4d5458"],
    cycleOffset: 1,
  },
  {
    id: "sable",
    number: "03",
    name: "Sable",
    pronoun: "he",
    visualLanguage: "thread",
    physicalIdentity: {
      bodyPlan: "longline",
      ideal:
        "A very tall humanlike man with umber skin, an elongated face, six fingers on each hand, long arms, narrow hips, and a spine marked by a single red line.",
      current:
        "He sees the intended man in every portrait, but his limbs repeat in faint echoes and his spine bends away from the red line he believes should organize him.",
      face: "A long face with deep-set eyes, a high nose bridge, and a narrow mouth.",
      surface: "Dark umber skin carrying one red line from the crown of the head to the base of the spine.",
      posture: "Tall and forward-facing with long arms relaxed beside narrow hips.",
      invariantFeatures: ["elongated face", "six-fingered hands", "red spinal line"],
      currentDifferences: ["spine bends right", "arms appear in echoes", "head tilts away from center"],
    },
    statement: "I know this long body is mine because every repeated limb returns to it.",
    idealSelf: "A tall man whose singular spine can hold change without multiplying it.",
    selfView: "I have his face, hands, and height; my outline still repeats when I try to stand still.",
    socialView: "His peers return one body with a visible lean, not the many bodies he fears he has become.",
    perception: "Movement is visible; stillness dissolves into background noise.",
    drawingConstraint: "He cannot draw a mark only once.",
    palette: ["#171313", "#e3d8cf", "#a75d58", "#5f504d"],
    cycleOffset: 2,
  },
] as const;

export const getIndividual = (id: string): ExhibitionIndividual | undefined =>
  individuals.find((individual) => individual.id === id);
