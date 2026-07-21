import type {
  InterSiteEnvelope,
  MultiLocationSiteConfig,
  PublicPortraitShare,
} from "./interSiteProtocol";

const owns = (site: MultiLocationSiteConfig, individualId: string): boolean =>
  site.localIndividualIds.includes(individualId);

const requireOwned = (
  site: MultiLocationSiteConfig,
  individualId: string,
  role: string,
): void => {
  if (!owns(site, individualId)) {
    throw new Error(
      `Inter-site ownership violation: ${role} "${individualId}" is not owned by site "${site.siteId}".`,
    );
  }
};

const authorizePortrait = (
  portrait: PublicPortraitShare,
  source: MultiLocationSiteConfig,
  destination: MultiLocationSiteConfig,
): void => {
  switch (portrait.role) {
    case "self":
      requireOwned(source, portrait.artistId, "self-portrait artist");
      requireOwned(source, portrait.subjectId, "self-portrait subject");
      if (portrait.artistId !== portrait.subjectId) {
        throw new Error("Inter-site ownership violation: a self portrait must be authored by its subject.");
      }
      return;

    case "peer":
      requireOwned(source, portrait.artistId, "peer-portrait artist");
      requireOwned(destination, portrait.subjectId, "peer-portrait subject");
      return;

    case "social":
      if (portrait.artistId !== "collective") {
        throw new Error(
          "Inter-site ownership violation: a social portrait must identify its artist as the collective.",
        );
      }
      requireOwned(source, portrait.subjectId, "social-portrait subject");
      return;
  }
};

/**
 * Authorizes the identities claimed by an already schema-validated envelope.
 *
 * Public identity signals and self/social portraits describe source-owned
 * Individuals. A peer portrait is routed directly from its source-owned
 * artist to the destination-owned subject. This prevents a site from acting
 * as an Individual it does not host or forwarding claims on a third site's
 * behalf.
 */
export const assertInterSitePayloadOwnership = (
  envelope: InterSiteEnvelope,
  source: MultiLocationSiteConfig,
  destination: MultiLocationSiteConfig,
): void => {
  if (
    envelope.sourceSiteId !== source.siteId ||
    envelope.destinationSiteId !== destination.siteId
  ) {
    throw new Error("Inter-site ownership authorization received mismatched route metadata.");
  }

  if (envelope.payload.type === "public_identity_signal") {
    requireOwned(source, envelope.payload.signal.individualId, "identity signal Individual");
    return;
  }

  authorizePortrait(envelope.payload.portrait, source, destination);
  requireOwned(
    source,
    envelope.payload.portrait.identitySignal.individualId,
    "attached identity signal Individual",
  );
};
