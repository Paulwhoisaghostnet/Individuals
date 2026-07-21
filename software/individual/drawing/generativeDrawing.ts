import type { ArtworkDescriptor, Portrait } from "../core/model";
import type { DrawingSystem, IdGenerator } from "../core/systems/contracts";

import {
  describeIntendedSelf,
  descriptorForPortrait,
  renderThroughAbility,
} from "./figureDescriptor";
import { renderArtworkSvg } from "./svgRenderer";

const perceivedTarget = (
  observation: Parameters<DrawingSystem["drawPeer"]>[0]["observation"],
): ArtworkDescriptor => observation.evidence?.perceived ?? descriptorForPortrait(observation.sourcePortrait);

/**
 * Draws authored bodies from structured geometry. Perception supplies the
 * target the artist believes it saw; artistic ability then introduces a
 * second, independent rendering error. Source markup is never embedded.
 */
export class GenerativeDrawingSystem implements DrawingSystem {
  constructor(private readonly ids: IdGenerator) {}

  async drawSelf(input: Parameters<DrawingSystem["drawSelf"]>[0]): Promise<Portrait> {
    const { manifest, state, cycle, createdAt, intent } = input;
    const internalBody = describeIntendedSelf(manifest, state, intent);
    const descriptor = renderThroughAbility(
      internalBody,
      manifest.drawing.ability,
      `${manifest.id}:self`,
    );
    const title = `${manifest.displayName} — self / cycle ${cycle}`;
    const publicStatement = `${manifest.displayName} self-portrait, cycle ${cycle}.`;

    return {
      id: this.ids.create([manifest.id, cycle, "self"]),
      cycle,
      artistId: manifest.id,
      subjectId: manifest.id,
      role: "self",
      createdAt,
      artwork: {
        format: "svg",
        width: 800,
        height: 1000,
        content: renderArtworkSvg({
          title,
          // Intent prose can originate with a remote provider and is private.
          // Public artifacts use only authored labels and cycle metadata.
          subtitle: `${manifest.drawing.ability.styleName} / cycle ${cycle}`,
          descriptor,
          palette: manifest.drawing.palette,
          dataRole: "self",
        }),
      },
      descriptor,
      statement: publicStatement,
      sourcePortraitIds: [],
    };
  }

  async drawPeer(input: Parameters<DrawingSystem["drawPeer"]>[0]): Promise<Portrait> {
    const { manifest, observation, cycle, createdAt, intent } = input;
    const subjectId = observation.subjectId;
    const descriptor = renderThroughAbility(
      perceivedTarget(observation),
      manifest.drawing.ability,
      `${manifest.id}:peer:${subjectId}`,
      { subject: "observed-peer" },
    );
    const title = `${subjectId} as perceived by ${manifest.displayName}`;

    return {
      id: this.ids.create([manifest.id, cycle, "peer", subjectId]),
      cycle,
      artistId: manifest.id,
      subjectId,
      role: "peer",
      createdAt,
      artwork: {
        format: "svg",
        width: 800,
        height: 1000,
        content: renderArtworkSvg({
          title,
          subtitle: `${manifest.drawing.ability.styleName} / cycle ${cycle}`,
          descriptor,
          palette: manifest.drawing.palette,
          dataRole: "peer",
        }),
      },
      descriptor,
      observationEvidence: observation.evidence,
      statement: observation.notes.join(" "),
      sourcePortraitIds: [observation.sourcePortrait.id],
    };
  }
}
