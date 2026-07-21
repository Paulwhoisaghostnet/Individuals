import { deriveCausalPublicLanguage } from "../cognition/causalLanguage";
import type { Portrait } from "../core/model";
import type { IndividualRuntimeStatus, RuntimeSummary } from "./societyRuntime";

export interface PublicArtworkReference {
  readonly id: string;
  readonly cycle: number;
  readonly format: "svg";
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly createdAt: string;
}

export interface PublicPortraitReferenceFactory {
  create(portrait: Portrait): PublicArtworkReference | undefined;
}

export interface PublicIndividualProjection {
  readonly id: string;
  readonly displayName: string;
  readonly cycle: number;
  readonly status: "idle" | "observing" | "drawing" | "reflecting" | "paused";
  readonly isPaused: boolean;
  readonly isRunningCycle: boolean;
  readonly updatedAt: string;
  readonly publicReflection?: string;
  readonly perceptionTuning: Readonly<Record<string, number>>;
  readonly embodiment: {
    readonly description: string;
    readonly similarity: number;
    readonly perceivedDifferences: readonly string[];
    readonly nextBodilyAdjustment?: string;
  };
  readonly portraits: {
    readonly self?: PublicArtworkReference;
    readonly social?: PublicArtworkReference;
    readonly peers: readonly {
      readonly artistId: string;
      readonly artwork: PublicArtworkReference;
    }[];
  };
}

export interface SocietyApiDto {
  readonly apiVersion: "1";
  readonly revision: string;
  readonly generatedAt: string;
  readonly runtime: {
    readonly mode: "live";
    readonly status: "running" | "paused" | "degraded";
    readonly startedAt: string;
  };
  readonly individuals: readonly PublicIndividualProjection[];
}

const safeText = (value: string, maxLength: number): string =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);

const projectPortraits = (
  status: IndividualRuntimeStatus,
  references: PublicPortraitReferenceFactory | undefined,
): PublicIndividualProjection["portraits"] => {
  const self =
    references && status.snapshot.state.currentSelfPortrait
      ? references.create(status.snapshot.state.currentSelfPortrait)
      : undefined;
  const socialPortrait =
    status.snapshot.state.latestSocialPortrait?.cycle === status.snapshot.state.cycle
      ? status.snapshot.state.latestSocialPortrait
      : undefined;
  const sourceIds = socialPortrait?.sourcePortraitIds ?? [];
  const cohortMatchesComposite = Boolean(
    socialPortrait &&
    sourceIds.length > 0 &&
    sourceIds.length === status.latestPeerPortraits.length &&
    sourceIds.every((id, index) => status.latestPeerPortraits[index]?.id === id),
  );
  const projectedPeers = references && cohortMatchesComposite
    ? status.latestPeerPortraits
        .slice()
        .sort((left, right) =>
          left.artistId.localeCompare(right.artistId) || right.cycle - left.cycle,
        )
        .flatMap((portrait) => {
          const artwork = references.create(portrait);
          return artwork ? [{ artistId: portrait.artistId, artwork }] : [];
        })
    : [];
  const completePeerBundle =
    projectedPeers.length === sourceIds.length &&
    projectedPeers.length <= Math.max(0, status.societySize - 1);
  const social =
    references && socialPortrait && cohortMatchesComposite && completePeerBundle
      ? references.create(socialPortrait)
      : undefined;
  // A composite and its inputs are one causal public artifact. Fail closed for
  // legacy snapshots or unsupported artwork instead of showing a partial set.
  const peers = social ? projectedPeers : [];
  return { self, social, peers };
};

/** Exact public allowlist. Private narrative, self narrative, trust, memory, and raw SVG cannot cross it. */
export const createPublicIndividualProjection = (
  status: IndividualRuntimeStatus,
  references?: PublicPortraitReferenceFactory,
): PublicIndividualProjection => {
  const physical = status.snapshot.state.selfConcept.physicalSelf;
  const currentSocialPortrait =
    status.snapshot.state.latestSocialPortrait?.cycle === status.snapshot.state.cycle
      ? status.snapshot.state.latestSocialPortrait
      : undefined;
  const publicLanguage = deriveCausalPublicLanguage({
    manifest: status.manifest,
    cycle: status.snapshot.state.cycle,
    evidence: currentSocialPortrait?.socialEvidence,
  });
  return {
    id: status.manifest.id,
    displayName: safeText(status.manifest.displayName, 120),
    cycle: status.snapshot.state.cycle,
    status: status.isPaused ? "paused" : status.currentPhase,
    isPaused: status.isPaused,
    isRunningCycle: status.isRunningCycle,
    updatedAt: status.snapshot.state.updatedAt,
    publicReflection: safeText(publicLanguage.publicFragment, 1_000),
    perceptionTuning: { ...status.perceptionTuning },
    embodiment: {
      description: safeText(physical.description, 1_000),
      similarity: Math.min(1, Math.max(0, physical.perceivedSimilarity)),
      perceivedDifferences: publicLanguage.perceivedDifferences.map((difference) =>
        safeText(difference, 300),
      ),
      nextBodilyAdjustment: safeText(publicLanguage.nextBodilyAdjustment, 500),
    },
    portraits: projectPortraits(status, references),
  };
};

export const createSocietyApiDto = (
  statuses: readonly IndividualRuntimeStatus[],
  summary: RuntimeSummary,
  generatedAt: string,
  references?: PublicPortraitReferenceFactory,
): SocietyApiDto => {
  if (!summary.startedAt) {
    throw new Error("Cannot publish a live society without a runtime instance start time.");
  }
  const allPaused = statuses.length > 0 && statuses.every((status) => status.isPaused);
  const degraded =
    summary.lifecycle !== "running" || statuses.some((status) => status.health.state !== "healthy");
  return {
    apiVersion: "1",
    revision: String(summary.revision),
    generatedAt,
    runtime: {
      mode: "live",
      status: degraded ? "degraded" : allPaused ? "paused" : "running",
      startedAt: summary.startedAt,
    },
    individuals: statuses.map((status) => createPublicIndividualProjection(status, references)),
  };
};
