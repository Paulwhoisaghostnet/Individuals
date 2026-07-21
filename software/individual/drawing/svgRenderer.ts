import type { ArtworkDescriptor } from "../core/model";

export const escapeXml = (value: string): string =>
  value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character] ?? "";
  });

const n = (value: number): string => (Number.isFinite(value) ? value.toFixed(2) : "0.00");

interface FigureGeometry {
  readonly headCx: number;
  readonly headCy: number;
  readonly headRx: number;
  readonly headRy: number;
  readonly shoulderY: number;
  readonly leftShoulderX: number;
  readonly rightShoulderX: number;
  readonly leftHipX: number;
  readonly rightHipX: number;
  readonly hipY: number;
  readonly leftHandX: number;
  readonly rightHandX: number;
  readonly handY: number;
  readonly leftFootX: number;
  readonly rightFootX: number;
  readonly footY: number;
  readonly spineBottomX: number;
}

const geometryFor = (descriptor: ArtworkDescriptor): FigureGeometry => {
  const figure = descriptor.figure;
  const center = 400 + (figure.centerX - 0.5) * 260;
  const lean = figure.postureLean * 90;
  const shoulderY = 300 + (1 - figure.verticality) * 45;
  const shoulderHalf = 75 + figure.shoulderWidth * 105;
  const hipHalf = 48 + figure.torsoWidth * 72;
  const hipY = shoulderY + 205 + figure.torsoLength * 115;
  const handReach = 70 + figure.openness * 105;
  const handY = shoulderY + 155 + figure.armLength * 145;
  const legLength = 205 + figure.legLength * 165;
  const asymmetry = (1 - figure.symmetry) * 55;

  const faceShape = descriptor.anatomy?.faceShape;
  const faceAspectShift = faceShape === "square" ? 8 : faceShape === "elongated" ? -7 : 0;
  return {
    headCx: center + lean * 0.42,
    headCy: 176,
    headRx: 48 + figure.headAspect * 18 + faceAspectShift,
    headRy: 96 - figure.headAspect * 32 - faceAspectShift,
    shoulderY,
    leftShoulderX: center - shoulderHalf,
    rightShoulderX: center + shoulderHalf,
    leftHipX: center + lean - hipHalf,
    rightHipX: center + lean + hipHalf,
    hipY,
    leftHandX: center - shoulderHalf - handReach,
    rightHandX: center + shoulderHalf + handReach,
    handY,
    leftFootX: center + lean - hipHalf * 0.65 - asymmetry * 0.15,
    rightFootX: center + lean + hipHalf * 0.65 + asymmetry * 0.15,
    footY: Math.min(900, hipY + legLength),
    spineBottomX: center + lean,
  };
};

