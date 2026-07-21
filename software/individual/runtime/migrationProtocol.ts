import type { IndividualSnapshot, MemoryEntry } from "../core/model";

export interface MigrationBundle {
  readonly bundleId: string;
  readonly individualId: string;
  readonly sourceSiteId: string;
  readonly destinationSiteId: string;
  readonly exportedAt: string;
  readonly snapshot: IndividualSnapshot;
  readonly memories: readonly MemoryEntry[];
  readonly checksum: string;
}

export class MigrationProtocol {
  static exportBundle(input: {
    snapshot: IndividualSnapshot;
    memories: readonly MemoryEntry[];
    sourceSiteId: string;
    destinationSiteId: string;
  }): MigrationBundle {
    const exportedAt = new Date().toISOString();
    const individualId = input.snapshot.manifest.id;
    const bundleId = `mig-${individualId}-${input.sourceSiteId}->${input.destinationSiteId}-${Date.now()}`;
    const checksum = `chk-${individualId}-c${input.snapshot.state.cycle}-${input.memories.length}`;

    return {
      bundleId,
      individualId,
      sourceSiteId: input.sourceSiteId,
      destinationSiteId: input.destinationSiteId,
      exportedAt,
      snapshot: input.snapshot,
      memories: input.memories,
      checksum,
    };
  }

  static importBundle(
    bundle: MigrationBundle,
    targetSiteId: string,
  ): {
    readonly snapshot: IndividualSnapshot;
    readonly memories: readonly MemoryEntry[];
  } {
    if (bundle.destinationSiteId !== targetSiteId) {
      throw new Error(
        `Migration bundle destination site "${bundle.destinationSiteId}" does not match target site "${targetSiteId}".`,
      );
    }

    if (!bundle.checksum.startsWith(`chk-${bundle.individualId}`)) {
      throw new Error("Migration bundle checksum validation failed.");
    }

    // Append migration provenance entry to snapshot narrative
    const updatedState = {
      ...bundle.snapshot.state,
      selfConcept: {
        ...bundle.snapshot.state.selfConcept,
        narrative: `${bundle.snapshot.state.selfConcept.narrative} (Migrated from ${bundle.sourceSiteId} to ${targetSiteId}).`,
      },
      updatedAt: new Date().toISOString(),
    };

    const migrationMemory: MemoryEntry = {
      id: `mem-mig-${bundle.individualId}-${Date.now()}`,
      individualId: bundle.individualId,
      cycle: bundle.snapshot.state.cycle,
      kind: "relationship",
      content: `Migrated identity handoff from ${bundle.sourceSiteId} to ${targetSiteId}.`,
      createdAt: new Date().toISOString(),
      relatedIndividualIds: [],
    };

    return {
      snapshot: { manifest: bundle.snapshot.manifest, state: updatedState },
      memories: [...bundle.memories, migrationMemory],
    };
  }
}
