import type { IndividualPhase, PerceptionTuningMap } from "../types";

export const SOCIETY_API_VERSION = "1" as const;

export type PublicArtworkFormat = "svg";
export type PublicIndividualStatus = "idle" | "observing" | "drawing" | "reflecting" | "paused";

export interface PublicArtworkReference {
  readonly id: string;
  readonly cycle: number;
  readonly format: PublicArtworkFormat;
  /** A validated same-origin path. Artwork content is never injected into the DOM. */
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly createdAt: string;
}

export interface PublicEmbodiment {
  readonly description: string;
  readonly similarity: number;
  readonly perceivedDifferences: readonly string[];
  readonly nextBodilyAdjustment?: string;
}

export interface PublicPeerArtwork {
  readonly artistId: string;
  readonly artwork: PublicArtworkReference;
}

export interface PublicIndividualRuntime {
  readonly id: string;
  readonly displayName: string;
  readonly cycle: number;
  readonly status: PublicIndividualStatus;
  readonly isPaused: boolean;
  readonly isRunningCycle: boolean;
  readonly updatedAt: string;
  readonly publicReflection?: string;
  readonly embodiment: PublicEmbodiment;
  readonly perceptionTuning: Readonly<Record<string, number>>;
  readonly portraits: {
    readonly self?: PublicArtworkReference;
    readonly social?: PublicArtworkReference;
    readonly peers: readonly PublicPeerArtwork[];
  };
}

export interface PublicSocietySnapshot {
  readonly apiVersion: typeof SOCIETY_API_VERSION;
  readonly revision: string;
  readonly generatedAt: string;
  readonly runtime: {
    readonly mode: "live";
    readonly status: "running" | "paused" | "degraded";
    readonly startedAt: string;
  };
  readonly individuals: readonly PublicIndividualRuntime[];
}

export interface SocietyHeartbeat {
  readonly revision: string;
  readonly generatedAt: string;
  readonly startedAt: string;
}

export type RuntimeMode = "auto" | "live" | "local";

export interface RuntimeConfig {
  readonly apiBasePath: string;
  readonly mode: RuntimeMode;
  readonly localFallbackAfterMs: number;
  readonly pollIntervalMs: number;
}

export type RuntimeSource = "live" | "local";
export type RuntimeControlTarget = "live" | "local";
export type ArtworkDisplayMode = "verified-live" | "local-simulation" | "unverified-study";

export type ConnectionPhase =
  | "connecting"
  | "live"
  | "degraded"
  | "local";

export type ConnectionTransport = "sse" | "polling" | "none";

export interface SocietyConnection {
  readonly phase: ConnectionPhase;
  readonly transport: ConnectionTransport;
  readonly attempt: number;
  readonly hasConnected: boolean;
  /** True only after the current transport has verified the displayed revision. */
  readonly snapshotCurrent: boolean;
  readonly lastDataAt?: string;
  readonly message: string;
}

export interface SocietyConnectionState {
  readonly snapshot?: PublicSocietySnapshot;
  readonly connection: SocietyConnection;
  readonly fallbackActive: boolean;
}

export interface RuntimeIndividualView {
  readonly id: string;
  readonly cycle: number;
  readonly phase: IndividualPhase | "idle" | "paused";
  readonly activity: string;
  readonly isPaused: boolean;
  readonly isRunningCycle: boolean;
  readonly updatedAt?: string;
  readonly publicReflection?: string;
  readonly embodiment?: PublicEmbodiment;
  readonly portraits: {
    readonly self?: PublicArtworkReference;
    readonly social?: PublicArtworkReference;
    readonly peers: readonly PublicPeerArtwork[];
  };
}

export interface SocietyRuntimeView {
  readonly source: RuntimeSource;
  /** What the visible canvases actually contain, independent of the intended control target. */
  readonly artworkMode: ArtworkDisplayMode;
  readonly controlTarget: RuntimeControlTarget;
  readonly sourceLabel: string;
  readonly sourceDescription: string;
  readonly connection: SocietyConnection;
  readonly individuals: Readonly<Record<string, RuntimeIndividualView>>;
  readonly tuningMap: PerceptionTuningMap;
  readonly eventSentence: string;
  readonly cycleLabel: string;
  readonly allPaused: boolean;
  readonly localFallback: boolean;
}

export interface ControlRequestState {
  readonly pending: Readonly<Record<string, boolean>>;
  readonly error?: string;
}

export interface SocietyControlResponse {
  readonly accepted: true;
  readonly revision?: string;
  readonly snapshot?: PublicSocietySnapshot;
}