const contourFigure = (
  descriptor: ArtworkDescriptor,
  stroke: string,
  accent: string,
  fill: string,
  allowDescriptorColors: boolean,
): string => {
  const g = geometryFor(descriptor);
  const strokeWidth = 1.4 + descriptor.rendering.edgeEmphasis * 4.8;
  const interior = descriptor.rendering.interiorVisibility * descriptor.rendering.stillnessVisibility;
  const faceDetail = Math.max(0.08, interior * 0.9);
  const leftElbowX = (g.leftShoulderX + g.leftHandX) / 2 - 12;
  const rightElbowX = (g.rightShoulderX + g.rightHandX) / 2 + 12;
  const elbowY = (g.shoulderY + g.handY) / 2;
  const spinalAccent = allowDescriptorColors
    ? descriptor.anatomy?.spinalMark?.color ?? stroke
    : accent;
  const eyeSpacing = 0.18 + (descriptor.anatomy?.eyeSpacing ?? 0.5) * 0.28;
  const noseLength = 14 + (descriptor.anatomy?.noseLength ?? 0.5) * 25;
  const mouthHalf = 8 + (descriptor.anatomy?.mouthWidth ?? 0.5) * 18;

  return `<g fill="none" stroke="${escapeXml(stroke)}" stroke-width="${n(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="${n(g.headCx)}" cy="${n(g.headCy)}" rx="${n(g.headRx)}" ry="${n(g.headRy)}" fill="${escapeXml(fill)}" fill-opacity="${n(interior * 0.34)}"/>
    <path d="M ${n(g.leftShoulderX)} ${n(g.shoulderY)} Q ${n(g.headCx)} ${n(g.shoulderY + 52)} ${n(g.rightShoulderX)} ${n(g.shoulderY)} L ${n(g.rightHipX)} ${n(g.hipY)} Q ${n(g.spineBottomX)} ${n(g.hipY + 34)} ${n(g.leftHipX)} ${n(g.hipY)} Z" fill="${escapeXml(fill)}" fill-opacity="${n(interior * 0.42)}"/>
    <path d="M ${n(g.leftShoulderX)} ${n(g.shoulderY)} Q ${n(leftElbowX)} ${n(elbowY)} ${n(g.leftHandX)} ${n(g.handY)}" stroke-width="${n(strokeWidth * 1.85)}"/>
    <path d="M ${n(g.rightShoulderX)} ${n(g.shoulderY)} Q ${n(rightElbowX)} ${n(elbowY)} ${n(g.rightHandX)} ${n(g.handY)}" stroke-width="${n(strokeWidth * 1.85)}"/>
    <path d="M ${n(g.leftHipX)} ${n(g.hipY)} Q ${n(g.leftHipX - 15)} ${n((g.hipY + g.footY) / 2)} ${n(g.leftFootX)} ${n(g.footY)}" stroke-width="${n(strokeWidth * 2.2)}"/>
    <path d="M ${n(g.rightHipX)} ${n(g.hipY)} Q ${n(g.rightHipX + 15)} ${n((g.hipY + g.footY) / 2)} ${n(g.rightFootX)} ${n(g.footY)}" stroke-width="${n(strokeWidth * 2.2)}"/>
    <path d="M ${n(g.headCx)} ${n(g.headCy + g.headRy)} Q ${n(g.headCx)} ${n((g.shoulderY + g.hipY) / 2)} ${n(g.spineBottomX)} ${n(g.hipY)}" stroke="${escapeXml(spinalAccent)}" stroke-width="${n(descriptor.anatomy?.spinalMark?.width ?? strokeWidth * 0.72)}"/>
    <g opacity="${n(faceDetail)}" stroke-width="${n(Math.max(1, strokeWidth * 0.4))}">
      <circle cx="${n(g.headCx - g.headRx * eyeSpacing)}" cy="${n(g.headCy - 4)}" r="3.2" fill="${escapeXml(stroke)}"/>
      <circle cx="${n(g.headCx + g.headRx * eyeSpacing)}" cy="${n(g.headCy - 4)}" r="3.2" fill="${escapeXml(stroke)}"/>
      <path d="M ${n(g.headCx)} ${n(g.headCy + 2)} L ${n(g.headCx - 3)} ${n(g.headCy + noseLength)} M ${n(g.headCx - mouthHalf)} ${n(g.headCy + 39)} Q ${n(g.headCx)} ${n(g.headCy + 44)} ${n(g.headCx + mouthHalf)} ${n(g.headCy + 39)}"/>
    </g>
  </g>`;
};

