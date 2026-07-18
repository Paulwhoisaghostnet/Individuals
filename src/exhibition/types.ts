export type IndividualPhase = "drawing" | "observing" | "receiving" | "reflecting";

export type PortraitMode = "self" | "social" | "peer";

export type VisualLanguage = "contour" | "fragment" | "thread";

export type BodyPlan = "willow" | "compact" | "longline";

export interface PhysicalIdentity {
  readonly bodyPlan: BodyPlan;
  readonly ideal: string;
  readonly current: string;
  readonly face: string;
  readonly surface: string;
  readonly posture: string;
  readonly invariantFeatures: readonly string[];
  readonly currentDifferences: readonly string[];
}

export type PerceptionModelKind = "boundary-lock" | "deferred-mosaic" | "motion-residue";

export interface PerceptionControl {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly format: "percent" | "integer" | "pixels";
}

export interface PerceptionModel {
  readonly id: string;
  readonly kind: PerceptionModelKind;
  readonly name: string;
  readonly description: string;
  readonly invariant: string;
  readonly controls: readonly PerceptionControl[];
}

export type PerceptionTuning = Readonly<Record<string, number>>;

export type PerceptionTuningMap = Readonly<Record<string, PerceptionTuning>>;

export interface ExhibitionIndividual {
  readonly id: string;
  readonly number: string;
  readonly name: string;
  readonly pronoun: string;
  readonly visualLanguage: VisualLanguage;
  readonly perceptionModel: PerceptionModel;
  readonly physicalIdentity: PhysicalIdentity;
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
