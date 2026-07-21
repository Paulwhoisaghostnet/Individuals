import type {
  CycleIntent,
  IdentityReflection,
  IndividualManifest,
  IndividualState,
  MemoryEntry,
  Observation,
  Portrait,
  SelfConcept,
  SocialFeedbackEvidence,
  PeerModel,
} from "../model";

export interface CognitionSystem {
  formIntent(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    memories: readonly MemoryEntry[];
    cycle: number;
    signal?: AbortSignal;
  }): Promise<CycleIntent>;

  reflect(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    intent: CycleIntent;
    selfPortrait: Portrait;
    socialPortrait?: Portrait;
    socialEvidence?: SocialFeedbackEvidence;
    cycle: number;
    signal?: AbortSignal;
  }): Promise<IdentityReflection>;
}

export interface PerceptionSystem {
  observe(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    portrait: Portrait;
    cycle: number;
    tuning: Readonly<Record<string, number>>;
    signal?: AbortSignal;
  }): Promise<Observation>;
}

export interface DrawingSystem {
  drawSelf(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    intent: CycleIntent;
    cycle: number;
    createdAt: string;
    signal?: AbortSignal;
  }): Promise<Portrait>;

  drawPeer(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    intent: CycleIntent;
    observation: Observation;
    cycle: number;
    createdAt: string;
    signal?: AbortSignal;
  }): Promise<Portrait>;
}

export interface FeedbackCompositor {
  compose(input: {
    manifest: IndividualManifest;
    state: IndividualState;
    portraits: readonly Portrait[];
    /** Persisted self portrait that every peer contribution actually observed. */
    sourceSelfPortrait?: Portrait;
    cycle: number;
    createdAt: string;
    signal?: AbortSignal;
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
    signal?: AbortSignal;
  }): Promise<SelfConcept>;
}

export interface RelationshipAdaptationSystem {
  adapt(input: {
    readonly manifest: IndividualManifest;
    readonly state: IndividualState;
    readonly evidence?: SocialFeedbackEvidence;
    readonly cycle: number;
    readonly signal?: AbortSignal;
  }): Promise<Readonly<Record<string, PeerModel>>>;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  create(parts: readonly (string | number)[]): string;
}

export interface CycleProgressSink {
  report(event: {
    readonly individualId: string;
    readonly cycle: number;
    readonly phase: "idle" | "observing" | "drawing" | "reflecting";
  }): void | Promise<void>;
}
