import type { BodyPlan, PortraitMode, VisualLanguage } from "./types";
import type { PerceptionEffect } from "./perception";
import type { DrawingEffect } from "./drawing";

const mulberry32 = (seed: number) => {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashSeed = (...parts: readonly (string | number)[]): number => {
  const value = parts.join("|");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

interface BodyProfile {
  readonly headRx: number;
  readonly headRy: number;
  readonly shoulderWidth: number;
  readonly hipWidth: number;
  readonly torsoBottom: number;
  readonly limbWidth: number;
  readonly handRadius: number;
  readonly fingerCount: number;
}

const profiles: Record<BodyPlan, BodyProfile> = {
  willow: {
    headRx: 59,
    headRy: 75,
    shoulderWidth: 158,
    hipWidth: 104,
    torsoBottom: 545,
    limbWidth: 27,
    handRadius: 17,
    fingerCount: 4,
  },
  compact: {
    headRx: 69,
    headRy: 67,
    shoulderWidth: 208,
    hipWidth: 166,
    torsoBottom: 565,
    limbWidth: 38,
    handRadius: 20,
    fingerCount: 5,
  },
  longline: {
    headRx: 50,
    headRy: 82,
    shoulderWidth: 146,
    hipWidth: 92,
    torsoBottom: 550,
    limbWidth: 23,
    handRadius: 16,
    fingerCount: 6,
  },
};

export interface BodyPoint {
  readonly x: number;
  readonly y: number;
}

export interface GeneratedBody {
  readonly centerX: number;
  readonly head: BodyPoint & { readonly rx: number; readonly ry: number; readonly rotation: number };
  readonly neckPath: string;
  readonly torsoPath: string;
  readonly spinePath: string;
  readonly leftArmPath: string;
  readonly rightArmPath: string;
  readonly leftLegPath: string;
  readonly rightLegPath: string;
  readonly leftHand: BodyPoint;
  readonly rightHand: BodyPoint;
  readonly leftFoot: BodyPoint;
  readonly rightFoot: BodyPoint;
  readonly eyeY: number;
  readonly eyeSpacing: number;
  readonly nosePath: string;
  readonly mouthPath: string;
  readonly limbWidth: number;
  readonly handRadius: number;
  readonly fingerCount: number;
}

export interface GeneratedFragment {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly opacity: number;
}

export interface GeneratedPortrait {
  readonly seed: number;
  readonly body: GeneratedBody;
  readonly idealBody: GeneratedBody;
  readonly fragments: readonly GeneratedFragment[];
  readonly echoOffsets: readonly number[];
  readonly perceptionEffect?: PerceptionEffect;
  readonly drawingEffect?: DrawingEffect;
}

const createBody = (
  plan: BodyPlan,
  distortion: number,
  random: () => number,
): GeneratedBody => {
  const profile = profiles[plan];
  const centerX = 400 + (random() - 0.5) * distortion * 0.8;
  const lean = (random() - 0.5) * distortion;
  const headTilt = (random() - 0.5) * distortion * 0.55;
  const headY = plan === "compact" ? 168 : 160;
  const shoulderY = plan === "compact" ? 302 : 286;
  const leftShoulderY = shoulderY - lean * 0.45;
  const rightShoulderY = shoulderY + lean * 0.45;
  const leftShoulderX = centerX - profile.shoulderWidth / 2;
  const rightShoulderX = centerX + profile.shoulderWidth / 2;
  const leftHipX = centerX - profile.hipWidth / 2;
  const rightHipX = centerX + profile.hipWidth / 2;
  const waistY = 435;
  const waistWidth = plan === "compact" ? profile.hipWidth * 0.84 : profile.hipWidth * 0.72;
  const torsoPath = [
    `M ${leftShoulderX} ${leftShoulderY}`,
    `C ${leftShoulderX + 15} 350 ${centerX - waistWidth / 2} 390 ${centerX - waistWidth / 2} ${waistY}`,
    `C ${centerX - waistWidth / 2} 485 ${leftHipX} 520 ${leftHipX} ${profile.torsoBottom}`,
    `L ${rightHipX} ${profile.torsoBottom}`,
    `C ${rightHipX} 520 ${centerX + waistWidth / 2} 485 ${centerX + waistWidth / 2} ${waistY}`,
    `C ${centerX + waistWidth / 2} 390 ${rightShoulderX - 15} 350 ${rightShoulderX} ${rightShoulderY}`,
    `Q ${centerX} ${shoulderY + 30} ${leftShoulderX} ${leftShoulderY} Z`,
  ].join(" ");

  const armOutset = plan === "willow" ? 78 : plan === "compact" ? 48 : 62;
  const handY = plan === "longline" ? 665 : plan === "compact" ? 615 : 635;
  const leftHand = {
    x: leftShoulderX - armOutset + lean * 0.4,
    y: handY + (random() - 0.5) * distortion,
  };
  const rightHand = {
    x: rightShoulderX + armOutset + lean * 0.4,
    y: handY + (random() - 0.5) * distortion,
  };
  const leftArmPath = `M ${leftShoulderX + 5} ${leftShoulderY + 16} C ${leftShoulderX - 42} 375 ${leftHand.x + 28} 500 ${leftHand.x} ${leftHand.y}`;
  const rightArmPath = `M ${rightShoulderX - 5} ${rightShoulderY + 16} C ${rightShoulderX + 42} 375 ${rightHand.x - 28} 500 ${rightHand.x} ${rightHand.y}`;

  const stance = plan === "compact" ? 84 : plan === "longline" ? 56 : 68;
  const leftFoot = { x: centerX - stance - lean * 0.25, y: 924 };
  const rightFoot = { x: centerX + stance - lean * 0.25, y: 924 };
  const leftLegPath = `M ${leftHipX + 13} ${profile.torsoBottom - 2} C ${leftHipX - 5} 675 ${leftFoot.x + 10} 800 ${leftFoot.x} ${leftFoot.y}`;
  const rightLegPath = `M ${rightHipX - 13} ${profile.torsoBottom - 2} C ${rightHipX + 5} 675 ${rightFoot.x - 10} 800 ${rightFoot.x} ${rightFoot.y}`;
  const faceCenterX = centerX + headTilt * 0.35;
  const eyeY = headY - 8 + Math.abs(headTilt) * 0.05;

  return {
    centerX,
    head: {
      x: centerX + headTilt * 0.45,
      y: headY,
      rx: profile.headRx,
      ry: profile.headRy,
      rotation: headTilt,
    },
    neckPath: `M ${centerX - 23} ${headY + profile.headRy - 8} L ${centerX - 27} ${shoulderY + 8} M ${centerX + 23} ${headY + profile.headRy - 8} L ${centerX + 27} ${shoulderY + 8}`,
    torsoPath,
    spinePath: `M ${centerX + headTilt * 0.2} ${headY - profile.headRy + 5} C ${centerX - lean * 0.2} 330 ${centerX + lean * 0.65} 435 ${centerX - lean * 0.25} ${profile.torsoBottom}`,
    leftArmPath,
    rightArmPath,
    leftLegPath,
    rightLegPath,
    leftHand,
    rightHand,
    leftFoot,
    rightFoot,
    eyeY,
    eyeSpacing: profile.headRx * 0.42,
    nosePath: `M ${faceCenterX} ${eyeY + 8} Q ${faceCenterX - 4} ${eyeY + 28} ${faceCenterX + 3} ${eyeY + 34}`,
    mouthPath: `M ${faceCenterX - profile.headRx * 0.24} ${eyeY + 51} Q ${faceCenterX} ${eyeY + 55 + lean * 0.08} ${faceCenterX + profile.headRx * 0.24} ${eyeY + 50}`,
    limbWidth: profile.limbWidth,
    handRadius: profile.handRadius,
    fingerCount: profile.fingerCount,
  };
};

export const generatePortrait = (
  language: VisualLanguage,
  bodyPlan: BodyPlan,
  identityId: string,
  cycle: number,
  mode: PortraitMode,
  observerId = "self",
  perceptionEffect?: PerceptionEffect,
  drawingEffect?: DrawingEffect,
): GeneratedPortrait => {
  const effectSignature = perceptionEffect
    ? Object.values(perceptionEffect).join(":")
    : "unfiltered";
  const drawingSignature = drawingEffect
    ? `${drawingEffect.styleName}:${drawingEffect.geometryError}:${drawingEffect.lineInstability}`
    : "unscoped";
  const seed = hashSeed(
    language,
    bodyPlan,
    identityId,
    cycle,
    mode,
    observerId,
    effectSignature,
    drawingSignature,
  );
  const random = mulberry32(seed);
  const perceivedDistortion = perceptionEffect
    ? 7 + perceptionEffect.geometryWarp * 34
    : mode === "social"
      ? 5
      : mode === "peer"
        ? language === "fragment"
          ? 24
          : 15
        : 11;
  const distortion =
    perceivedDistortion +
    (drawingEffect?.geometryError ?? 0) * 34 +
    (drawingEffect?.lineInstability ?? 0) * 9;
  const body = createBody(bodyPlan, distortion, random);
  const idealBody = createBody(bodyPlan, 0, () => 0.5);
  const fragmentCount = perceptionEffect
    ? perceptionEffect.fragmentCount
    : language === "fragment"
      ? 17
      : 5;
  const fragmentScale = perceptionEffect?.fragmentScale ?? (language === "fragment" ? 0.62 : 0.2);
  const fragments = Array.from({ length: fragmentCount }, (_, index) => ({
    id: `${seed}-fragment-${index}`,
    x: body.centerX - 125 + random() * 250,
    y: 270 + random() * 330,
    width: 20 + random() * (34 + fragmentScale * 132),
    height: 4 + random() * (10 + fragmentScale * 52),
    rotation: -8 + random() * 16,
    opacity: 0.12 + random() * 0.46,
  }));

  return {
    seed,
    body,
    idealBody,
    fragments,
    echoOffsets: perceptionEffect
      ? Array.from(
          { length: perceptionEffect.echoCount },
          (_, index) =>
            (index - (perceptionEffect.echoCount - 1) / 2) * perceptionEffect.echoSpacing,
        ).filter((offset) => Math.abs(offset) > 0.01)
      : language === "thread"
        ? [-18, -10, 9, 17]
        : language === "contour"
          ? [-8, 8]
          : [-3, 4],
    perceptionEffect,
    drawingEffect,
  };
};
