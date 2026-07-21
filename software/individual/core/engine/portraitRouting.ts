import type {
  FigureDescriptor,
  IndividualState,
  Observation,
  Portrait,
} from "../model";
import { applyOpticalCalibration } from "../opticalCalibration";
import { assertCanonicalSocialPortraitClaims } from "../socialEvidence";
import {
  assertGeneratedSocialPortraitBounds,
  assertRoutedPortraitBounds,
} from "../validation/portraitBoundary";
import {
  artworkDescriptorsEqual,
  assertPerceptionEvidenceBounds,
  perceptionEvidenceEqual,
} from "../validation/visualEvidence";

export const MAX_PEERS_PER_CYCLE = 16;
export const MAX_SELF_PORTRAIT_HISTORY = 8;
export const MAX_RETAINED_SOCIAL_COHORT_BYTES = 512 * 1024;
const MAX_FEEDBACK_SOURCE_AGE_CYCLES = 2;
const MAX_OBSERVATION_CONTENT_BYTES = 512 * 1024;
const SAFE_MEMBER_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const RESERVED_MEMBER_IDS = new Set(["__proto__", "prototype", "constructor"]);

const validateSocietyPeerIds = (
  individualId: string,
  peerIds: readonly string[],
): ReadonlySet<string> => {
  if (
    !Array.isArray(peerIds) ||
    peerIds.length > MAX_PEERS_PER_CYCLE ||
    new Set(peerIds).size !== peerIds.length ||
    peerIds.some(
      (peerId) =>
        !SAFE_MEMBER_ID.test(peerId) ||
        RESERVED_MEMBER_IDS.has(peerId) ||
        peerId === individualId,
    )
  ) {
    throw new Error(`Individual "${individualId}" has an invalid society peer registry.`);
  }
  return new Set(peerIds);
};

/**
 * The semantic boundary around one Individual's canvas routes. It owns society
 * membership, bounded cohorts, provenance, and chronology; the engine only
 * orchestrates accepted data through the cycle.
 */
export class PortraitRoutingBoundary {
  private readonly societyPeerIds: ReadonlySet<string>;

  constructor(
    private readonly individualId: string,
    allowedPeerIds: readonly string[],
    private readonly idealFigure?: FigureDescriptor,
  ) {
    this.societyPeerIds = validateSocietyPeerIds(individualId, allowedPeerIds);
  }

  assertPeerSelfPortraits(portraits: readonly Portrait[]): void {
    if (portraits.length > MAX_PEERS_PER_CYCLE) {
      throw new Error(`At most ${MAX_PEERS_PER_CYCLE} peer canvases may enter one cycle.`);
    }
    const ids = new Set<string>();
    const artists = new Set<string>();
    for (const portrait of portraits) {
      assertRoutedPortraitBounds(portrait);
      if (ids.has(portrait.id) || artists.has(portrait.artistId)) {
        throw new Error(`Duplicate peer canvas or artist "${portrait.id}".`);
      }
      ids.add(portrait.id);
      artists.add(portrait.artistId);
      if (portrait.role !== "self") {
        throw new Error(`Peer canvas "${portrait.id}" must be a self-portrait.`);
      }
      if (portrait.subjectId === this.individualId) {
        throw new Error("An Individual cannot be included among its own peer canvases.");
      }
      if (
        portrait.artistId !== portrait.subjectId ||
        !this.societyPeerIds.has(portrait.artistId)
      ) {
        throw new Error(`Peer canvas "${portrait.id}" is not routed from a known peer.`);
      }
      if (portrait.sourcePortraitIds.length !== 0) {
        throw new Error(`Peer self canvas "${portrait.id}" cannot claim source portraits.`);
      }
      if (!portrait.descriptor?.anatomy || !portrait.descriptor?.practice) {
        throw new Error(`Peer self canvas "${portrait.id}" lacks a structured body descriptor.`);
      }
      if (portrait.observationEvidence) {
        throw new Error(`Peer self canvas "${portrait.id}" cannot claim observation evidence.`);
      }
    }
  }