const anatomyMarkup = (
  descriptor: ArtworkDescriptor,
  stroke: string,
  accent: string,
  allowDescriptorColors: boolean,
): string => {
  const anatomy = descriptor.anatomy;
  if (!anatomy) return "";
  const g = geometryFor(descriptor);
  const fingers = Array.from({ length: anatomy.fingerCountPerHand }, (_, index) => {
    const offset = index - (anatomy.fingerCountPerHand - 1) / 2;
    return `<path d="M ${n(g.leftHandX)} ${n(g.handY)} l ${n(-12 - Math.abs(offset) * 1.4)} ${n(offset * 4.5)} M ${n(g.rightHandX)} ${n(g.handY)} l ${n(12 + Math.abs(offset) * 1.4)} ${n(offset * 4.5)}"/>`;
  }).join("");
  const plateSpecification = anatomy.chestPlates;
  const plates = plateSpecification
    ? Array.from({ length: plateSpecification.count }, (_, index) => {
        const columns = 2;
        const column = index % columns;
        const row = Math.floor(index / columns);
        const width = Math.max(24, (g.rightHipX - g.leftHipX) * 0.34);
        const plateColor = allowDescriptorColors ? plateSpecification.color : accent;
        return `<rect x="${n(g.leftHipX + 14 + column * (width + 8))}" y="${n(g.shoulderY + 32 + row * 44)}" width="${n(width)}" height="34" rx="4" fill="${escapeXml(plateColor)}" fill-opacity="${n(plateSpecification.opacity)}"/>`;
      }).join("")
    : "";
  const jointContours = anatomy.jointContourColor
    ? `<g fill="none" stroke="${escapeXml(allowDescriptorColors ? anatomy.jointContourColor : accent)}" opacity="0.65"><circle cx="${n(g.leftShoulderX)}" cy="${n(g.shoulderY)}" r="10"/><circle cx="${n(g.rightShoulderX)}" cy="${n(g.shoulderY)}" r="10"/></g>`
    : "";
  const spinalMark = anatomy.spinalMark
    ? `<path data-feature="spinal-mark" d="M ${n(g.headCx)} ${n(g.headCy - g.headRy)} Q ${n(g.headCx)} ${n((g.shoulderY + g.hipY) / 2)} ${n(g.spineBottomX)} ${n(g.hipY)}" stroke="${escapeXml(allowDescriptorColors ? anatomy.spinalMark.color : accent)}" stroke-width="${n(anatomy.spinalMark.width)}"/>`
    : "";
  return `<g data-anatomy="${escapeXml(anatomy.faceShape)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="1.6" stroke-linecap="round">
    <g data-feature="fingers" data-finger-count="${anatomy.fingerCountPerHand}">${fingers}</g>
    <g data-feature="chest-plates" stroke="${escapeXml(accent)}">${plates}</g>
    ${spinalMark}
    ${jointContours}
  </g>`;
};

const planarFigure = (
  descriptor: ArtworkDescriptor,
  stroke: string,
  accent: string,
  fill: string,
): string => {
  const g = geometryFor(descriptor);
  const opacity = 0.18 + descriptor.rendering.interiorVisibility * 0.46;
  const torsoX = Math.min(g.leftShoulderX, g.leftHipX);
  const torsoWidth = Math.max(g.rightShoulderX, g.rightHipX) - torsoX;
  return `<g stroke="${escapeXml(stroke)}" stroke-width="${n(1.5 + descriptor.rendering.edgeEmphasis * 3.5)}" stroke-linejoin="bevel">
    <rect x="${n(g.headCx - g.headRx)}" y="${n(g.headCy - g.headRy)}" width="${n(g.headRx * 2)}" height="${n(g.headRy * 2)}" fill="${escapeXml(fill)}" fill-opacity="${n(opacity)}"/>
    <rect x="${n(torsoX)}" y="${n(g.shoulderY)}" width="${n(torsoWidth)}" height="${n(g.hipY - g.shoulderY)}" fill="${escapeXml(accent)}" fill-opacity="${n(opacity)}"/>
    <polygon points="${n(g.leftShoulderX)},${n(g.shoulderY)} ${n(g.leftShoulderX - 24)},${n((g.shoulderY + g.handY) / 2)} ${n(g.leftHandX)},${n(g.handY)} ${n(g.leftHandX + 30)},${n(g.handY - 20)}" fill="${escapeXml(fill)}" fill-opacity="${n(opacity)}"/>
    <polygon points="${n(g.rightShoulderX)},${n(g.shoulderY)} ${n(g.rightShoulderX + 24)},${n((g.shoulderY + g.handY) / 2)} ${n(g.rightHandX)},${n(g.handY)} ${n(g.rightHandX - 30)},${n(g.handY - 20)}" fill="${escapeXml(fill)}" fill-opacity="${n(opacity)}"/>
    <polygon points="${n(g.leftHipX)},${n(g.hipY)} ${n(g.spineBottomX - 10)},${n(g.hipY)} ${n(g.leftFootX + 24)},${n(g.footY)} ${n(g.leftFootX - 20)},${n(g.footY)}" fill="${escapeXml(fill)}" fill-opacity="${n(opacity)}"/>
    <polygon points="${n(g.rightHipX)},${n(g.hipY)} ${n(g.spineBottomX + 10)},${n(g.hipY)} ${n(g.rightFootX - 24)},${n(g.footY)} ${n(g.rightFootX + 20)},${n(g.footY)}" fill="${escapeXml(fill)}" fill-opacity="${n(opacity)}"/>
  </g>`;
};

