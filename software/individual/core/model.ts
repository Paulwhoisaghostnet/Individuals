export type IndividualStatus = "idle" | "observing" | "drawing" | "reflecting" | "paused";

export type PortraitRole = "self" | "peer" | "social";

export type ArtworkFormat = "svg" | "procedural" | "raster-reference";

export interface Trait {
  readonly name: string;
  readonly description: string;
  readonly value: number;
}

export interface IdealSelf {
  readonly narrative: string;
  readonly values: readonly string[];
  readonly visualAnchors: readonly string[];
}

export interface PhysicalForm {
  readonly description: string;
  readonly bodyPlan: string;
  readonly stature: string;
  readonly surface: string;
  readonly face: readonly string[];
  readonly anatomy: readonly string[];
  readonly movement: string;
  readonly nonNegotiableFeatures: readonly string[];
}

export interface EmbodiedSelfConcept {
  readonly description: string;
  readonly perceivedSimilarity: number;
  readonly perceivedDifferences: readonly string[];
}

export interface SocialDisposition {
  readonly selfIntegrity: number;
  readonly socialPermeability: number;
  readonly needForRecognition: number;
  readonly resistance: number;
  readonly curiosity: number;
  readonly trustByPeer: Readonly<Record<string, number>>;
}

export interface PeerModel {
  readonly peerId: string;
  readonly perceivedDistortions: readonly string[];
  readonly perceivedReliability: number;
  readonly perceivedTrend: string;
  readonly expectedReaction: string;
}

export interface IdentityDefinition {
  readonly origin: string;
  readonly privateNarrative: string;
  readonly traits: readonly Trait[];
  readonly idealSelf: IdealSelf;
  readonly idealPhysicalForm: PhysicalForm;
  readonly initialPhysicalSelf: EmbodiedSelfConcept;
  readonly socialDisposition: SocialDisposition;
}

export interface CapabilityProfile {
  readonly description: string;
  readonly constraints: readonly string[];
}

export interface PerceptionControlDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
}

export interface PerceptionProfile extends CapabilityProfile {
  readonly modelId: string;
  readonly modelName: string;
  readonly controls: readonly PerceptionControlDefinition[];
}

export interface DrawingProfile extends CapabilityProfile {
  readonly palette: readonly string[];
  readonly preferredFormats: readonly ArtworkFormat[];
  readonly ability: ArtisticAbilityScope;
}

export interface DrawingSkillProfile {
  readonly observationalAccuracy: number;
  readonly proportionAccuracy: number;
  readonly anatomicalCoherence: number;
  readonly lineControl: number;
  readonly detailCapacity: number;
  readonly spatialCoherence: number;
}

export interface ArtisticAbilityScope {
  readonly styleName: string;
  readonly styleDescription: string;
  readonly favoredPrimitives: readonly string[];
  readonly markBehavior: string;
  readonly compositionBehavior: string;
  readonly correctionBehavior: string;
  readonly skill: DrawingSkillProfile;
  readonly limitations: readonly string[];
}

export interface IndividualManifest {
  readonly schemaVersion: 4;
  readonly id: string;
  readonly displayName: string;
  readonly statement: string;
  readonly identity: IdentityDefinition;
  readonly perception: PerceptionProfile;
  readonly drawing: DrawingProfile;
  readonly cadence: {
    readonly minimumCycleIntervalMs: number;
  };
}

export interface SelfConcept {
  readonly narrative: string;
  readonly keywords: readonly string[];
  readonly confidence: number;
  readonly physicalSelf: EmbodiedSelfConcept;
}

export interface Artwork {
  readonly format: ArtworkFormat;
  readonly width: number;
  readonly height: number;
  readonly content: string;
}

export interface Portrait {
  readonly id: string;
  readonly cycle: number;
  readonly artistId: string;
  readonly subjectId: string;
  readonly role: PortraitRole;
  readonly createdAt: string;
  readonly artwork: Artwork;
  readonly statement?: string;
  readonly sourcePortraitIds: readonly string[];
}

export interface Observation {
  readonly observerId: string;
  readonly subjectId: string;
  readonly sourcePortrait: Portrait;
  readonly perceivedArtwork: Artwork;
  readonly notes: readonly string[];
}

export interface CycleIntent {
  readonly statement: string;
  readonly desiredQualities: readonly string[];
  readonly visualInstructions: readonly string[];
  readonly bodilyInstructions: readonly string[];
}

export interface IdentityReflection {
  readonly summary: string;
  readonly tensions: readonly string[];
  readonly nextIntention: string;
  readonly memory: string;
  readonly physicalAssessment: {
    readonly similarityDelta: number;
    readonly retainedFeatures: readonly string[];
    readonly perceivedDifferences: readonly string[];
    readonly nextBodilyAdjustment: string;
  };
  readonly intendedSignals?: readonly string[];
  readonly perceivedPeerSignals?: Readonly<Record<string, readonly string[]>>;
  readonly recurringPatterns?: readonly string[];
  readonly acceptedFeedback?: readonly string[];
  readonly rejectedFeedback?: readonly string[];
  readonly unresolvedQuestions?: readonly string[];
  readonly relationshipUpdates?: Readonly<Record<string, Partial<PeerModel>>>;
  readonly publicFragment?: string;
}

export interface MemoryEntry {
  readonly id: string;
  readonly individualId: string;
  readonly cycle: number;
  readonly kind: "experience" | "reflection" | "relationship" | "summary";
  readonly content: string;
  readonly createdAt: string;
  readonly relatedIndividualIds: readonly string[];
}

export interface IndividualState {
  readonly individualId: string;
  readonly status: IndividualStatus;
  readonly cycle: number;
  readonly selfConcept: SelfConcept;
  readonly relationships: Readonly<Record<string, PeerModel>>;
  readonly currentSelfPortrait?: Portrait;
  readonly latestSocialPortrait?: Portrait;
  readonly lastReflection?: IdentityReflection;
  readonly longTermSummary?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IndividualSnapshot {
  readonly manifest: IndividualManifest;
  readonly state: IndividualState;
}

export interface CycleInput {
  readonly peerSelfPortraits: readonly Portrait[];
  readonly receivedPeerPortraits: readonly Portrait[];
  readonly perceptionTuning?: Readonly<Record<string, number>>;
}

export interface CycleRecord {
  readonly individualId: string;
  readonly cycle: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly intent: CycleIntent;
  readonly selfPortrait: Portrait;
  readonly peerPortraits: readonly Portrait[];
  readonly socialPortrait?: Portrait;
  readonly reflection: IdentityReflection;
  readonly state: IndividualState;
}
