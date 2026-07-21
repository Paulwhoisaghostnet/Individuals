import type {
  CycleIntent,
  IdentityReflection,
  SocialFeedbackEvidence,
} from "../core/model";
import type { CognitionSystem } from "../core/systems/contracts";
import { adjustmentsToward } from "../core/figureGeometry";

import { calculateCoherencePressure } from "./coherence";
import {
  FIGURE_DIMENSION_LABELS,
  deriveCausalPublicLanguage,
} from "./causalLanguage";

const evidenceFrom = (input: Parameters<CognitionSystem["reflect"]>[0]): SocialFeedbackEvidence | undefined =>
  input.socialEvidence ?? input.socialPortrait?.socialEvidence;

export class ProceduralCognitionSystem implements CognitionSystem {
  async formIntent(input: Parameters<CognitionSystem["formIntent"]>[0]): Promise<CycleIntent> {
    const { manifest, state, cycle } = input;
    const { idealSelf, idealPhysicalForm, socialDisposition } = manifest.identity;
    const relationshipNotes = Object.values(state.relationships)
      .filter((model) => model.perceivedDistortions.length > 0)
      .map(
        (model) =>
          `Treat ${model.peerId}'s recurring ${model.perceivedDistortions.join(", ")} as situated evidence, not bodily fact.`,
      );
    const lastAdjustment = state.lastReflection?.physicalAssessment.nextBodilyAdjustment;
    const statement =
      state.lastReflection?.nextIntention ??
      `Cycle ${cycle}: portray my ${idealPhysicalForm.bodyPlan} body while preserving ${idealPhysicalForm.nonNegotiableFeatures[0] ?? "my identifying form"}.`;

    return {
      statement,
      desiredQualities: [...idealSelf.values],
      visualInstructions: [
        ...idealSelf.visualAnchors,
        ...(lastAdjustment ? [lastAdjustment] : []),
        `Keep self-integrity at ${socialDisposition.selfIntegrity.toFixed(2)} while admitting partial social evidence.`,
      ],
      bodilyInstructions: [
        idealPhysicalForm.description,
        ...state.selfConcept.physicalSelf.perceivedDifferences,
        ...relationshipNotes,
      ],
      bodyAdjustments:
        state.selfConcept.nextBodyAdjustments ??
        (idealPhysicalForm.visualSpecification && state.selfConcept.physicalSelf.bodyBelief
          ? adjustmentsToward({
              from: state.selfConcept.physicalSelf.bodyBelief,
              target: idealPhysicalForm.visualSpecification.figure,
              rate: 0.2,
              basis: "ideal",
              maximumMagnitude: 0.025,
            })
          : []),
    };
  }

