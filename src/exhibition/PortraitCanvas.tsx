import { useId, useMemo } from "react";
import {
  combineDrawingEffects,
  resolveDrawingEffect,
} from "./drawing";
import { generatePortrait } from "./generative";
import {
  combinePerceptionEffects,
  createDefaultTuning,
  resolvePerceptionEffect,
} from "./perception";
import { ProceduralPortrait } from "./portrait/ProceduralPortrait";
import { useArtworkLoadState } from "./portrait/useArtworkLoadState";
import type { PublicArtworkReference } from "./runtime/types";
import type {
  ExhibitionIndividual,
  PerceptionTuning,
  PortraitMode,
} from "./types";

interface PortraitCanvasProps {
  readonly individual: ExhibitionIndividual;
  readonly cycle: number;
  readonly mode?: PortraitMode;
  readonly observedBy?: ExhibitionIndividual;
  readonly perceptionTuning?: PerceptionTuning;
  readonly socialPerceptions?: readonly {
    readonly observer: ExhibitionIndividual;
    readonly tuning: PerceptionTuning;
  }[];
  readonly artwork?: PublicArtworkReference;
}

export function PortraitCanvas({
  individual,
  cycle,
  mode = "self",
  observedBy,
  perceptionTuning,
  socialPerceptions,
  artwork,
}: PortraitCanvasProps) {
  const instanceId = useId().replace(/:/g, "");
  const artworkLoad = useArtworkLoadState(artwork?.url);
  const visualLanguage = observedBy?.visualLanguage ?? individual.visualLanguage;
  const perceptionEffect = useMemo(() => {
    if (observedBy) {
      return resolvePerceptionEffect(
        observedBy.perceptionModel,
        perceptionTuning ?? createDefaultTuning(observedBy.perceptionModel),
      );
    }
    if (mode === "social" && socialPerceptions) {
      return combinePerceptionEffects(
        socialPerceptions.map(({ observer, tuning }) =>
          resolvePerceptionEffect(observer.perceptionModel, tuning),
        ),
      );
    }
    return undefined;
  }, [mode, observedBy, perceptionTuning, socialPerceptions]);
  const drawingEffect = useMemo(() => {
    if (observedBy) return resolveDrawingEffect(observedBy.artisticAbility);
    if (mode === "social" && socialPerceptions) {
      return (
        combineDrawingEffects(
          socialPerceptions.map(({ observer }) => resolveDrawingEffect(observer.artisticAbility)),
        ) ?? resolveDrawingEffect(individual.artisticAbility)
      );
    }
    return resolveDrawingEffect(individual.artisticAbility);
  }, [individual.artisticAbility, mode, observedBy, socialPerceptions]);
  const portrait = useMemo(
    () =>
      generatePortrait(
        visualLanguage,
        individual.physicalIdentity.bodyPlan,
        individual.id,
        cycle,
        mode,
        observedBy?.id,
        perceptionEffect,
        drawingEffect,
      ),
    [
      cycle,
      drawingEffect,
      individual.id,
      individual.physicalIdentity.bodyPlan,
      mode,
      observedBy?.id,
      perceptionEffect,
      visualLanguage,
    ],
  );
  const title =
    mode === "self"
      ? `${individual.name}'s embodied self-portrait, cycle ${cycle}`
      : mode === "social"
        ? `The physical form returned to ${individual.name} by peers, cycle ${cycle}`
        : `${individual.name}'s body as perceived by ${observedBy?.name ?? "a peer"}, cycle ${cycle}`;

  if (artwork && !artworkLoad.failed) {
    return (
      <img
        className={`portrait-art portrait-art--live portrait-art--${mode}`}
        src={artwork.url}
        width={artwork.width}
        height={artwork.height}
        alt={title}
        data-artwork-id={artwork.id}
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        onLoad={artworkLoad.markLoaded}
        onError={artworkLoad.markFailed}
      />
    );
  }

  return (
    <ProceduralPortrait
      portrait={portrait}
      individual={individual}
      observedBy={observedBy}
      cycle={cycle}
      mode={mode}
      visualLanguage={visualLanguage}
      palette={observedBy?.palette ?? individual.palette}
      title={title}
      filterId={`distortion-${instanceId}`}
      grainId={`grain-${instanceId}`}
      failedLiveArtwork={Boolean(artwork && artworkLoad.failed)}
    />
  );
}
