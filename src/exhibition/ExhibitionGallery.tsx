import { PortraitCanvas } from "./PortraitCanvas";
import { localPortraitProvenance } from "./portrait/provenance";
import type { ArtworkDisplayMode, RuntimeIndividualView } from "./runtime/types";
import type { ExhibitionIndividual } from "./types";

interface ExhibitionGalleryProps {
  readonly people: readonly ExhibitionIndividual[];
  readonly runtime: Readonly<Record<string, RuntimeIndividualView>>;
  readonly artworkMode: ArtworkDisplayMode;
  readonly onSelect: (individualId: string) => void;
}

export function ExhibitionGallery({ people, runtime, artworkMode, onSelect }: ExhibitionGalleryProps) {
  return (
    <section className="gallery" aria-label="The society">
      {people.map((individual, index) => {
        const presence = runtime[individual.id];
        const cycle = presence?.cycle ?? 0;
        const provenance = !presence?.portraits.self
          ? localPortraitProvenance(artworkMode, "portrait")
          : undefined;
        const descriptionId = `${individual.id}-gallery-description`;
        return (
          <article className="individual" key={individual.id} style={{ "--order": index } as React.CSSProperties}>
            <button
              className="individual__canvas"
              type="button"
              data-individual-trigger={individual.id}
              onClick={() => onSelect(individual.id)}
              aria-label={`Enter ${individual.name}'s portrait`}
              aria-describedby={descriptionId}
            >
              <PortraitCanvas
                individual={individual}
                cycle={cycle}
                artwork={presence?.portraits.self}
              />
              {provenance && <span className="portrait-provenance">{provenance}</span>}
              <span className="individual__invitation" aria-hidden="true">
                enter portrait
              </span>
            </button>
            <div className="individual__caption" id={descriptionId}>
              <span>
                <span className="individual__number">{individual.number}</span>
                <span className="individual__name">{individual.name}</span>
              </span>
              <span className={`individual__state individual__state--${presence?.phase ?? "idle"}`}>
                <span className="state-signal" aria-hidden="true" />
                {presence?.activity ?? "awaiting runtime"}
              </span>
            </div>
          </article>
        );
      })}
    </section>
  );
}