  async reflect(input: Parameters<CognitionSystem["reflect"]>[0]): Promise<IdentityReflection> {
    const { manifest, state, cycle } = input;
    const disposition = manifest.identity.socialDisposition;
    const nonNegotiables = manifest.identity.idealPhysicalForm.nonNegotiableFeatures;
    const evidence = evidenceFrom(input);
    const hasSocialFeedback = evidence !== undefined && evidence.contributions.length > 0;
    const idealFigure = manifest.identity.idealPhysicalForm.visualSpecification?.figure;
    const currentFigure =
      state.selfConcept.physicalSelf.bodyBelief ??
      state.currentSelfPortrait?.descriptor?.figure ??
      idealFigure;
    const pressure =
      idealFigure && currentFigure
        ? calculateCoherencePressure({
            idealFigure,
            embodiedPrior:
              manifest.identity.initialPhysicalSelf.bodyBelief ?? currentFigure,
            currentFigure,
            selfIntegrity: disposition.selfIntegrity,
            socialPermeability: disposition.socialPermeability,
            resistance: disposition.resistance,
            curiosity: disposition.curiosity,
            evidence,
          })
        : {
            similarityDelta: 0,
            currentSimilarity: state.selfConcept.physicalSelf.perceivedSimilarity,
            predictedSimilarity: state.selfConcept.physicalSelf.perceivedSimilarity,
            disagreement: 0,
            socialDistance: 0,
            adjustedFigure: currentFigure,
            nextBodyAdjustments: [],
            geometry: {
              selfIdealDistance: 1 - state.selfConcept.physicalSelf.perceivedSimilarity,
              predictedIdealDistance: 1 - state.selfConcept.physicalSelf.perceivedSimilarity,
            },
          };
    const materialDifferences = (evidence?.comparisonToSelf ?? [])
      .filter((difference) => Math.abs(difference.delta) >= 0.008)
      .slice(0, 3);
    const strongestDifference = materialDifferences[0];
    const publicLanguage = deriveCausalPublicLanguage({ manifest, cycle, evidence });
    const perceivedPeerSignals: Record<string, string[]> = {};
    const acceptedFeedback: string[] = [];
    const rejectedFeedback: string[] = [];

    for (const contribution of evidence?.contributions ?? []) {
      const peerId = contribution.artistId;
      const trust = disposition.trustByPeer[peerId] ?? 0.5;
      const signals = [
        contribution.descriptor.features[0]?.label ?? "bodily silhouette",
        contribution.descriptor.styleName,
        `evidence confidence ${contribution.descriptor.confidence.toFixed(2)}`,
      ];
      perceivedPeerSignals[peerId] = signals;
      const acceptanceThreshold = 0.45 + disposition.resistance * 0.3;
      if (trust * contribution.descriptor.confidence >= acceptanceThreshold) {
        acceptedFeedback.push(`${peerId}: ${signals[0]}`);
      } else {
        rejectedFeedback.push(
          `${peerId}: low-confidence ${signals[0]} retained as disagreement, not fact`,
        );
      }
    }

    const adjustment = publicLanguage.nextBodilyAdjustment;
    const tensionDimension = evidence?.disagreements[0];
    const tensions = hasSocialFeedback
      ? [
          `ideal distance ${pressure.geometry.selfIdealDistance.toFixed(3)} becomes ${pressure.geometry.predictedIdealDistance.toFixed(3)} after bounded adaptation`,
          tensionDimension
            ? `peers disagree most about ${FIGURE_DIMENSION_LABELS[tensionDimension.dimension]} (spread ${tensionDimension.spread.toFixed(3)})`
            : "the social image remains incomplete",
        ]
      : ["self-expression remains untested by a returned peer image"];

    return {
      summary: hasSocialFeedback
        ? `Cycle ${cycle}: Group reflected a composite body across ${evidence.contributions.length} peers; coherence remains provisional.`
        : `Cycle ${cycle}: Self-portrait completed; awaiting peer resonance.`,
      tensions,
      nextIntention: publicLanguage.nextIntention,
      memory: hasSocialFeedback
        ? `Cycle ${cycle}: peer distance ${pressure.socialDistance.toFixed(3)}, disagreement ${pressure.disagreement.toFixed(3)}, coherence shift ${pressure.similarityDelta >= 0 ? "+" : ""}${pressure.similarityDelta.toFixed(3)}.`
        : `Cycle ${cycle}: no social image returned; I held my current bodily claim.`,
      physicalAssessment: {
        similarityDelta: pressure.similarityDelta,
        retainedFeatures: [...nonNegotiables],
        perceivedDifferences: publicLanguage.perceivedDifferences,
        nextBodilyAdjustment: adjustment,
        nextBodyAdjustments: pressure.nextBodyAdjustments,
        geometry: pressure.geometry,
      },
      intendedSignals: [...manifest.identity.idealSelf.visualAnchors],
      perceivedPeerSignals,
      recurringPatterns: tensionDimension
        ? [`recurring disagreement around ${FIGURE_DIMENSION_LABELS[tensionDimension.dimension]}`]
        : [],
      acceptedFeedback,
      rejectedFeedback,
      unresolvedQuestions: hasSocialFeedback
        ? [
            `Is the returned ${strongestDifference ? FIGURE_DIMENSION_LABELS[strongestDifference.dimension] : "silhouette"} about my body, or about how my peers are able to see and draw?`,
          ]
        : ["Which parts of this body will survive another person's perception?"],
      publicFragment: publicLanguage.publicFragment,
    };
  }
}
