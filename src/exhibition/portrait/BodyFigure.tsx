import type { DrawingEffect } from "../drawing";
import type { GeneratedBody } from "../generative";
import type { PerceptionEffect } from "../perception";
import type { VisualLanguage } from "../types";

interface BodyFigureProps {
  readonly body: GeneratedBody;
  readonly palette: readonly [string, string, string, string];
  readonly language: VisualLanguage;
  readonly ghost?: boolean;
  readonly ideal?: boolean;
  readonly transform?: string;
  readonly perceptionEffect?: PerceptionEffect;
  readonly drawingEffect?: DrawingEffect;
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

const primitiveLabel = (language: VisualLanguage): string => {
  if (language === "fragment") return "rectangle straight-stroke overlaid-plane";
  if (language === "thread") return "long-curve repeated-gesture thread-line";
  return "continuous-contour nested-line sparse-hatch";
};

export function BodyFigure({
  body,
  palette,
  language,
  ghost = false,
  ideal = false,
  transform,
  perceptionEffect,
  drawingEffect,
}: BodyFigureProps) {
  const markLanguage = ideal ? "ideal-register" : language;
  const stroke = ideal ? palette[2] : palette[1];
  const limbStroke = ideal ? "none" : ghost ? palette[1] : palette[3];
  const opacity = ideal
    ? 0.48
    : ghost
      ? 0.13
      : 0.38 + (perceptionEffect?.interiorVisibility ?? 0.95) * 0.57;
  const fill = ideal ? "none" : palette[3];
  const outlineWidth = ideal
    ? 2
    : 1.4 +
      (perceptionEffect?.edgeGain ?? 0.5) * 2.2 +
      (drawingEffect?.lineInstability ?? 0) * 1.2;
  const detailOpacity = drawingEffect?.detailCapacity ?? 0.7;
  const planar = !ideal && language === "fragment";
  const threaded = !ideal && language === "thread";
  const interiorOpacity = ideal
    ? 0
    : (perceptionEffect?.interiorVisibility ?? 0.72) * (threaded ? 0.32 : 1);

  return (
    <g
      className={`body-figure ${ghost ? "body-figure--ghost" : ""} ${ideal ? "body-figure--ideal" : ""}`}
      data-mark-language={markLanguage}
      data-mark-primitives={ideal ? "registration-line" : primitiveLabel(language)}
      data-artistic-scope={drawingEffect?.styleName}
      transform={transform}
      opacity={opacity}
      fill="none"
      stroke={stroke}
      strokeLinecap={planar ? "square" : "round"}
      strokeLinejoin={planar ? "bevel" : "round"}
    >
      <g data-anatomy="limbs">
        <path d={body.leftLegPath} stroke={limbStroke} strokeWidth={body.limbWidth} />
        <path d={body.rightLegPath} stroke={limbStroke} strokeWidth={body.limbWidth} />
        <path
          d={`M ${body.leftFoot.x - 18} ${body.leftFoot.y} L ${body.leftFoot.x + 28} ${body.leftFoot.y}`}
          stroke={limbStroke}
          strokeWidth={Math.max(8, body.limbWidth * 0.6)}
        />
        <path
          d={`M ${body.rightFoot.x - 28} ${body.rightFoot.y} L ${body.rightFoot.x + 18} ${body.rightFoot.y}`}
          stroke={limbStroke}
          strokeWidth={Math.max(8, body.limbWidth * 0.6)}
        />
        <path d={body.leftArmPath} stroke={limbStroke} strokeWidth={body.limbWidth} />
        <path d={body.rightArmPath} stroke={limbStroke} strokeWidth={body.limbWidth} />
      </g>

      <path
        data-anatomy="torso"
        d={body.torsoPath}
        fill={fill}
        fillOpacity={interiorOpacity}
        strokeWidth={outlineWidth}
      />
      <path d={body.neckPath} strokeWidth={ideal ? 2 : planar ? 8 : 5} />
      {planar ? (
        <rect
          data-anatomy="head"
          x={body.head.x - body.head.rx}
          y={body.head.y - body.head.ry}
          width={body.head.rx * 2}
          height={body.head.ry * 2}
          transform={`rotate(${body.head.rotation} ${body.head.x} ${body.head.y})`}
          fill={fill}
          fillOpacity="0.86"
          strokeWidth={outlineWidth}
        />
      ) : (
        <ellipse
          data-anatomy="head"
          cx={body.head.x}
          cy={body.head.y}
          rx={body.head.rx}
          ry={body.head.ry}
          transform={`rotate(${body.head.rotation} ${body.head.x} ${body.head.y})`}
          fill={fill}
          fillOpacity={ideal ? 0 : threaded ? 0.28 : 0.86}
          strokeWidth={outlineWidth}
        />
      )}

      {planar && !ghost && (
        <g data-practice-effect="assembled-planes" fill={palette[2]} fillOpacity="0.2" stroke="none">
          <rect x={body.centerX - 92} y="330" width="82" height="74" />
          <rect x={body.centerX + 4} y="345" width="104" height="58" />
          <rect x={body.centerX - 76} y="430" width="145" height="66" />
          <rect x={body.leftHand.x - 14} y={body.leftHand.y - 14} width="28" height="28" />
          <rect x={body.rightHand.x - 14} y={body.rightHand.y - 14} width="28" height="28" />
        </g>
      )}

      {!ghost && !ideal && (
        <g data-anatomy="recognition-features">
          <g stroke={palette[1]} strokeWidth={threaded ? 1 : 1.4} strokeOpacity={0.3 + detailOpacity * 0.48}>
            <path d={body.leftLegPath} />
            <path d={body.rightLegPath} />
            <path d={body.leftArmPath} />
            <path d={body.rightArmPath} />
          </g>
          {planar ? (
            <>
              <rect x={body.head.x - body.eyeSpacing - 3} y={body.eyeY - 3} width="6" height="6" fill={palette[1]} stroke="none" opacity={detailOpacity} />
              <rect x={body.head.x + body.eyeSpacing - 3} y={body.eyeY - 3} width="6" height="6" fill={palette[1]} stroke="none" opacity={detailOpacity} />
            </>
          ) : (
            <>
              <circle cx={body.head.x - body.eyeSpacing} cy={body.eyeY} r="4.5" fill={palette[1]} stroke="none" opacity={detailOpacity} />
              <circle cx={body.head.x + body.eyeSpacing} cy={body.eyeY} r="4.5" fill={palette[1]} stroke="none" opacity={detailOpacity} />
            </>
          )}
          <path d={body.nosePath} strokeWidth="1.4" strokeOpacity={detailOpacity * 0.8} />
          <path d={body.mouthPath} strokeWidth="1.4" strokeOpacity={detailOpacity * 0.9} />
          <path
            d={body.spinePath}
            stroke={threaded ? palette[2] : palette[1]}
            strokeWidth={threaded ? 2.5 : 1}
            strokeOpacity={threaded ? 0.85 : 0.24}
          />
          {planar ? (
            <>
              <rect x={body.leftHand.x - body.handRadius} y={body.leftHand.y - body.handRadius} width={body.handRadius * 2} height={body.handRadius * 2} fill={palette[3]} />
              <rect x={body.rightHand.x - body.handRadius} y={body.rightHand.y - body.handRadius} width={body.handRadius * 2} height={body.handRadius * 2} fill={palette[3]} />
            </>
          ) : (
            <>
              <circle cx={body.leftHand.x} cy={body.leftHand.y} r={body.handRadius} fill={palette[3]} />
              <circle cx={body.rightHand.x} cy={body.rightHand.y} r={body.handRadius} fill={palette[3]} />
            </>
          )}
          {[...fingers(body, "left"), ...fingers(body, "right")].map((finger, index) => (
            <line key={index} {...finger} strokeWidth={threaded ? 1.4 : 2} strokeOpacity="0.8" />
          ))}
        </g>
      )}
    </g>
  );
}
