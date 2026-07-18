import { useMemo } from "react";
import { generatePortrait } from "./generative";
import type { ExhibitionIndividual, PortraitMode } from "./types";

interface PortraitCanvasProps {
  readonly individual: ExhibitionIndividual;
  readonly cycle: number;
  readonly mode?: PortraitMode;
  readonly observedBy?: ExhibitionIndividual;
  readonly compact?: boolean;
}

export function PortraitCanvas({
  individual,
  cycle,
  mode = "self",
  observedBy,
  compact = false,
}: PortraitCanvasProps) {
  const visualLanguage = observedBy?.visualLanguage ?? individual.visualLanguage;
  const portrait = useMemo(
    () =>
      generatePortrait(
        visualLanguage,
        individual.id,
        cycle,
        mode,
        observedBy?.id,
      ),
    [cycle, individual.id, mode, observedBy?.id, visualLanguage],
  );
  const palette = observedBy?.palette ?? individual.palette;
  const filterId = `distortion-${portrait.seed}`;
  const grainId = `grain-${portrait.seed}`;
  const title =
    mode === "self"
      ? `${individual.name}'s self-portrait, cycle ${cycle}`
      : mode === "social"
        ? `The social portrait returned to ${individual.name}, cycle ${cycle}`
        : `${individual.name} as perceived by ${observedBy?.name ?? "a peer"}, cycle ${cycle}`;

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
        A generative portrait made from {visualLanguage} forms in {palette[1]} and {palette[2]}.
      </desc>
      <defs>
        <radialGradient id={grainId} cx="50%" cy="44%" r="65%">
          <stop offset="0%" stopColor={palette[3]} stopOpacity="0.42" />
          <stop offset="58%" stopColor={palette[0]} stopOpacity="0.18" />
          <stop offset="100%" stopColor="#050505" stopOpacity="0.8" />
        </radialGradient>
        <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={visualLanguage === "fragment" ? "0.012 0.08" : "0.006 0.018"}
            numOctaves="2"
            seed={portrait.seed % 97}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={mode === "social" ? 21 : 9}
            xChannelSelector="R"
            yChannelSelector="B"
          />
        </filter>
      </defs>

      <rect width="800" height="1000" fill={palette[0]} />
      <rect width="800" height="1000" fill={`url(#${grainId})`} />
      <circle
        className="portrait-art__halo"
        cx={portrait.focusX}
        cy={portrait.focusY}
        r={compact ? 130 : 190}
        fill="none"
        stroke={palette[2]}
        strokeOpacity={mode === "social" ? 0.34 : 0.16}
        strokeWidth="1"
      />

      <g filter={`url(#${filterId})`}>
        {portrait.fragments.map((fragment, index) => (
          <rect
            className="portrait-art__fragment"
            key={fragment.id}
            x={fragment.x}
            y={fragment.y}
            width={fragment.width}
            height={fragment.height}
            rx={visualLanguage === "fragment" ? 0 : fragment.height / 2}
            fill={index % 5 === 0 ? palette[2] : palette[1]}
            opacity={fragment.opacity}
            transform={`rotate(${fragment.rotation} ${fragment.x + fragment.width / 2} ${fragment.y + fragment.height / 2})`}
            style={{ animationDelay: `${index * -0.37}s` }}
          />
        ))}

        {visualLanguage !== "fragment" &&
          portrait.marks.map((mark, index) => (
            <path
              className="portrait-art__mark"
              key={mark.id}
              d={mark.path}
              fill="none"
              stroke={index % 6 === 0 ? palette[2] : palette[1]}
              strokeWidth={mark.width}
              strokeOpacity={mark.opacity}
              vectorEffect="non-scaling-stroke"
              style={{ animationDelay: `${index * -0.49}s` }}
            />
          ))}
      </g>

      {mode === "social" && (
        <g className="portrait-art__registration" stroke={palette[1]} strokeOpacity="0.22">
          <line x1="400" y1="54" x2="400" y2="946" />
          <line x1="54" y1="500" x2="746" y2="500" />
          <circle cx="400" cy="500" r="318" fill="none" />
        </g>
      )}

      <g className="portrait-art__index" fill={palette[1]} fillOpacity="0.58">
        <text x="54" y="78">{individual.number}</text>
        <text x="746" y="78" textAnchor="end">
          C.{String(cycle).padStart(3, "0")}
        </text>
      </g>
    </svg>
  );
}
