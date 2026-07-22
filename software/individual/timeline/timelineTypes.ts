import type { MemoryEntry, PortraitRole } from "../core/model";
import type { ValidatedPublicSvg } from "../security/publicSvg";

export const MAX_TIMELINE_INDIVIDUALS = 17;
export const MAX_TIMELINE_SELF_PORTRAITS = 9;
export const MAX_TIMELINE_PEER_PORTRAITS = 16;
export const MAX_TIMELINE_ARTWORK_BYTES = 20 * 1024 * 1024;
export const MAX_PRIVATE_MEMORIES_PER_CYCLE = 8;

export const PRIVATE_MEMORY_EXPORT_ACKNOWLEDGEMENT =
  "I_UNDERSTAND_PRIVATE_MEMORY_WILL_BE_WRITTEN_TO_A_PORTABLE_HTML_FILE";

export interface TimelinePortrait {
  readonly id: string;
  readonly role: PortraitRole;
  readonly cycle: number;
  readonly artistId: string;
  readonly subjectId: string;
  readonly createdAt: string;
  readonly width: number;
  readonly height: number;
  readonly svg: ValidatedPublicSvg;
}

export interface TimelineMemoryGroup {
  readonly cycle: number;
  readonly entries: readonly MemoryEntry[];
  readonly omittedCount: number;
}

export interface TimelineIndividual {
  readonly id: string;
  readonly displayName: string;
  readonly cycle: number;
  readonly updatedAt: string;
  readonly selfPortraits: readonly TimelinePortrait[];
  readonly omittedSelfPortraitCount: number;
  readonly socialPortrait?: TimelinePortrait;
  readonly peerPortraits: readonly TimelinePortrait[];
  readonly omittedPeerPortraitCount: number;
  readonly privateMemoryGroups?: readonly TimelineMemoryGroup[];
}

export interface TimelineDocument {
  readonly generatedAt: string;
  readonly sourceKind: "validated-retained-snapshots";
  readonly includesPrivateMemory: boolean;
  readonly individuals: readonly TimelineIndividual[];
}

export interface TimelineLoadOptions {
  readonly dataDir?: string;
  readonly individualIds?: readonly string[];
  readonly maxSelfPortraits?: number;
  readonly maxPeerPortraits?: number;
  readonly privateMemoryAcknowledgement?: string;
  readonly now?: () => Date;
}
