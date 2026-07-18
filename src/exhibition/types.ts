export type IndividualPhase = "drawing" | "observing" | "receiving" | "reflecting";

export type PortraitMode = "self" | "social" | "peer";

export type VisualLanguage = "contour" | "fragment" | "thread";

export interface ExhibitionIndividual {
  readonly id: string;
  readonly number: string;
  readonly name: string;
  readonly pronoun: string;
  readonly visualLanguage: VisualLanguage;
  readonly statement: string;
  readonly idealSelf: string;
  readonly selfView: string;
  readonly socialView: string;
  readonly perception: string;
  readonly drawingConstraint: string;
  readonly palette: readonly [string, string, string, string];
  readonly cycleOffset: number;
}

export interface IndividualPresence {
  readonly individual: ExhibitionIndividual;
  readonly phase: IndividualPhase;
  readonly activity: string;
}

export interface CycleEvent {
  readonly cycle: number;
  readonly sentence: string;
}