  assertObservationOutputs(
    observations: readonly Observation[],
    sources: readonly Portrait[],
    expected: {
      readonly modelId: string;
      readonly tuning: Readonly<Record<string, number>>;
    },
  ): void {
    if (observations.length !== sources.length || observations.length > MAX_PEERS_PER_CYCLE) {
      throw new Error("Perception system returned an invalid observation count.");
    }
    observations.forEach((observation, index) => {
      const source = sources[index];
      const expectedTuningEntries = Object.entries(expected.tuning).sort(([left], [right]) =>
        left.localeCompare(right),
      );
      const actualTuningEntries = Object.entries(observation.evidence?.tuning ?? {}).sort(
        ([left], [right]) => left.localeCompare(right),
      );
      if (
        observation.observerId !== this.individualId ||
        observation.subjectId !== source.subjectId ||
        observation.sourcePortrait.id !== source.id ||
        !observation.evidence ||
        observation.evidence.modelId !== expected.modelId ||
        actualTuningEntries.length !== expectedTuningEntries.length ||
        actualTuningEntries.some(
          ([id, value], tuningIndex) =>
            id !== expectedTuningEntries[tuningIndex]?.[0] ||
            value !== expectedTuningEntries[tuningIndex]?.[1],
        ) ||
        !source.descriptor ||
        !artworkDescriptorsEqual(observation.evidence.source, source.descriptor)
      ) {
        throw new Error(`Perception system returned invalid source lineage at index ${index}.`);
      }
      assertPerceptionEvidenceBounds(
        observation.evidence,
        `perception output[${index}].evidence`,
      );
      const acquisition = observation.evidence.acquisition;
      if (acquisition) {
        const expectedCalibrated = applyOpticalCalibration(
          acquisition.interpreted,
          acquisition.calibration,
        );
        if (
          acquisition.sourcePortraitId !== source.id ||
          Date.parse(acquisition.capturedAt) < Date.parse(source.createdAt) ||
          !artworkDescriptorsEqual(acquisition.calibrated, expectedCalibrated) ||
          (acquisition.sourceKind === "digital-canvas" &&
            !artworkDescriptorsEqual(acquisition.interpreted, source.descriptor)) ||
          (acquisition.sourceKind === "physical-camera" &&
            artworkDescriptorsEqual(acquisition.interpreted, source.descriptor))
        ) {
          throw new Error(
            `Perception system returned invalid acquisition evidence at index ${index}.`,
          );
        }
      }
      if (
        !Array.isArray(observation.notes) ||
        observation.notes.length > 64 ||
        observation.notes.some(
          (note) =>
            typeof note !== "string" ||
            new TextEncoder().encode(note).byteLength > 1_000,
        ) ||
        !Number.isInteger(observation.perceivedArtwork.width) ||
        !Number.isInteger(observation.perceivedArtwork.height) ||
        observation.perceivedArtwork.width < 1 ||
        observation.perceivedArtwork.height < 1 ||
        observation.perceivedArtwork.width > 8_192 ||
        observation.perceivedArtwork.height > 8_192 ||
        !["svg", "procedural", "raster-reference"].includes(
          observation.perceivedArtwork.format,
        ) ||
        typeof observation.perceivedArtwork.content !== "string" ||
        new TextEncoder().encode(observation.perceivedArtwork.content).byteLength >
          MAX_OBSERVATION_CONTENT_BYTES
      ) {
        throw new Error(`Perception system returned an unbounded observation at index ${index}.`);
      }
    });
  }

  resolveFeedbackSource(
    state: IndividualState,
    portraits: readonly Portrait[],
  ): Portrait | undefined {
    if (portraits.length === 0) return undefined;
    if (portraits.length > MAX_PEERS_PER_CYCLE) {
      throw new Error(`At most ${MAX_PEERS_PER_CYCLE} returned peer portraits may enter one cycle.`);
    }
    const ids = new Set<string>();
    const artists = new Set<string>();
    const sourceIds = new Set<string>();
    for (const portrait of portraits) {
      assertRoutedPortraitBounds(portrait);
      if (portrait.role !== "peer" || portrait.subjectId !== this.individualId) {
        throw new Error(
          `Received portrait "${portrait.id}" must be a peer portrait of "${this.individualId}".`,
        );
      }
      if (!this.societyPeerIds.has(portrait.artistId)) {
        throw new Error(`Received portrait "${portrait.id}" is not routed from a known peer.`);
      }
      if (ids.has(portrait.id) || artists.has(portrait.artistId)) {
        throw new Error(`Duplicate returned portrait or artist "${portrait.id}".`);
      }
      ids.add(portrait.id);
      artists.add(portrait.artistId);
      if (portrait.sourcePortraitIds.length !== 1) {
        throw new Error(
          `Received portrait "${portrait.id}" must declare exactly one source self portrait.`,
        );
      }
      sourceIds.add(portrait.sourcePortraitIds[0]);
      if (
        !portrait.descriptor?.anatomy ||
        !portrait.descriptor?.practice ||
        !portrait.observationEvidence
      ) {
        throw new Error(
          `Received portrait "${portrait.id}" lacks structured drawing or perception evidence.`,
        );
      }
    }
    const retainedBytes = new TextEncoder().encode(JSON.stringify(portraits)).byteLength;
    if (retainedBytes > MAX_RETAINED_SOCIAL_COHORT_BYTES) {
      throw new Error("Received peer portrait cohort exceeds the durable retention bound.");
    }
    if (sourceIds.size !== 1) {
      throw new Error("Received peer portraits must belong to one unmixed source-self cohort.");
    }
    const sourceId = [...sourceIds][0];
    const persistedSources = [
      ...(state.currentSelfPortrait ? [state.currentSelfPortrait] : []),
      ...(state.selfPortraitHistory ?? []),
    ];
    const source = persistedSources.find((portrait) => portrait.id === sourceId);
    if (!source) {
      throw new Error(`Received peer portrait cohort references unknown source "${sourceId}".`);
    }
    assertRoutedPortraitBounds(source, "persisted source self portrait");
    if (
      source.role !== "self" ||
      source.subjectId !== this.individualId ||
      source.artistId !== this.individualId ||
      !source.descriptor?.anatomy ||
      !source.descriptor?.practice ||
      state.cycle - source.cycle < 0 ||
      state.cycle - source.cycle > MAX_FEEDBACK_SOURCE_AGE_CYCLES
    ) {
      throw new Error(
        `Received peer portrait cohort references stale or invalid source "${sourceId}".`,
      );
    }
    for (const portrait of portraits) {
      // Cycle counters are local to each Individual and cannot be compared
      // across peers. Causality is carried by the exact source portrait ID and
      // an acquisition/creation timestamp that cannot predate that source.
      if (Date.parse(portrait.createdAt) < Date.parse(source.createdAt)) {
        throw new Error(`Received portrait "${portrait.id}" predates its source self portrait.`);
      }
      if (
        !portrait.observationEvidence ||
        !artworkDescriptorsEqual(portrait.observationEvidence.source, source.descriptor)
      ) {
        throw new Error(
          `Received portrait "${portrait.id}" has perception evidence for a different source body.`,
        );
      }
    }
    return source;
  }

