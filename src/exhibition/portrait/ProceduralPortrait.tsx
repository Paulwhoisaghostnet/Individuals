import type { GeneratedPortrait } from "../generative";
import type {
  ExhibitionIndividual,
  PortraitMode,
  VisualLanguage,
} from "../types";
import { BodyFigure } from "./BodyFigure";

interface ProceduralPortraitProps {
  readonly portrait: GeneratedPortrait;
  readonly individual: ExhibitionIndividual;
  readonly observedBy?: ExhibitionIndividual;
  readonly cycle: number;
  readonly mode: PortraitMode;
  readonly visualLanguage: VisualLanguage;
  readonly palette: readonly [string, string, string, string];
  readonly title: string;
  readonly filterId: string;
  readonly grainId: string;
  readonly failedLiveArtwork: boolean;
}

export function ProceduralPortrait({
  portrait,
  individual,
  observedBy,
  cycle,
  mode,
  visualLanguage,
  palette,
  title,
  filterId,
  grainId,
  failedLiveArtwork,
}: ProceduralPortraitProps) {
  const perceptionEffect = portrait.perceptionEffect;
  const drawingEffect = portrait.drawingEffect;

  return (
    <svg
      className={`portrait-art portrait-art--${mode} portrait-art--${visualLanguage}`}
      viewBox="0 0 800 1000"
      role="img"
      aria-labelledby={`${filterId}-title ${filterId}-description`}
      preserveAspectRatio="xMidYMid slice"
    >
      <title id={`${filterId}-title`}>{title}</title>
      <desc id={`${filterId}-description`}>
        {failedLiveArtwork
          ? "Live artwork is unavailable, so this canvas contains an explicitly local procedural study. "
          : ""}
        {individual.physicalIdentity.current} The ideal physical form is {individual.physicalIdentity.ideal}
        {observedBy
          ? ` ${observedBy.name} sees it through ${observedBy.perceptionModel.name}, then draws it through ${observedBy.artisticAbility.name}.`
          : ""}
      </desc>
      <defs>
        <radialGradient id={grainId} cx="50%" cy="43%" r="68%">
          <stop offset="0%" stopColor={palette[3]} stopOpacity="0.3" />
          <stop offset="64%" stopColor={palette[0]} stopOpacity="0.12" />
          <stop offset="100%" stopColor="#040404" stopOpacity="0.82" />
        </radialGradient>
        <filter id={filterId} x="-15%" y="-10%" width="130%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={visualLanguage === "fragment" ? "0.01 0.055" : "0.004 0.014"}
            numOctaves="2"
            seed={portrait.seed % 97}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={
              perceptionEffect
                ? 3 + perceptionEffect.geometryWarp * 18 + (drawingEffect?.lineInstability ?? 0) * 8
                : mode === "peer"
                  ? 10 + (drawingEffect?.lineInstability ?? 0) * 8
                  : mode === "social"
                    ? 4 + (drawingEffect?.lineInstability ?? 0) * 8
                    : 6 + (drawingEffect?.lineInstability ?? 0) * 8
            }
            xChannelSelector="R"
            yChannelSelector="B"
          />
        </filter>
      </defs>

      <rect width="800" height="1000" fill={palette[0]} />
      <rect width="800" height="1000" fill={`url(#${grainId})`} />
      <ellipse cx="400" cy="940" rx="210" ry="22" fill="#000" opacity="0.28" />

      {mode === "social" && (
        <BodyFigure
          body={portrait.idealBody}
          palette={palette}
          language={visualLanguage}
          ideal
          perceptionEffect={perceptionEffect}
          drawingEffect={drawingEffect}
        />
      )}

      <g filter={`url(#${filterId})`}>
        {portrait.echoOffsets.map((offset) => (
          <BodyFigure
            key={offset}
            body={portrait.body}
            palette={palette}
            language={visualLanguage}
            ghost
            transform={`translate(${offset} ${visualLanguage === "thread" ? offset * 0.18 : 0})`}
            perceptionEffect={perceptionEffect}
            drawingEffect={drawingEffect}
          />
        ))}

        <BodyFigure
          body={portrait.body}
          palette={palette}
          language={visualLanguage}
          perceptionEffect={perceptionEffect}
          drawingEffect={drawingEffect}
        />

        {portrait.fragments.map((fragment, index) => (
          <rect
            className="portrait-art__fragment"
            key={fragment.id}
            x={fragment.x}
            y={fragment.y}
            width={fragment.width}
            height={fragment.height}
            fill={
              perceptionEffect?.modelId.includes("morrow") && index % 3 === 0
                ? palette[0]
                : index % 4 === 0
                  ? palette[2]
                  : palette[1]
            }
            opacity={fragment.opacity}
            transform={`rotate(${fragment.rotation} ${fragment.x + fragment.width / 2} ${fragment.y + fragment.height / 2})`}
            style={{ animationDelay: `${index * -0.37}s` }}
          />
        ))}
      </g>

      {mode === "social" && (
        <g className="portrait-art__registration" stroke={palette[2]} strokeOpacity="0.28">
          <line x1="400" y1="55" x2="400" y2="945" />
          <line x1="340" y1="160" x2="460" y2="160" />
          <line x1="320" y1="550" x2="480" y2="550" />
        </g>
      )}

      <g className="portrait-art__index" fill={palette[1]} fillOpacity="0.58">
        <text x="54" y="78">{individual.number}</text>
        <text x="746" y="78" textAnchor="end">
          C.{String(cycle).padStart(3, "0")}
        </text>
      </g>

      {failedLiveArtwork && (
        <g className="portrait-art__fallback-label" aria-label="Live artwork unavailable; showing local study">
          <rect x="44" y="886" width="330" height="36" rx="2" fill={palette[0]} fillOpacity="0.82" />
          <text x="58" y="909" fill={palette[1]}>
            LIVE ARTWORK UNAVAILABLE · LOCAL STUDY
          </text>
        </g>
      )}
    </svg>
  );
}
