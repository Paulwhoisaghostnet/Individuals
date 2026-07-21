import type {
  IndividualSnapshot,
  MemoryEntry,
  Portrait,
} from "../core/model";
import { MAX_RETAINED_SOCIAL_COHORT_BYTES } from "../core/engine/portraitRouting";
import { assertCanonicalSocialPortraitClaims } from "../core/socialEvidence";
import { validatePersistedManifest, validatePhysicalSelf } from "./manifestValidation";
import {
  validateBodyAdjustments,
  validateDescriptor,
  validateGeometry,
  validatePerceptionEvidence,
  validateSocialEvidence,
} from "./visualValidation";
import {
  assertExactKeys,
  requireEnum,
  requireFinite,
  requireInteger,
  requireRecord,
  requireSafeIdentifier,
  requireString,
  requireStringArray,
  requireTimestamp,
  requireUniqueSafeIdentifiers,
  requireUnitInterval,
} from "./validationPrimitives";

const STATUSES = new Set(["idle", "observing", "drawing", "reflecting", "paused"] as const);
const MEMORY_KINDS = new Set(["experience", "reflection", "relationship", "summary"] as const);
const PORTRAIT_ROLES = new Set(["self", "peer", "social"] as const);
const ARTWORK_FORMATS = new Set(["svg", "procedural", "raster-reference"] as const);

export const validatePortrait = (value: unknown, field = "portrait"): Portrait => {
  const portrait = requireRecord(value, field, 12);
  assertExactKeys(
    portrait,
    ["id", "cycle", "artistId", "subjectId", "role", "createdAt", "artwork", "descriptor", "socialEvidence", "observationEvidence", "statement", "sourcePortraitIds"],
    field,
  );
  requireSafeIdentifier(portrait.id, `${field}.id`, 256);
  requireInteger(portrait.cycle, `${field}.cycle`, 0, 1_000_000_000);
  requireSafeIdentifier(portrait.artistId, `${field}.artistId`, 128);
  requireSafeIdentifier(portrait.subjectId, `${field}.subjectId`, 128);
  const role = requireEnum(portrait.role, PORTRAIT_ROLES, `${field}.role`);
  requireTimestamp(portrait.createdAt, `${field}.createdAt`);
  const sourceIds = requireUniqueSafeIdentifiers(
    portrait.sourcePortraitIds,
    `${field}.sourcePortraitIds`,
    64,
    256,
  );
  if (portrait.statement !== undefined) {
    requireString(portrait.statement, `${field}.statement`, 10_000, true);
  }

  const artwork = requireRecord(portrait.artwork, `${field}.artwork`, 4);
  assertExactKeys(artwork, ["format", "width", "height", "content"], `${field}.artwork`);
  requireEnum(artwork.format, ARTWORK_FORMATS, `${field}.artwork.format`);
  requireInteger(artwork.width, `${field}.artwork.width`, 1, 16_384);
  requireInteger(artwork.height, `${field}.artwork.height`, 1, 16_384);
  if (
    typeof artwork.content !== "string" ||
    artwork.content.length === 0 ||
    Buffer.byteLength(artwork.content, "utf8") > 512 * 1024 ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(artwork.content)
  ) {
    throw new Error(`${field}.artwork.content must be safe text no larger than 512 KiB.`);
  }
  if (portrait.descriptor !== undefined) {
    // Imported raster references may omit geometry, but any supplied geometry
    // must pass the complete descriptor validator.
    validateDescriptor(portrait.descriptor, `${field}.descriptor`);
  }
  if (portrait.socialEvidence !== undefined) {
    if (role !== "social") throw new Error(`${field}.socialEvidence is only valid on social portraits.`);
    const evidence = validateSocialEvidence(portrait.socialEvidence, `${field}.socialEvidence`);
    if (evidence.subjectId !== portrait.subjectId) {
      throw new Error(`${field}.socialEvidence subject is invalid.`);
    }
    const contributionIds = evidence.contributions.map((contribution) => contribution.portraitId);
    if (contributionIds.some((id) => !sourceIds.includes(id))) {
      throw new Error(`${field}.socialEvidence contribution is absent from sourcePortraitIds.`);
    }
  }
  if (role === "social" && (!portrait.descriptor || !portrait.socialEvidence)) {
    throw new Error(`${field} must carry a descriptor and canonical social evidence.`);
  }
  if (portrait.observationEvidence !== undefined) {
    if (role !== "peer") {
      throw new Error(`${field}.observationEvidence is only valid on peer portraits.`);
    }
    validatePerceptionEvidence(portrait.observationEvidence, `${field}.observationEvidence`);
  }
  if (role === "self" && sourceIds.length > 1) {
    throw new Error(`${field}.sourcePortraitIds is invalid for a self portrait.`);
  }
  if (role === "peer" && sourceIds.length !== 1) {
    throw new Error(`${field}.sourcePortraitIds must identify exactly one observed self portrait.`);
  }
  return value as Portrait;
};