const figureMarkup = (
  descriptor: ArtworkDescriptor,
  foreground: string,
  accent: string,
  dim: string,
  background: string,
  allowDescriptorColors = false,
): string => {
  const practice = descriptor.practice;
  const fill = allowDescriptorColors ? descriptor.anatomy?.skinColor ?? dim : dim;
  const primary =
    practice?.markMode === "assembled-planes"
      ? planarFigure(descriptor, foreground, accent, fill)
      : contourFigure(descriptor, foreground, accent, fill, allowDescriptorColors);
  const anatomy = anatomyMarkup(descriptor, foreground, accent, allowDescriptorColors);
  const corrected =
    practice?.correctionMode === "adjacent-line"
      ? `<g opacity="0.22" transform="translate(4 -2)">${primary}</g>${primary}${anatomy}`
      : practice?.correctionMode === "overpaint-plane"
        ? `${primary}<g opacity="0.2" transform="translate(-7 5)">${primary}</g>${anatomy}`
        : `${primary}${anatomy}`;
  const compositionTransform =
    practice?.compositionMode === "low-grounded"
      ? "translate(16 38) scale(0.96)"
      : practice?.compositionMode === "spine-centered"
        ? "translate(32 4) scale(0.92)"
        : "translate(48 12) scale(0.88)";
  const erasure = practice?.erasureAllowed
    ? `<path data-practice-effect="erasure" d="M 246 482 Q 402 451 557 490" fill="none" stroke="${escapeXml(background)}" stroke-width="8" stroke-linecap="round" opacity="0.76"/>`
    : "";
  const base = `<g data-mark-mode="${escapeXml(practice?.markMode ?? "continuous-contour")}" data-composition="${escapeXml(practice?.compositionMode ?? "isolated-frontal")}" data-correction="${escapeXml(practice?.correctionMode ?? "adjacent-line")}" data-line-lift="${practice?.lineLiftAllowed ? "allowed" : "continuous"}" data-erasure="${practice?.erasureAllowed ? "allowed" : "forbidden"}" stroke-dasharray="${practice?.lineLiftAllowed ? "24 7" : "none"}" transform="${compositionTransform}">${corrected}${erasure}</g>`;
  const repetitions = Math.min(
    8,
    Math.max(
      practice?.minimumRepetitions ?? 1,
      Math.round(descriptor.rendering.echoCount),
    ),
  );
  if (repetitions === 1) return base;

  const spacing = Math.min(32, Math.max(1, descriptor.rendering.echoSpacing));
  return Array.from({ length: repetitions }, (_, index) => {
    const distance = index - (repetitions - 1) / 2;
    const opacity = index === repetitions - 1 ? 0.88 : Math.max(0.08, 0.42 / (index + 1));
    return `<g transform="translate(${n(distance * spacing)} 0)" opacity="${n(opacity)}">${base}</g>`;
  }).join("\n");
};

