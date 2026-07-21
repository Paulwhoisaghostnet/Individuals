import type { CycleIntent, IdentityReflection, PeerModel } from "../core/model";
import type { CognitionSystem } from "../core/systems/contracts";

export class ProceduralCognitionSystem implements CognitionSystem {
  async formIntent(input: Parameters<CognitionSystem["formIntent"]>[0]): Promise<CycleIntent> {
    const { manifest, state, cycle } = input;
    const { idealSelf, idealPhysicalForm, socialDisposition } = manifest.identity;
    const currentDiffs = state.selfConcept.physicalSelf.perceivedDifferences;

    // Incorporate relationship models if present
    const relationshipNotes: string[] = [];
    for (const [peerId, model] of Object.entries(state.relationships)) {
      if (model.perceivedDistortions.length > 0) {
        relationshipNotes.push(`Expect ${peerId} to distort: ${model.perceivedDistortions.join(", ")}.`);
      }
    }

    const statement =
      state.lastReflection?.nextIntention ??
      `Cycle ${cycle}: Portraying my ${idealPhysicalForm.bodyPlan} body while keeping ${idealPhysicalForm.nonNegotiableFeatures[0] ?? "my form"}.`;

    return {
      statement,
      desiredQualities: idealSelf.values,
      visualInstructions: [
        ...idealSelf.visualAnchors,
        `Integrity=${socialDisposition.selfIntegrity.toFixed(2)}`,
        `Permeability=${socialDisposition.socialPermeability.toFixed(2)}`,
      ],
      bodilyInstructions: [
        idealPhysicalForm.description,
        ...currentDiffs,
        ...relationshipNotes,
      ],
    };
  }

  async reflect(input: Parameters<CognitionSystem["reflect"]>[0]): Promise<IdentityReflection> {
    const { manifest, state, selfPortrait, socialPortrait, cycle } = input;
    const disp = manifest.identity.socialDisposition;
    const nonNegotiables = manifest.identity.idealPhysicalForm.nonNegotiableFeatures;
    const hasSocialFeedback = socialPortrait !== undefined;

    // Calculate similarity delta influenced by socialPermeability & selfIntegrity
    const baseDelta = hasSocialFeedback ? 0.04 : -0.01;
    const weight = disp.socialPermeability * (1 - disp.selfIntegrity * 0.5);
    const similarityDelta = parseFloat((baseDelta * (0.5 + weight)).toFixed(3));

    const acceptedFeedback: string[] = [];
    const rejectedFeedback: string[] = [];
    const perceivedPeerSignals: Record<string, string[]> = {};
    const relationshipUpdates: Record<string, Partial<PeerModel>> = {};

    if (hasSocialFeedback && socialPortrait.sourcePortraitIds.length > 0) {
      for (const peerPortraitId of socialPortrait.sourcePortraitIds) {
        const parts = peerPortraitId.split("--");
        const peerId = parts[0] ?? "peer";
        const signals = ["perceived silhouette", "noted proportion shift"];
        perceivedPeerSignals[peerId] = signals;

        // Higher trust means more feedback is accepted
        const trust = disp.trustByPeer[peerId] ?? 0.5;
        if (trust >= 0.6) {
          acceptedFeedback.push(`${peerId}'s observation of shoulder height`);
        } else {
          rejectedFeedback.push(`${peerId}'s distortion of limb scale`);
        }

        relationshipUpdates[peerId] = {
          peerId,
          perceivedDistortions: disp.resistance > 0.5 ? ["exaggerates posture"] : ["simplifies line"],
          perceivedReliability: Math.min(1, Math.max(0, trust + (trust >= 0.6 ? 0.05 : -0.05))),
          perceivedTrend: trust >= 0.6 ? "converging" : "diverging",
          expectedReaction: `Will notice ${nonNegotiables[0] ?? "features"}`,
        };
      }
    }

    const nextAdjustment = hasSocialFeedback
      ? `Reconcile social perception with ${nonNegotiables.join(", ")}.`
      : "Hold physical form until peer observations arrive.";

    return {
      summary: hasSocialFeedback
        ? `Cycle ${cycle}: Group reflected a composite body across ${Object.keys(perceivedPeerSignals).length} peers.`
        : `Cycle ${cycle}: Self-portrait completed; awaiting peer resonance.`,
      tensions: hasSocialFeedback
        ? [`ideal (${disp.selfIntegrity}) vs social (${disp.socialPermeability})`]
        : ["unobserved self-representation"],
      nextIntention: hasSocialFeedback
        ? `Adjust perceived posture while holding ${nonNegotiables[0] ?? "identifying features"}.`
        : `Repeat ${manifest.displayName}'s core silhouette to establish baseline.`,
      memory: `Cycle ${cycle} reflection stored: similarity delta=${similarityDelta}.`,
      physicalAssessment: {
        similarityDelta,
        retainedFeatures: nonNegotiables,
        perceivedDifferences: state.selfConcept.physicalSelf.perceivedDifferences,
        nextBodilyAdjustment: nextAdjustment,
      },
      intendedSignals: manifest.identity.idealSelf.visualAnchors,
      perceivedPeerSignals,
      recurringPatterns: hasSocialFeedback ? ["peer disagreement on alignment"] : [],
      acceptedFeedback,
      rejectedFeedback,
      unresolvedQuestions: ["Can social feedback alter non-negotiable features?"],
      relationshipUpdates,
      publicFragment: `${manifest.displayName} cycle ${cycle}: ${hasSocialFeedback ? "reconciling social mirror" : "asserting embodied self"}.`,
    };
  }
}
