import type {
  InboundSequenceState,
  InterSiteBridgeState,
  InterSiteStateLimits,
} from "./interSiteState";

export const acceptInboundSequence = (
  state: InterSiteBridgeState,
  sourceSiteId: string,
  sequence: number,
  limits: Pick<InterSiteStateLimits, "maxSequenceAdvance" | "maxReceivedAheadPerSource">,
): InterSiteBridgeState["inboundSequenceBySource"] => {
  const current: InboundSequenceState = state.inboundSequenceBySource[sourceSiteId] ?? {
    contiguousThrough: 0,
    receivedAhead: [],
  };
  if (sequence <= current.contiguousThrough || current.receivedAhead.includes(sequence)) {
    throw new Error(
      `Inter-site sequence ${sequence} from "${sourceSiteId}" was already applied under another message ID.`,
    );
  }
  if (sequence > current.contiguousThrough + limits.maxSequenceAdvance) {
    throw new Error("Inter-site sequence is too far ahead of the persisted high-water mark.");
  }
  let contiguousThrough = current.contiguousThrough;
  const receivedAhead = [...current.receivedAhead, sequence].sort((left, right) => left - right);
  while (receivedAhead[0] === contiguousThrough + 1) {
    contiguousThrough = receivedAhead.shift()!;
  }
  if (receivedAhead.length > limits.maxReceivedAheadPerSource) {
    throw new Error("Inter-site out-of-order sequence gap capacity is exhausted.");
  }
  return {
    ...state.inboundSequenceBySource,
    [sourceSiteId]: { contiguousThrough, receivedAhead },
  };
};