  assertSelfPortraitOutput(portrait: Portrait, cycle: number): void {
    assertRoutedPortraitBounds(portrait, "self drawing output");
    if (
      portrait.role !== "self" ||
      portrait.artistId !== this.individualId ||
      portrait.subjectId !== this.individualId ||
      portrait.cycle !== cycle ||
      portrait.sourcePortraitIds.length !== 0 ||
      !portrait.descriptor?.anatomy ||
      !portrait.descriptor?.practice ||
      portrait.observationEvidence
    ) {
      throw new Error("Drawing system returned an invalid self-portrait contract.");
    }
  }

  assertPeerPortraitOutputs(
    portraits: readonly Portrait[],
    observations: readonly Observation[],
    cycle: number,
  ): void {
    if (portraits.length !== observations.length || portraits.length > MAX_PEERS_PER_CYCLE) {
      throw new Error("Drawing system returned an invalid peer portrait count.");
    }
    const ids = new Set<string>();
    portraits.forEach((portrait, index) => {
      assertRoutedPortraitBounds(portrait, `peer drawing output[${index}]`);
      const observation = observations[index];
      if (
        ids.has(portrait.id) ||
        portrait.role !== "peer" ||
        portrait.artistId !== this.individualId ||
        portrait.subjectId !== observation.subjectId ||
        portrait.cycle !== cycle ||
        portrait.sourcePortraitIds.length !== 1 ||
        portrait.sourcePortraitIds[0] !== observation.sourcePortrait.id ||
        !portrait.descriptor?.anatomy ||
        !portrait.descriptor?.practice ||
        !portrait.observationEvidence ||
        !observation.evidence ||
        !perceptionEvidenceEqual(portrait.observationEvidence, observation.evidence)
      ) {
        throw new Error(
          `Drawing system returned an invalid peer-portrait contract at index ${index}.`,
        );
      }
      ids.add(portrait.id);
    });
  }

  assertSocialPortraitOutput(
    portrait: Portrait | undefined,
    inputs: readonly Portrait[],
    sourceSelfPortrait: Portrait | undefined,
    cycle: number,
  ): void {
    if (inputs.length === 0) {
      if (portrait !== undefined) {
        throw new Error("Feedback compositor returned a social portrait without peer input.");
      }
      return;
    }
    if (!portrait || !sourceSelfPortrait) {
      throw new Error("Feedback compositor omitted a required social portrait or source.");
    }
    assertGeneratedSocialPortraitBounds(portrait);
    const inputIds = inputs.map((input) => input.id);
    const contributionIds = portrait.socialEvidence!.contributions.map(
      (contribution) => contribution.portraitId,
    );
    if (
      portrait.subjectId !== this.individualId ||
      portrait.cycle !== cycle ||
      portrait.socialEvidence!.sourceSelfPortraitId !== sourceSelfPortrait.id ||
      portrait.sourcePortraitIds.length !== inputIds.length ||
      portrait.sourcePortraitIds.some((id, index) => id !== inputIds[index]) ||
      contributionIds.length !== inputIds.length ||
      contributionIds.some((id, index) => id !== inputIds[index])
    ) {
      throw new Error("Feedback compositor returned invalid social portrait lineage.");
    }
    portrait.socialEvidence!.contributions.forEach((contribution, index) => {
      const input = inputs[index];
      if (
        contribution.artistId !== input.artistId ||
        !input.descriptor ||
        !artworkDescriptorsEqual(contribution.descriptor, input.descriptor) ||
        (input.observationEvidence !== undefined &&
          (contribution.perceptionEvidence === undefined ||
            !perceptionEvidenceEqual(
              contribution.perceptionEvidence,
              input.observationEvidence,
            )))
      ) {
        throw new Error("Feedback compositor altered contribution provenance.");
      }
    });
    assertCanonicalSocialPortraitClaims({
      portrait,
      sourceSelfPortrait,
      contributorPortraits: inputs,
      idealFigure: this.idealFigure,
    });
  }
}