export const validateMemoryEntry = (value: unknown, field = "memory"): MemoryEntry => {
  const memory = requireRecord(value, field, 7);
  assertExactKeys(
    memory,
    ["id", "individualId", "cycle", "kind", "content", "createdAt", "relatedIndividualIds"],
    field,
  );
  requireSafeIdentifier(memory.id, `${field}.id`, 256);
  requireSafeIdentifier(memory.individualId, `${field}.individualId`, 128);
  requireInteger(memory.cycle, `${field}.cycle`, 0, 1_000_000_000);
  requireEnum(memory.kind, MEMORY_KINDS, `${field}.kind`);
  requireString(memory.content, `${field}.content`, 64 * 1024);
  requireTimestamp(memory.createdAt, `${field}.createdAt`);
  requireUniqueSafeIdentifiers(memory.relatedIndividualIds, `${field}.relatedIndividualIds`, 64, 128);
  return value as MemoryEntry;
};

export const validateMemoryEntries = (value: unknown): MemoryEntry[] => {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new Error("Memory file root must be an array of at most 10000 entries.");
  }
  return value.map((entry, index) => validateMemoryEntry(entry, `memories[${index}]`));
};

const validateReflection = (value: unknown, field: string): void => {
  const reflection = requireRecord(value, field, 14);
  assertExactKeys(
    reflection,
    ["summary", "tensions", "nextIntention", "memory", "physicalAssessment", "intendedSignals", "perceivedPeerSignals", "recurringPatterns", "acceptedFeedback", "rejectedFeedback", "unresolvedQuestions", "relationshipUpdates", "publicFragment"],
    field,
  );
  requireString(reflection.summary, `${field}.summary`, 10_000);
  requireStringArray(reflection.tensions, `${field}.tensions`, 32, 2_000);
  requireString(reflection.nextIntention, `${field}.nextIntention`, 5_000);
  requireString(reflection.memory, `${field}.memory`, 64 * 1024);
  const physical = requireRecord(reflection.physicalAssessment, `${field}.physicalAssessment`, 7);
  assertExactKeys(
    physical,
    ["similarityDelta", "retainedFeatures", "perceivedDifferences", "nextBodilyAdjustment", "nextBodyAdjustments", "geometry"],
    `${field}.physicalAssessment`,
  );
  requireFinite(physical.similarityDelta, `${field}.physicalAssessment.similarityDelta`, -1, 1);
  requireStringArray(physical.retainedFeatures, `${field}.physicalAssessment.retainedFeatures`, 64, 1_000);
  requireStringArray(physical.perceivedDifferences, `${field}.physicalAssessment.perceivedDifferences`, 64, 2_000);
  requireString(physical.nextBodilyAdjustment, `${field}.physicalAssessment.nextBodilyAdjustment`, 5_000);
  if (physical.nextBodyAdjustments !== undefined) {
    validateBodyAdjustments(physical.nextBodyAdjustments, `${field}.physicalAssessment.nextBodyAdjustments`);
  }
  if (physical.geometry !== undefined) {
    validateGeometry(physical.geometry, `${field}.physicalAssessment.geometry`);
  }
  for (const key of ["intendedSignals", "recurringPatterns", "acceptedFeedback", "rejectedFeedback", "unresolvedQuestions"] as const) {
    if (reflection[key] !== undefined) {
      requireStringArray(reflection[key], `${field}.${key}`, 32, 2_000);
    }
  }
  if (reflection.perceivedPeerSignals !== undefined) {
    const signals = requireRecord(reflection.perceivedPeerSignals, `${field}.perceivedPeerSignals`, 64);
    for (const [peerId, peerSignals] of Object.entries(signals)) {
      requireSafeIdentifier(peerId, `${field}.perceivedPeerSignals key`, 128);
      requireStringArray(peerSignals, `${field}.perceivedPeerSignals.${peerId}`, 32, 2_000);
    }
  }
  if (reflection.relationshipUpdates !== undefined) {
    const updates = requireRecord(reflection.relationshipUpdates, `${field}.relationshipUpdates`, 64);
    for (const [peerId, rawUpdate] of Object.entries(updates)) {
      requireSafeIdentifier(peerId, `${field}.relationshipUpdates key`, 128);
      const update = requireRecord(rawUpdate, `${field}.relationshipUpdates.${peerId}`, 5);
      assertExactKeys(
        update,
        ["peerId", "perceivedDistortions", "perceivedReliability", "perceivedTrend", "expectedReaction"],
        `${field}.relationshipUpdates.${peerId}`,
      );
      if (update.peerId !== undefined && update.peerId !== peerId) {
        throw new Error(`${field}.relationshipUpdates.${peerId}.peerId does not match.`);
      }
      if (update.perceivedDistortions !== undefined) {
        requireStringArray(update.perceivedDistortions, `${field}.relationshipUpdates.${peerId}.perceivedDistortions`, 16, 600);
      }
      if (update.perceivedReliability !== undefined) {
        requireUnitInterval(update.perceivedReliability, `${field}.relationshipUpdates.${peerId}.perceivedReliability`);
      }
      if (update.perceivedTrend !== undefined) {
        requireString(update.perceivedTrend, `${field}.relationshipUpdates.${peerId}.perceivedTrend`, 600, true);
      }
      if (update.expectedReaction !== undefined) {
        requireString(update.expectedReaction, `${field}.relationshipUpdates.${peerId}.expectedReaction`, 600, true);
      }
    }
  }
  if (reflection.publicFragment !== undefined) {
    requireString(reflection.publicFragment, `${field}.publicFragment`, 2_000, true);
  }
};

