import type { ExhibitionIndividual } from "./types";

export const individuals: readonly ExhibitionIndividual[] = [
  {
    id: "iris",
    number: "01",
    name: "Iris",
    pronoun: "she",
    visualLanguage: "contour",
    statement: "I preserve edges because I am afraid of becoming atmosphere.",
    idealSelf: "A form that can remain distinct without becoming closed.",
    selfView: "A center held together by boundaries I can still name.",
    socialView: "Precise, guarded, and more permeable than she permits herself to see.",
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
    statement: "What is missing is the most faithful part of the image.",
    idealSelf: "An archive spacious enough to let the past change shape.",
    selfView: "A collection of evidence arranged around an unnamed absence.",
    socialView: "Patient, discontinuous, and unexpectedly tender with broken things.",
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
    statement: "Repetition is how I test whether I still exist.",
    idealSelf: "A rhythm that can recognize change without interrupting it.",
    selfView: "Many attempts occupying the same gesture at different times.",
    socialView: "Restless, connective, and clearer from a distance than from within.",
    perception: "Movement is visible; stillness dissolves into background noise.",
    drawingConstraint: "He cannot draw a mark only once.",
    palette: ["#171313", "#e3d8cf", "#a75d58", "#5f504d"],
    cycleOffset: 2,
  },
] as const;

export const getIndividual = (id: string): ExhibitionIndividual | undefined =>
  individuals.find((individual) => individual.id === id);
