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

export type FaceShape = "oval" | "square" | "elongated";
export type SurfaceFinish = "matte" | "translucent-plate" | "threaded";

export interface AnatomyVisualSpecification {
  readonly faceShape: FaceShape;
  readonly eyeSpacing: number;
  readonly noseLength: number;
  readonly mouthWidth: number;
  readonly fingerCountPerHand: number;
  readonly skinColor: string;
  readonly surfaceFinish: SurfaceFinish;
  readonly jointContourColor?: string;
  readonly chestPlates?: {
    readonly count: number;
    readonly color: string;
    readonly opacity: number;
  };
  readonly spinalMark?: {
    readonly color: string;
    readonly width: number;
  };
}

export interface BodyVisualSpecification {
  readonly figure: FigureDescriptor;
  readonly anatomy: AnatomyVisualSpecification;
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
  /** Executable counterpart to the curatorial prose above. */
  readonly visualSpecification?: BodyVisualSpecification;
}

export interface EmbodiedSelfConcept {
  readonly description: string;
  readonly perceivedSimilarity: number;
  readonly perceivedDifferences: readonly string[];
  readonly bodyBelief?: FigureDescriptor;
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
  readonly practice?: ArtPracticeSpecification;
}

export type MarkMode = "continuous-contour" | "assembled-planes" | "repeated-gesture";
export type CompositionMode = "isolated-frontal" | "low-grounded" | "spine-centered";
export type CorrectionMode = "adjacent-line" | "overpaint-plane" | "repeated-pass";

export interface ArtPracticeSpecification {
  readonly markMode: MarkMode;
  readonly compositionMode: CompositionMode;
  readonly correctionMode: CorrectionMode;
  readonly lineLiftAllowed: boolean;
  readonly erasureAllowed: boolean;
  readonly minimumRepetitions: number;
  readonly detailSuppression: number;
  readonly curveQuantization: number;
  readonly overlapSimplification: number;
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
  readonly nextBodyAdjustments?: readonly SignedBodyAdjustment[];
}

export interface Artwork {
  readonly format: ArtworkFormat;
  readonly width: number;
  readonly height: number;
  readonly content: string;
}

/**
 * A renderer-independent description of the physical figure carried by an
 * artwork. Values are normalized so perception, drawing, cognition, and
 * feedback can exchange evidence without parsing or embedding executable SVG.
 */
export interface FigureDescriptor {
  readonly headAspect: number;
  readonly shoulderWidth: number;
  readonly torsoWidth: number;
  readonly torsoLength: number;
  readonly armLength: number;
  readonly legLength: number;
  readonly openness: number;
  readonly verticality: number;
  readonly symmetry: number;
  readonly centerX: number;
  readonly postureLean: number;
}

export interface RenderingDescriptor {
  readonly edgeEmphasis: number;
  readonly interiorVisibility: number;
  readonly fragmentation: number;
  readonly sampleRetention: number;
  readonly temporalLag: number;
  readonly echoCount: number;
  readonly echoSpacing: number;
  readonly stillnessVisibility: number;
}

export interface FeatureDescriptor {
  readonly label: string;
  readonly prominence: number;
  /** Fraction of all social contributors that carried this feature. */
  readonly support?: number;
}

export interface ArtworkDescriptor {
  readonly schemaVersion: 1;
  readonly figure: FigureDescriptor;
  readonly rendering: RenderingDescriptor;
  readonly features: readonly FeatureDescriptor[];
  readonly omittedFeatures: readonly string[];
  readonly styleName: string;
  readonly primitives: readonly string[];
  readonly confidence: number;
  readonly anatomy?: AnatomyVisualSpecification;
  readonly practice?: ArtPracticeSpecification;
}

export type FigureDimension = keyof FigureDescriptor;

export interface SignedBodyAdjustment {
  readonly dimension: FigureDimension;
  readonly direction: -1 | 1;
  readonly magnitude: number;
  readonly basis: "ideal" | "social" | "self";
}

export interface GeometricAssessment {
  readonly selfIdealDistance: number;
  readonly socialIdealDistance?: number;
  readonly selfSocialDistance?: number;
  readonly predictedIdealDistance: number;
}

