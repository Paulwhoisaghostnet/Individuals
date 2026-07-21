import type { ArtworkDisplayMode } from "../runtime/types";

export type PortraitRoleLabel = "portrait" | "self-portrait" | "social portrait" | "peer drawing";

/** Visible language for generated substitutes; never labels a local study as live artwork. */
export const localPortraitProvenance = (
  artworkMode: ArtworkDisplayMode,
  role: PortraitRoleLabel,
): string | undefined => {
  if (artworkMode === "local-simulation") return undefined;
  if (artworkMode === "verified-live") return `local study · awaiting live ${role}`;
  return `unverified local study · awaiting runtime ${role}`;
};
