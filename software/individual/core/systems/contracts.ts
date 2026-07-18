import type {
  CycleIntent,
  IdentityReflection,
  IndividualManifest,
  IndividualState,
  MemoryEntry,
  Observation,
  Portrait,
  SelfConcept,
} from "../model";

export interface CognitionSystem {
  formIntent(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    memories: readonly MemoryEntry[];
    cycle: number;
  }): Promise<CycleIntent>;

  reflect(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    intent: CycleIntent;
    selfPortrait: Portrait;
    socialPortrait?: Portrait;
    cycle: number;
  }): Promise<IdentityReflection>;
}

export interface PerceptionSystem {
  observe(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    portrait: Portrait;
    cycle: number;
  }): Promise<Observation>;
}

export interface DrawingSystem {
  drawSelf(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    intent: CycleIntent;
    cycle: number;
    createdAt: string;
  }): Promise<Portrait>;

  drawPeer(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    intent: CycleIntent;
    observation: Observation;
    cycle: number;
    createdAt: string;
  }): Promise<Portrait>;
}

export interface FeedbackCompositor {
  compose(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    portraits: readonly Portrait[];
    cycle: number;
    createdAt: string;
  }): Promise<Portrait | undefined>;
}

export interface AdaptationSystem {
  adapt(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    reflection: IdentityReflection;
    selfPortrait: Portrait;
    socialPortrait?: Portrait;
    cycle: number;
  }): Promise<SelfConcept>;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  create(parts: readonly (string | number)[]): string;
}