const validateRelationships = (value: unknown): void => {
  const field = "snapshot.state.relationships";
  const relationships = requireRecord(value, field, 64);
  for (const [peerId, rawPeer] of Object.entries(relationships)) {
    requireSafeIdentifier(peerId, `${field} key`, 128);
    const peer = requireRecord(rawPeer, `${field}.${peerId}`, 5);
    assertExactKeys(
      peer,
      ["peerId", "perceivedDistortions", "perceivedReliability", "perceivedTrend", "expectedReaction"],
      `${field}.${peerId}`,
    );
    if (requireSafeIdentifier(peer.peerId, `${field}.${peerId}.peerId`, 128) !== peerId) {
      throw new Error(`Relationship map key "${peerId}" does not match peerId.`);
    }
    requireStringArray(peer.perceivedDistortions, `${field}.${peerId}.perceivedDistortions`, 16, 600);
    requireUnitInterval(peer.perceivedReliability, `${field}.${peerId}.perceivedReliability`);
    requireString(peer.perceivedTrend, `${field}.${peerId}.perceivedTrend`, 600, true);
    requireString(peer.expectedReaction, `${field}.${peerId}.expectedReaction`, 600, true);
  }
};

export const validateIndividualSnapshot = (value: unknown): IndividualSnapshot => {
  const root = requireRecord(value, "snapshot", 2);
  assertExactKeys(root, ["manifest", "state"], "snapshot");
  const manifest = validatePersistedManifest(root.manifest);
  const state = requireRecord(root.state, "snapshot.state", 13);
  assertExactKeys(
    state,
    ["individualId", "status", "cycle", "selfConcept", "relationships", "currentSelfPortrait", "selfPortraitHistory", "latestSocialPortrait", "latestSocialPeerPortraits", "lastReflection", "longTermSummary", "createdAt", "updatedAt"],
    "snapshot.state",
  );
  const stateId = requireSafeIdentifier(state.individualId, "snapshot.state.individualId", 128);
  if (manifest.id !== stateId) throw new Error("Snapshot manifest and state IDs do not match.");
  requireEnum(state.status, STATUSES, "snapshot.state.status");
  const stateCycle = requireInteger(state.cycle, "snapshot.state.cycle", 0, 1_000_000_000);
  const createdAt = requireTimestamp(state.createdAt, "snapshot.state.createdAt");
  const updatedAt = requireTimestamp(state.updatedAt, "snapshot.state.updatedAt");
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new Error("snapshot.state.updatedAt precedes createdAt.");
  }

  const selfConcept = requireRecord(state.selfConcept, "snapshot.state.selfConcept", 5);
  assertExactKeys(
    selfConcept,
    ["narrative", "keywords", "confidence", "physicalSelf", "nextBodyAdjustments"],
    "snapshot.state.selfConcept",
  );
  requireString(selfConcept.narrative, "snapshot.state.selfConcept.narrative", 20_000);
  requireStringArray(selfConcept.keywords, "snapshot.state.selfConcept.keywords", 64, 500);
  requireUnitInterval(selfConcept.confidence, "snapshot.state.selfConcept.confidence");
  validatePhysicalSelf(selfConcept.physicalSelf, "snapshot.state.selfConcept.physicalSelf");
  if (selfConcept.nextBodyAdjustments !== undefined) {
    validateBodyAdjustments(selfConcept.nextBodyAdjustments, "snapshot.state.selfConcept.nextBodyAdjustments");
  }
  validateRelationships(state.relationships);

  let current: Portrait | undefined;
  if (state.currentSelfPortrait !== undefined) {
    current = validatePortrait(state.currentSelfPortrait, "snapshot.state.currentSelfPortrait");
    if (
      current.artistId !== stateId ||
      current.subjectId !== stateId ||
      current.role !== "self" ||
      current.cycle !== stateCycle
    ) {
      throw new Error("Current self-portrait provenance is invalid.");
    }
  }

  const history: Portrait[] = [];
  if (state.selfPortraitHistory !== undefined) {
    if (!Array.isArray(state.selfPortraitHistory) || state.selfPortraitHistory.length > 8) {
      throw new Error("snapshot.state.selfPortraitHistory must contain at most 8 portraits.");
    }
    let previousCycle = -1;
    for (const [index, rawPortrait] of state.selfPortraitHistory.entries()) {
      const portrait = validatePortrait(rawPortrait, `snapshot.state.selfPortraitHistory[${index}]`);
      if (
        portrait.artistId !== stateId ||
        portrait.subjectId !== stateId ||
        portrait.role !== "self" ||
        portrait.cycle >= stateCycle ||
        portrait.cycle < previousCycle
      ) {
        throw new Error(`snapshot.state.selfPortraitHistory[${index}] provenance or order is invalid.`);
      }
      previousCycle = portrait.cycle;
      history.push(portrait);
    }
    const ids = history.map((portrait) => portrait.id);
    if (new Set(ids).size !== ids.length || (current && ids.includes(current.id))) {
      throw new Error("snapshot.state.selfPortraitHistory contains duplicate portrait IDs.");
    }
  }

  let persistedSocialPeers: Portrait[] | undefined;
  if (state.latestSocialPeerPortraits !== undefined) {
    if (
      !Array.isArray(state.latestSocialPeerPortraits) ||
      state.latestSocialPeerPortraits.length < 1 ||
      state.latestSocialPeerPortraits.length > 16
    ) {
      throw new Error(
        "snapshot.state.latestSocialPeerPortraits must contain between 1 and 16 portraits.",
      );
    }
    persistedSocialPeers = state.latestSocialPeerPortraits.map((rawPortrait, index) =>
      validatePortrait(
        rawPortrait,
        `snapshot.state.latestSocialPeerPortraits[${index}]`,
      ),
    );
    if (
      Buffer.byteLength(JSON.stringify(persistedSocialPeers), "utf8") >
      MAX_RETAINED_SOCIAL_COHORT_BYTES
    ) {
      throw new Error("snapshot.state.latestSocialPeerPortraits exceeds its retention bound.");
    }
  }

  if (state.latestSocialPortrait !== undefined) {
    const portrait = validatePortrait(state.latestSocialPortrait, "snapshot.state.latestSocialPortrait");
    if (
      portrait.artistId !== "collective" ||
      portrait.subjectId !== stateId ||
      portrait.role !== "social" ||
      portrait.cycle > stateCycle ||
      (persistedSocialPeers !== undefined && portrait.cycle !== stateCycle)
    ) {
      throw new Error("Latest social portrait provenance is invalid.");
    }
    const lineage = portrait.socialEvidence!.sourceSelfPortraitId;
    const sourceSelfPortrait = [current, ...history].find(
      (candidate) => candidate?.id === lineage,
    );
    if (!sourceSelfPortrait) {
      throw new Error("Latest social portrait refers to an unknown self-portrait lineage.");
    }
    if (persistedSocialPeers) {
      const ids = new Set<string>();
      const artists = new Set<string>();
      for (const peer of persistedSocialPeers) {
        if (
          ids.has(peer.id) ||
          artists.has(peer.artistId) ||
          peer.role !== "peer" ||
          peer.subjectId !== stateId ||
          peer.artistId === stateId ||
          peer.sourcePortraitIds.length !== 1 ||
          peer.sourcePortraitIds[0] !== sourceSelfPortrait.id ||
          Date.parse(peer.createdAt) < Date.parse(sourceSelfPortrait.createdAt)
        ) {
          throw new Error("Latest social peer portrait provenance is invalid.");
        }
        ids.add(peer.id);
        artists.add(peer.artistId);
      }
    }
    // Legacy snapshots did not retain source artwork. Continue to validate
    // their embedded claims, but only newly persisted snapshots can expose a
    // complete causal social bundle publicly.
    const contributorPortraits: Portrait[] = persistedSocialPeers ??
      portrait.socialEvidence!.contributions.map((contribution) => ({
        id: contribution.portraitId,
        cycle: portrait.cycle,
        artistId: contribution.artistId,
        subjectId: stateId,
        role: "peer",
        createdAt: portrait.createdAt,
        artwork: {
          format: "procedural",
          width: 1,
          height: 1,
          content: "persisted-social-evidence",
        },
        descriptor: contribution.descriptor,
        observationEvidence: contribution.perceptionEvidence,
        sourcePortraitIds: [sourceSelfPortrait.id],
      }));
    assertCanonicalSocialPortraitClaims({
      portrait,
      sourceSelfPortrait,
      contributorPortraits,
      idealFigure: manifest.identity.idealPhysicalForm.visualSpecification?.figure,
    });
  } else if (persistedSocialPeers) {
    throw new Error("Latest social peer portraits require a social portrait.");
  }
  if (state.lastReflection !== undefined) {
    validateReflection(state.lastReflection, "snapshot.state.lastReflection");
  }
  if (state.longTermSummary !== undefined) {
    requireString(state.longTermSummary, "snapshot.state.longTermSummary", 64 * 1024, true);
  }
  return value as IndividualSnapshot;
};

export {
  validateAnatomy,
  validateBodyAdjustments,
  validateDescriptor,
  validateFigure,
  validateGeometry,
  validatePerceptionEvidence,
  validatePractice,
  validateSocialEvidence,
} from "./visualValidation";
