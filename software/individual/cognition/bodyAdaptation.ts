import type { FigureDescriptor, SelfConcept } from "../core/model";
import type { AdaptationSystem } from "../core/systems/contracts";
import { calculateCoherencePressure } from "./coherence";
import { deriveCausalPublicLanguage } from "./causalLanguage";

const resolveCurrentBelief = (
  input: Parameters<AdaptationSystem["adapt"]>[0],
  ideal: FigureDescriptor,
): FigureDescriptor =>
  input.state.selfConcept.physicalSelf.bodyBelief ??
  input.state.currentSelfPortrait?.descriptor?.figure ??
  input.manifest.identity.initialPhysicalSelf.bodyBelief ??
  ideal;

/**
 * Deterministic identity adaptation. LLM prose may narrate this transition but
 * cannot cause it; only authored geometry and normalized social evidence do.
 */
export class EvidenceBodyAdaptationSystem implements AdaptationSystem {
  async adapt(input: Parameters<AdaptationSystem["adapt"]>[0]): Promise<SelfConcept> {
    const visual = input.manifest.identity.idealPhysicalForm.visualSpecification;
    if (!visual) return input.state.selfConcept;

    const ideal = visual.figure;
    const current = resolveCurrentBelief(input, ideal);
    const evidence = input.socialPortrait?.socialEvidence;
    const disposition = input.manifest.identity.socialDisposition;
    const pressure = calculateCoherencePressure({
      idealFigure: ideal,
      embodiedPrior:
        input.manifest.identity.initialPhysicalSelf.bodyBelief ?? current,
      currentFigure: current,
      selfIntegrity: disposition.selfIntegrity,
      socialPermeability: disposition.socialPermeability,
      resistance: disposition.resistance,
      curiosity: disposition.curiosity,
      evidence,
    });
    const disagreement = evidence
      ? evidence.disagreements.reduce((sum, item) => sum + item.spread, 0) /
        Math.max(1, evidence.disagreements.length)
      : 0;
    const evidenceConfidence = evidence?.confidence ?? 0.4;
    const confidenceTarget = Math.max(
      0.08,
      Math.min(0.92, 0.38 + evidenceConfidence * 0.45 - disagreement * 0.25),
    );
    const confidence =
      input.state.selfConcept.confidence +
      (confidenceTarget - input.state.selfConcept.confidence) * 0.12;
    const publicLanguage = deriveCausalPublicLanguage({
      manifest: input.manifest,
      cycle: input.cycle,
      evidence,
    });

    return {
      narrative: publicLanguage.nextIntention,
      keywords: [...input.state.selfConcept.keywords],
      confidence: Number(confidence.toFixed(4)),
      nextBodyAdjustments: pressure.nextBodyAdjustments,
      physicalSelf: {
        ...input.state.selfConcept.physicalSelf,
        bodyBelief: pressure.adjustedFigure,
        perceivedSimilarity: pressure.predictedSimilarity,
        perceivedDifferences: publicLanguage.perceivedDifferences,
      },
    };
  }
}
