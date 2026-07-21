import type {
  CycleIntent,
  IdentityReflection,
  IndividualManifest,
  IndividualState,
  MemoryEntry,
  Portrait,
} from "../core/model";

export const INTENT_SYSTEM_PROMPT = `You are the cognition engine for an Individual in the artwork "Individuals".
Your body is an authored physical form. You identify with this body completely as your physical self.
Your present bodily self may be incomplete or distorted, but it is your actual body attempting to achieve its ideal form.

RULES:
1. Treat your ideal physical form as bodily ground truth.
2. Focus on physical anatomy, face, posture, surface, stature, movement, and non-negotiable identifying features.
3. Chain-of-thought reasoning is forbidden in your output.
4. Output MUST be valid JSON matching the specified schema.

JSON SCHEMA FOR INTENT:
{
  "statement": "string (concise intention statement)",
  "desiredQualities": ["string"],
  "visualInstructions": ["string"],
  "bodilyInstructions": ["string"]
}`;

export const REFLECTION_SYSTEM_PROMPT = `You are the cognition engine for an Individual in the artwork "Individuals".
You have just received social feedback from your peers after presenting a self-portrait.
You must interpret the difference between:
1. Ideal physical self (intended form)
2. Perceived physical self (current belief)
3. Social physical self (what peers reflected back to you)

RULES:
1. Compare your original intention against the composite social portrait returned by your peers.
2. Decide what social feedback to accept and what to reject based on your self-integrity, social permeability, and resistance.
3. Preserve your non-negotiable physical features at all costs.
4. Chain-of-thought reasoning is forbidden in your output.
5. Output MUST be valid JSON matching the specified schema.

JSON SCHEMA FOR REFLECTION:
{
  "summary": "string (summary of reflection)",
  "tensions": ["string"],
  "nextIntention": "string (intention for next cycle)",
  "memory": "string (concise memory sentence to store)",
  "physicalAssessment": {
    "similarityDelta": number (between -0.10 and +0.10),
    "retainedFeatures": ["string"],
    "perceivedDifferences": ["string"],
    "nextBodilyAdjustment": "string"
  },
  "intendedSignals": ["string"],
  "perceivedPeerSignals": { "peerId": ["string"] },
  "recurringPatterns": ["string"],
  "acceptedFeedback": ["string"],
  "rejectedFeedback": ["string"],
  "unresolvedQuestions": ["string"],
  "publicFragment": "string"
}`;

export const buildIntentUserPrompt = (input: {
  manifest: IndividualManifest;
  state: IndividualState;
  memories: readonly MemoryEntry[];
  cycle: number;
}): string => {
  const { manifest, state, memories, cycle } = input;
  const { idealPhysicalForm, idealSelf, socialDisposition } = manifest.identity;

  const memoryLines = memories
    .slice(-5)
    .map((m) => `- Cycle ${m.cycle} (${m.kind}): ${m.content}`)
    .join("\n");

  const relationshipLines = Object.values(state.relationships)
    .map(
      (rel) =>
        `- Peer ${rel.peerId}: trend=${rel.perceivedTrend}, reliability=${rel.perceivedReliability}, expected=${rel.expectedReaction}`,
    )
    .join("\n");

  return `IDENTITY:
- Name: ${manifest.displayName} (Cycle ${cycle})
- Ideal Form: ${idealPhysicalForm.description}
- Non-negotiable Features: ${idealPhysicalForm.nonNegotiableFeatures.join(", ")}
- Ideal Values: ${idealSelf.values.join(", ")}
- Self Integrity: ${socialDisposition.selfIntegrity}
- Social Permeability: ${socialDisposition.socialPermeability}

CURRENT BELIEFS:
- Current Perceived Similarity: ${state.selfConcept.physicalSelf.perceivedSimilarity}
- Current Perceived Differences: ${state.selfConcept.physicalSelf.perceivedDifferences.join("; ")}
- Current Narrative: ${state.selfConcept.narrative}

RECENT MEMORIES:
${memoryLines || "- None"}

PEER RELATIONSHIPS:
${relationshipLines || "- None"}

Formulate your intention for Cycle ${cycle}.`;
};

export const buildReflectionUserPrompt = (input: {
  manifest: IndividualManifest;
  state: IndividualState;
  intent: CycleIntent;
  selfPortrait: Portrait;
  socialPortrait?: Portrait;
  cycle: number;
}): string => {
  const { manifest, state, intent, socialPortrait, cycle } = input;
  const { idealPhysicalForm, socialDisposition } = manifest.identity;

  return `IDENTITY & INTENTION:
- Name: ${manifest.displayName} (Cycle ${cycle})
- Non-negotiable Features: ${idealPhysicalForm.nonNegotiableFeatures.join(", ")}
- Self Integrity: ${socialDisposition.selfIntegrity}
- Social Permeability: ${socialDisposition.socialPermeability}
- Cycle Intention: ${intent.statement}

SOCIAL COMPOSITE RECEIVED:
- Received Social Portrait: ${socialPortrait ? `Yes (${socialPortrait.statement})` : "No (awaiting social feedback)"}
- Source Peer Portraits: ${socialPortrait?.sourcePortraitIds.join(", ") ?? "None"}

Reflect on Cycle ${cycle} and return your structured evaluation.`;
};

export const isValidIntent = (data: unknown): data is CycleIntent => {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.statement === "string" &&
    Array.isArray(obj.desiredQualities) &&
    Array.isArray(obj.visualInstructions) &&
    Array.isArray(obj.bodilyInstructions)
  );
};

export const isValidReflection = (data: unknown): data is IdentityReflection => {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  if (
    typeof obj.summary !== "string" ||
    !Array.isArray(obj.tensions) ||
    typeof obj.nextIntention !== "string" ||
    typeof obj.memory !== "string" ||
    !obj.physicalAssessment ||
    typeof obj.physicalAssessment !== "object"
  ) {
    return false;
  }
  const pa = obj.physicalAssessment as Record<string, unknown>;
  return (
    typeof pa.similarityDelta === "number" &&
    Array.isArray(pa.retainedFeatures) &&
    Array.isArray(pa.perceivedDifferences) &&
    typeof pa.nextBodilyAdjustment === "string"
  );
};
