import type {
  Artwork,
  CycleIntent,
  IdentityReflection,
  Portrait,
  SelfConcept,
} from "../model";
import type {
  AdaptationSystem,
  Clock,
  CognitionSystem,
  DrawingSystem,
  FeedbackCompositor,
  IdGenerator,
  PerceptionSystem,
} from "../systems/contracts";

const escapeXml = (value: string): string =>
  value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character];
  });

const createPlaceholderArtwork = (
  title: string,
  subtitle: string,
  palette: readonly string[],
): Artwork => {
  const [background = "#11110f", foreground = "#e9e7df", accent = "#9e9b91"] = palette;
  return {
    format: "svg",
    width: 800,
    height: 1000,
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="${escapeXml(title)}">
  <rect width="800" height="1000" fill="${escapeXml(background)}"/>
  <rect x="48" y="48" width="704" height="904" fill="none" stroke="${escapeXml(accent)}"/>
  <g fill="none" stroke="${escapeXml(foreground)}" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="400" cy="235" rx="62" ry="78" fill="${escapeXml(background)}" stroke-width="2"/>
    <path d="M376 304 L370 350 M424 304 L430 350" stroke-width="5"/>
    <path d="M300 350 C330 420 342 520 330 620 L470 620 C458 520 470 420 500 350 Q400 390 300 350 Z" fill="${escapeXml(background)}" stroke-width="2"/>
    <path d="M310 370 C260 455 250 560 230 665 M490 370 C540 455 550 560 570 665" stroke-width="28"/>
    <path d="M360 620 C340 735 330 830 315 910 M440 620 C460 735 470 830 485 910" stroke-width="32"/>
    <circle cx="230" cy="665" r="18" fill="${escapeXml(background)}"/>
    <circle cx="570" cy="665" r="18" fill="${escapeXml(background)}"/>
    <circle cx="378" cy="226" r="4" fill="${escapeXml(foreground)}" stroke="none"/>
    <circle cx="422" cy="226" r="4" fill="${escapeXml(foreground)}" stroke="none"/>
    <path d="M400 236 L396 258 L403 261 M382 278 Q400 285 418 278" stroke-width="1.5"/>
  </g>
  <text x="400" y="790" fill="${escapeXml(foreground)}" text-anchor="middle" font-family="sans-serif" font-size="28">${escapeXml(title)}</text>
  <text x="400" y="835" fill="${escapeXml(accent)}" text-anchor="middle" font-family="sans-serif" font-size="16">${escapeXml(subtitle)}</text>
</svg>`,
  };
};

export class TemplateCognitionSystem implements CognitionSystem {
  async formIntent(input: Parameters<CognitionSystem["formIntent"]>[0]): Promise<CycleIntent> {
    return {
      statement: input.state.lastReflection?.nextIntention ?? input.manifest.identity.idealSelf.narrative,
      desiredQualities: input.manifest.identity.idealSelf.values,
      visualInstructions: input.manifest.identity.idealSelf.visualAnchors,
      bodilyInstructions: [
        input.manifest.identity.idealPhysicalForm.description,
        ...input.state.selfConcept.physicalSelf.perceivedDifferences,
      ],
    };
  }

  async reflect(input: Parameters<CognitionSystem["reflect"]>[0]): Promise<IdentityReflection> {
    const hasSocialFeedback = input.socialPortrait !== undefined;
    return {
      summary: hasSocialFeedback
        ? "The world returned an image that overlaps with, but does not replace, my own."
        : "I made an image before the world had returned one to me.",
      tensions: hasSocialFeedback ? ["continuity versus adaptation"] : ["expression without feedback"],
      nextIntention: hasSocialFeedback
        ? "Keep one recognizable element and reconsider the boundary around it."
        : "Remain visible long enough to be perceived.",
      memory: `Cycle ${input.cycle}: ${
        hasSocialFeedback ? "I received a social portrait." : "I am still awaiting a social portrait."
      }`,
      physicalAssessment: {
        similarityDelta: hasSocialFeedback ? 0.025 : -0.005,
        retainedFeatures: input.manifest.identity.idealPhysicalForm.nonNegotiableFeatures,
        perceivedDifferences: input.state.selfConcept.physicalSelf.perceivedDifferences,
        nextBodilyAdjustment: hasSocialFeedback
          ? "Adjust one perceived anatomical difference while preserving every identifying feature."
          : "Hold the current body legible until peers can return it.",
      },
    };
  }
}

export class TemplatePerceptionSystem implements PerceptionSystem {
  async observe(input: Parameters<PerceptionSystem["observe"]>[0]) {
    return {
      observerId: input.manifest.id,
      subjectId: input.portrait.subjectId,
      sourcePortrait: input.portrait,
      perceivedArtwork: input.portrait.artwork,
      notes: ["Template perception preserved the source without distortion."],
    };
  }
}

export class TemplateDrawingSystem implements DrawingSystem {
  constructor(private readonly ids: IdGenerator) {}

  async drawSelf(input: Parameters<DrawingSystem["drawSelf"]>[0]): Promise<Portrait> {
    return {
      id: this.ids.create([input.manifest.id, input.cycle, "self"]),
      cycle: input.cycle,
      artistId: input.manifest.id,
      subjectId: input.manifest.id,
      role: "self",
      createdAt: input.createdAt,
      artwork: createPlaceholderArtwork(
        input.manifest.displayName,
        `self / cycle ${input.cycle}`,
        input.manifest.drawing.palette,
      ),
      statement: input.intent.statement,
      sourcePortraitIds: [],
    };
  }

  async drawPeer(input: Parameters<DrawingSystem["drawPeer"]>[0]): Promise<Portrait> {
    const subjectId = input.observation.subjectId;
    return {
      id: this.ids.create([input.manifest.id, input.cycle, "peer", subjectId]),
      cycle: input.cycle,
      artistId: input.manifest.id,
      subjectId,
      role: "peer",
      createdAt: input.createdAt,
      artwork: createPlaceholderArtwork(
        subjectId,
        `as perceived by ${input.manifest.displayName}`,
        input.manifest.drawing.palette,
      ),
      statement: input.observation.notes.join(" "),
      sourcePortraitIds: [input.observation.sourcePortrait.id],
    };
  }
}

export class TemplateFeedbackCompositor implements FeedbackCompositor {
  constructor(private readonly ids: IdGenerator) {}

  async compose(input: Parameters<FeedbackCompositor["compose"]>[0]): Promise<Portrait | undefined> {
    if (input.portraits.length === 0) return undefined;

    return {
      id: this.ids.create([input.manifest.id, input.cycle, "social"]),
      cycle: input.cycle,
      artistId: "collective",
      subjectId: input.manifest.id,
      role: "social",
      createdAt: input.createdAt,
      artwork: {
        format: "procedural",
        width: 800,
        height: 1000,
        content: JSON.stringify({
          operation: "layer",
          sources: input.portraits.map((portrait) => portrait.id),
          opacity: 1 / input.portraits.length,
        }),
      },
      statement: `${input.portraits.length} peer perception${input.portraits.length === 1 ? "" : "s"} composited.`,
      sourcePortraitIds: input.portraits.map((portrait) => portrait.id),
    };
  }
}

export class TemplateAdaptationSystem implements AdaptationSystem {
  async adapt(input: Parameters<AdaptationSystem["adapt"]>[0]): Promise<SelfConcept> {
    const direction = input.socialPortrait ? 0.05 : -0.01;
    return {
      narrative: input.reflection.nextIntention,
      keywords: [...input.state.selfConcept.keywords],
      confidence: Math.min(1, Math.max(0, input.state.selfConcept.confidence + direction)),
      physicalSelf: {
        ...input.state.selfConcept.physicalSelf,
        perceivedSimilarity: Math.min(
          1,
          Math.max(
            0,
            input.state.selfConcept.physicalSelf.perceivedSimilarity +
              input.reflection.physicalAssessment.similarityDelta,
          ),
        ),
        perceivedDifferences: input.reflection.physicalAssessment.perceivedDifferences,
      },
    };
  }
}

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}

export class StableIdGenerator implements IdGenerator {
  create(parts: readonly (string | number)[]): string {
    return parts.map(String).join("--");
  }
}