const fragmentationOverlay = (
  descriptor: ArtworkDescriptor,
  background: string,
): string => {
  const fragmentation = descriptor.rendering.fragmentation;
  if (fragmentation < 0.05) return "";
  const cell = 38 + fragmentation * 78;
  const retention = descriptor.rendering.sampleRetention;
  const rectangles: string[] = [];
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const pattern = ((row * 17 + column * 31) % 100) / 100;
      if (pattern > retention) {
        rectangles.push(
          `<rect x="${n(95 + column * cell)}" y="${n(110 + row * cell)}" width="${n(cell * 0.76)}" height="${n(cell * 0.76)}" fill="${escapeXml(background)}" opacity="${n(0.3 + fragmentation * 0.5)}"/>`,
        );
      }
    }
  }
  return `<g data-visual-effect="fragmentation">${rectangles.join("")}</g>`;
};

export interface RenderArtworkOptions {
  readonly title: string;
  readonly subtitle: string;
  readonly descriptor: ArtworkDescriptor;
  readonly palette: readonly string[];
  readonly dataRole?: string;
}

export const renderArtworkSvg = (options: RenderArtworkOptions): string => {
  const [background = "#11110f", foreground = "#e9e7df", accent = "#c57d4d", dim = "#5d574d"] =
    options.palette;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="${escapeXml(options.title)}" data-role="${escapeXml(options.dataRole ?? "portrait")}" data-descriptor-version="1">
  <rect width="800" height="1000" fill="${escapeXml(background)}"/>
  ${figureMarkup(
    options.descriptor,
    foreground,
    accent,
    dim,
    background,
    options.dataRole === "self",
  )}
  ${fragmentationOverlay(options.descriptor, background)}
  <text x="40" y="930" fill="${escapeXml(foreground)}" font-family="sans-serif" font-size="22">${escapeXml(options.title)}</text>
  <text x="40" y="960" fill="${escapeXml(accent)}" font-family="sans-serif" font-size="14">${escapeXml(options.subtitle)}</text>
</svg>`;
};

export interface RenderSocialCompositeOptions {
  readonly title: string;
  readonly subtitle: string;
  readonly consensus: ArtworkDescriptor;
  readonly layers: readonly {
    readonly descriptor: ArtworkDescriptor;
    readonly weight: number;
  }[];
  readonly palette: readonly string[];
}

export const renderSocialCompositeSvg = (options: RenderSocialCompositeOptions): string => {
  const [background = "#11110f", foreground = "#e9e7df", accent = "#c57d4d", dim = "#5d574d"] =
    options.palette;
  const totalWeight = options.layers.reduce((sum, layer) => sum + Math.max(0.01, layer.weight), 0);
  const layers = options.layers
    .map((layer, index) => {
      const opacity = 0.16 + (Math.max(0.01, layer.weight) / totalWeight) * 0.5;
      const color = index % 2 === 0 ? foreground : accent;
      return `<g data-peer-layer="${index + 1}" opacity="${n(opacity)}">${figureMarkup(layer.descriptor, color, accent, dim, background)}</g>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="${escapeXml(options.title)}" data-role="social" data-descriptor-version="1">
  <rect width="800" height="1000" fill="${escapeXml(background)}"/>
  ${layers}
  <g data-consensus-outline="true" opacity="0.48">${figureMarkup(options.consensus, foreground, accent, dim, background)}</g>
  <text x="40" y="930" fill="${escapeXml(foreground)}" font-family="sans-serif" font-size="22">${escapeXml(options.title)}</text>
  <text x="40" y="960" fill="${escapeXml(accent)}" font-family="sans-serif" font-size="14">${escapeXml(options.subtitle)}</text>
</svg>`;
};
