import { useMemo } from "react";
import { generatePortrait, type GeneratedBody } from "./generative";
import type { ExhibitionIndividual, PortraitMode, VisualLanguage } from "./types";

interface PortraitCanvasProps {
  readonly individual: ExhibitionIndividual;
  readonly cycle: number;
  readonly mode?: PortraitMode;
  readonly observedBy?: ExhibitionIndividual;
  readonly compact?: boolean;
}

interface BodyFigureProps {
  readonly body: GeneratedBody;
  readonly palette: readonly [string, string, string, string];
  readonly language: VisualLanguage;
  readonly ghost?: boolean;
  readonly ideal?: boolean;
  readonly transform?: string;
}

const fingers = (body: GeneratedBody, side: "left" | "right") => {
  const hand = side === "left" ? body.leftHand : body.rightHand;
  const direction = side === "left" ? -1 : 1;
  return Array.from({ length: body.fingerCount }, (_, index) => {
    const spread = body.fingerCount === 1 ? 0 : index / (body.fingerCount - 1) - 0.5;
    const length = body.handRadius * (1.05 - Math.abs(spread) * 0.22);
    return {
      x1: hand.x + direction * body.handRadius * 0.55,
      y1: hand.y + spread * body.handRadius * 0.65,
      x2: hand.x + direction * (body.handRadius + length),
      y2: hand.y + spread * body.handRadius * 1.5,
    };
  });
};

function BodyFigure({
  body,
  palette,
  language,
  ghost = false,
  ideal = false,
  transform,
}: BodyFigureProps) {
  const stroke = ideal ? palette[2] : palette[1];
  const limbFill = ideal ? "none" : ghost ? palette[1] : palette[3];
  const opacity = ideal ? 0.48 : ghost ? 0.13 : 0.9;
  const fill = ideal ? "none" : palette[3];

  return (
    <g
      className={`body-figure ${ghost ? "body-figure--ghost" : ""} ${ideal ? "body-figure--ideal" : ""}`}
      transform={transform}
      opacity={opacity}
      fill="none"
      stroke={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={body.leftLegPath} stroke={limbFill} strokeWidth={body.limbWidth} />
      <path d={body.rightLegPath} stroke={limbFill} strokeWidth={body.limbWidth} />
      <path
        d={`M ${body.leftFoot.x - 18} ${body.leftFoot.y} L ${body.leftFoot.x + 28} ${body.leftFoot.y}`}
        stroke={limbFill}
        strokeWidth={Math.max(8, body.limbWidth * 0.6)}
      />
      <path
        d={`M ${body.rightFoot.x - 28} ${body.rightFoot.y} L ${body.rightFoot.x + 18} ${body.rightFoot.y}`}
        stroke={limbFill}
        strokeWidth={Math.max(8, body.limbWidth * 0.6)}
      />
      <path d={body.leftArmPath} stroke={limbFill} strokeWidth={body.limbWidth} />
      <path d={body.rightArmPath} stroke={limbFill} strokeWidth={body.limbWidth} />
      <path d={body.torsoPath} fill={fill} fillOpacity={ideal ? 0 : 0.72} strokeWidth={ideal ? 2 : 2.4} />
      <path d={body.neckPath} strokeWidth={ideal ? 2 : 5} />
      <ellipse
        cx={body.head.x}
        cy={body.head.y}
        rx={body.head.rx}
        ry={body.head.ry}
        transform={`rotate(${body.head.rotation} ${body.head.x} ${body.head.y})`}
        fill={fill}
        fillOpacity={ideal ? 0 : 0.86}
        strokeWidth={ideal ? 2 : 2.4}
      />

      {!ghost && !ideal && (
        <>
          <g stroke={palette[1]} strokeWidth="1.4" strokeOpacity="0.64">
            <path d={body.leftLegPath} />
            <path d={body.rightLegPath} />
            <path d={body.leftArmPath} />
            <path d={body.rightArmPath} />
          </g>
          <circle
            cx={body.head.x - body.eyeSpacing}
            cy={body.eyeY}
            r={language === "fragment" ? 3.5 : 4.5}
            fill={palette[1]}
            stroke="none"
          />
          <circle
            cx={body.head.x + body.eyeSpacing}
            cy={body.eyeY}
            r={language === "fragment" ? 3.5 : 4.5}
            fill={palette[1]}
            stroke="none"
          />
          <path d={body.nosePath} strokeWidth="1.4" strokeOpacity="0.65" />
          <path d={body.mouthPath} strokeWidth="1.4" strokeOpacity="0.72" />
          <path
            d={body.spinePath}
            stroke={language === "thread" ? palette[2] : palette[1]}
            strokeWidth={language === "thread" ? 2.5 : 1}
            strokeOpacity={language === "thread" ? 0.85 : 0.24}
          />
          <circle cx={body.leftHand.x} cy={body.leftHand.y} r={body.handRadius} fill={palette[3]} />
          <circle cx={body.rightHand.x} cy={body.rightHand.y} r={body.handRadius} fill={palette[3]} />
          {[...fingers(body, "left"), ...fingers(body, "right")].map((finger, index) => (
            <line key={index} {...finger} strokeWidth="2" strokeOpacity="0.8" />
          ))}
        </>
      )}
    </g>
  );
}

export function PortraitCanvas({
  individual,
  cycle,
  mode = "self",
  observedBy,
}: PortraitCanvasProps) {
  const visualLanguage = observedBy?.visualLanguage ?? individual.visualLanguage;
  const portrait = useMemo(
    () =>
      generatePortrait(
        visualLanguage,
        individual.physicalIdentity.bodyPlan,
        individual.id,
        cycle,
        mode,
        observedBy?.id,
      ),
    [cycle, individual.id, individual.physicalIdentity.bodyPlan, mode, observedBy?.id, visualLanguage],
  );
  const palette = observedBy?.palette ?? individual.palette;
  const filterId = `distortion-${portrait.seed}`;
  const grainId = `grain-${portrait.seed}`;
  const title =
    mode === "self"
      ? `${individual.name}'s embodied self-portrait, cycle ${cycle}`
      : mode === "social"
        ? `The physical form returned to ${individual.name} by peers, cycle ${cycle}`
        : `${individual.name}'s body as perceived by ${observedBy?.name ?? "a peer"}, cycle ${cycle}`;

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
        {individual.physicalIdentity.current} The ideal physical form is {individual.physicalIdentity.ideal}
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
            scale={mode === "peer" ? 10 : mode === "social" ? 4 : 6}
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
          />
        ))}

        <BodyFigure body={portrait.body} palette={palette} language={visualLanguage} />

        {portrait.fragments.map((fragment, index) => (
          <rect
            className="portrait-art__fragment"
            key={fragment.id}
            x={fragment.x}
            y={fragment.y}
            width={fragment.width}
            height={fragment.height}
            fill={index % 4 === 0 ? palette[2] : palette[1]}
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
    </svg>
  );
}
