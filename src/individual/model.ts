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

export interface IdentityDefinition {
  readonly origin: string;
  readonly privateNarrative: string;
  readonly traits: readonly Trait[];
  readonly idealSelf: IdealSelf;
}

export interface CapabilityProfile {
  readonly description: string;
  readonly constraints: readonly string[];
}

export interface DrawingProfile extends CapabilityProfile {
  readonly palette: readonly string[];
  readonly preferredFormats: readonly ArtworkFormat[];
}

export interface IndividualManifest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly displayName: string;
  readonly statement: string;
  readonly identity: IdentityDefinition;
  readonly perception: CapabilityProfile;
  readonly drawing: DrawingProfile;
  readonly cadence: {
    readonly minimumCycleIntervalMs: number;
  };
}

export interface SelfConcept {
  readonly narrative: string;
  readonly keywords: readonly string[];
  readonly confidence: number;
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
}

export interface IdentityReflection {
  readonly summary: string;
  readonly tensions: readonly string[];
  readonly nextIntention: string;
  readonly memory: string;
}

export interface MemoryEntry {
  readonly id: string;
  readonly individualId: string;
  readonly cycle: number;
  readonly kind: "experience" | "reflection" | "relationship";
  readonly content: string;
  readonly createdAt: string;
  readonly relatedIndividualIds: readonly string[];
}

export interface IndividualState {
  readonly individualId: string;
  readonly status: IndividualStatus;
  readonly cycle: number;
  readonly selfConcept: SelfConcept;
  readonly currentSelfPortrait?: Portrait;
  readonly latestSocialPortrait?: Portrait;
  readonly lastReflection?: IdentityReflection;
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

