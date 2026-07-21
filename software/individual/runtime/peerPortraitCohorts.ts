import type { CycleRecord, IndividualSnapshot, Portrait } from "../core/model";

/** Routes pending peer interpretations of the exact self portrait currently on each canvas. */
export class PeerPortraitCohorts {
  private selfPortraits: Portrait[] = [];
  private peerPortraitsBySubject = new Map<string, Portrait[]>();

  hydrate(snapshots: readonly IndividualSnapshot[]): void {
    this.selfPortraits = snapshots.flatMap((snapshot) =>
      snapshot.state.currentSelfPortrait ? [snapshot.state.currentSelfPortrait] : [],
    );
    this.peerPortraitsBySubject = new Map();
  }

  cycleInput(individualId: string, persistedSelfPortraitId: string | undefined): {
    readonly peerSelfPortraits: readonly Portrait[];
    readonly receivedPeerPortraits: readonly Portrait[];
  } {
    const peerSelfPortraits = this.selfPortraits.filter(
      (portrait) => portrait.subjectId !== individualId,
    );
    const receivedPeerPortraits = persistedSelfPortraitId
      ? (this.peerPortraitsBySubject.get(individualId) ?? []).filter(
          (portrait) =>
            portrait.sourcePortraitIds.length === 1 &&
            portrait.sourcePortraitIds[0] === persistedSelfPortraitId,
        )
      : [];
    return { peerSelfPortraits, receivedPeerPortraits };
  }

  apply(record: CycleRecord): void {
    this.selfPortraits = [
      ...this.selfPortraits.filter((portrait) => portrait.subjectId !== record.individualId),
      record.selfPortrait,
    ];
    this.peerPortraitsBySubject.set(record.individualId, []);

    for (const peerPortrait of record.peerPortraits) {
      const expectedSource = this.selfPortraits.find(
        (portrait) => portrait.subjectId === peerPortrait.subjectId,
      );
      if (
        !expectedSource ||
        peerPortrait.sourcePortraitIds.length !== 1 ||
        peerPortrait.sourcePortraitIds[0] !== expectedSource.id
      ) {
        continue;
      }
      const cohort = this.peerPortraitsBySubject.get(peerPortrait.subjectId) ?? [];
      this.peerPortraitsBySubject.set(peerPortrait.subjectId, [
        ...cohort.filter(
          (portrait) =>
            portrait.artistId !== record.individualId &&
            portrait.sourcePortraitIds.length === 1 &&
            portrait.sourcePortraitIds[0] === expectedSource.id,
        ),
        peerPortrait,
      ]);
    }
  }
}
