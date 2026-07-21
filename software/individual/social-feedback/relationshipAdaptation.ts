import type { PeerModel } from "../core/model";
import type { RelationshipAdaptationSystem } from "../core/systems/contracts";
import { figureDistance } from "../core/figureGeometry";

const safePeerId = (value: string): boolean =>
  /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/.test(value) &&
  !["__proto__", "prototype", "constructor"].includes(value);

/** Updates peer models from structured evidence, never from LLM assertions. */
export class DeterministicRelationshipAdaptationSystem
  implements RelationshipAdaptationSystem
{
  async adapt(
    input: Parameters<RelationshipAdaptationSystem["adapt"]>[0],
  ): Promise<Readonly<Record<string, PeerModel>>> {
    const relationships: Record<string, PeerModel> = Object.fromEntries(
      Object.entries(input.state.relationships)
        .filter(([peerId]) => safePeerId(peerId))
        .map(([peerId, model]) => [peerId, { ...model, peerId }]),
    );

    for (const contribution of input.evidence?.contributions ?? []) {
      const peerId = contribution.artistId;
      if (!safePeerId(peerId)) continue;
      const authoredTrust = input.manifest.identity.socialDisposition.trustByPeer[peerId];
      const previous = relationships[peerId] ?? {
        peerId,
        perceivedDistortions: [],
        perceivedReliability: authoredTrust ?? 0.5,
        perceivedTrend: "unresolved",
        expectedReaction: "insufficient evidence",
      };
      const perceptionMagnitude =
        contribution.perceptionEvidence?.effects.reduce(
          (sum, effect) => sum + Math.min(1, Math.abs(effect.magnitude)),
          0,
        ) ?? 0;
      const effectCount = contribution.perceptionEvidence?.effects.length ?? 0;
      const perceptualPenalty = effectCount > 0 ? perceptionMagnitude / effectCount : 0.25;
      const observedReliability = Math.max(
        0,
        Math.min(1, contribution.descriptor.confidence * (1 - perceptualPenalty * 0.35)),
      );
      const reliability =
        previous.perceivedReliability +
        (observedReliability - previous.perceivedReliability) * 0.18;
      const distanceFromConsensus = input.evidence
        ? figureDistance(contribution.descriptor.figure, input.evidence.consensus.figure)
        : 0;
      const distortions = [
        ...(contribution.perceptionEvidence?.effects.map(
          (effect) => `${effect.operation}:${effect.dimension}`,
        ) ?? []),
        ...contribution.descriptor.omittedFeatures.map((feature) => `omits:${feature}`),
      ].slice(0, 16);

      relationships[peerId] = {
        peerId,
        perceivedDistortions: distortions,
        perceivedReliability: Number(reliability.toFixed(4)),
        perceivedTrend:
          distanceFromConsensus < 0.035
            ? "near current consensus"
            : "maintaining distinct perception",
        expectedReaction: `Expected geometric distance ${distanceFromConsensus.toFixed(3)} from group consensus.`,
      };
    }
    return relationships;
  }
}