export interface PerceptionEffectEvidence {
  readonly dimension: FigureDimension | keyof RenderingDescriptor | "features";
  readonly operation: "increase" | "decrease" | "quantize" | "offset" | "repeat" | "omit";
  readonly magnitude: number;
  readonly explanation: string;
}

export interface OpticalCalibrationEvidence {
  readonly focalLengthMm: number;
  readonly workingDistanceMeters: number;
  readonly ambientIlluminationLux: number;
  readonly lensDistortionGain: number;
  readonly opticalCenterOffsetX?: number;
  readonly opticalCenterOffsetY?: number;
}

export interface VisualAcquisitionEvidence {
  readonly schemaVersion: 1;
  readonly sourceKind: "digital-canvas" | "physical-camera" | "recorded-fixture";
  readonly sourcePortraitId: string;
  readonly sourceId: string;
  readonly targetCanvasId: string;
  readonly capturedAt: string;
  /** Descriptor produced from the acquired frame before optical calibration. */
  readonly interpreted: ArtworkDescriptor;
  /** Canonical calibration transform applied to the interpreted descriptor. */
  readonly calibrated: ArtworkDescriptor;
  readonly calibration: OpticalCalibrationEvidence;
}

export interface PerceptionEvidence {
  readonly modelId: string;
  readonly tuning: Readonly<Record<string, number>>;
  readonly source: ArtworkDescriptor;
  readonly perceived: ArtworkDescriptor;
  readonly effects: readonly PerceptionEffectEvidence[];
  readonly acquisition?: VisualAcquisitionEvidence;
}

export interface FigureDifferenceEvidence {
  readonly dimension: FigureDimension;
  readonly selfValue: number;
  readonly socialValue: number;
  readonly delta: number;
}

export interface SocialContributionEvidence {
  readonly portraitId: string;
  readonly artistId: string;
  readonly descriptor: ArtworkDescriptor;
  readonly perceptionEvidence?: PerceptionEvidence;
  readonly weight: number;
}

export interface SocialDisagreementEvidence {
  readonly dimension: FigureDimension;
  readonly spread: number;
  readonly minimum: number;
  readonly maximum: number;
}

export interface SocialFeedbackEvidence {
  readonly subjectId: string;
  readonly sourceSelfPortraitId: string;
  readonly contributions: readonly SocialContributionEvidence[];
  readonly consensus: ArtworkDescriptor;
  readonly comparisonToSelf: readonly FigureDifferenceEvidence[];
  readonly disagreements: readonly SocialDisagreementEvidence[];
  readonly confidence: number;
  readonly geometry?: GeometricAssessment;
}

export interface Portrait {
  readonly id: string;
  readonly cycle: number;
  readonly artistId: string;
  readonly subjectId: string;
  readonly role: PortraitRole;
  readonly createdAt: string;
  readonly artwork: Artwork;
  /** Present on causal-loop portraits; optional for imported/legacy artwork. */
  readonly descriptor?: ArtworkDescriptor;
  /** Present only on a social composite. */
  readonly socialEvidence?: SocialFeedbackEvidence;
  /** Present on a peer portrait to preserve what its artist actually perceived. */
  readonly observationEvidence?: PerceptionEvidence;
  readonly statement?: string;
  readonly sourcePortraitIds: readonly string[];
}

export interface Observation {
  readonly observerId: string;
  readonly subjectId: string;
  readonly sourcePortrait: Portrait;
  readonly perceivedArtwork: Artwork;
  /** Structured perception evidence; optional for hardware/legacy adapters. */
  readonly evidence?: PerceptionEvidence;
  readonly notes: readonly string[];
}

export interface CycleIntent {
  readonly statement: string;
  readonly desiredQualities: readonly string[];
  readonly visualInstructions: readonly string[];
  readonly bodilyInstructions: readonly string[];
  readonly bodyAdjustments?: readonly SignedBodyAdjustment[];
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
    readonly nextBodyAdjustments?: readonly SignedBodyAdjustment[];
    readonly geometry?: GeometricAssessment;
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
  readonly selfPortraitHistory?: readonly Portrait[];
  readonly latestSocialPortrait?: Portrait;
  /** Exact peer drawings consumed by latestSocialPortrait, in composite source order. */
  readonly latestSocialPeerPortraits?: readonly Portrait[];
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
  readonly signal?: AbortSignal;
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
