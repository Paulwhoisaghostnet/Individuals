import { getPresence } from "./cycle";
import { PortraitCanvas } from "./PortraitCanvas";
import type { ExhibitionIndividual } from "./types";

interface ExhibitionGalleryProps {
  readonly people: readonly ExhibitionIndividual[];
  readonly cycle: number;
  readonly onSelect: (individualId: string) => void;
}

export function ExhibitionGallery({ people, cycle, onSelect }: ExhibitionGalleryProps) {
  return (
    <section className="gallery" aria-label="The society">
      {people.map((individual, index) => {
        const presence = getPresence(individual, people, cycle);
        return (
          <article className="individual" key={individual.id} style={{ "--order": index } as React.CSSProperties}>
            <button
              className="individual__canvas"
              type="button"
              onClick={() => onSelect(individual.id)}
              aria-label={`Enter ${individual.name}'s portrait`}
            >
              <PortraitCanvas individual={individual} cycle={cycle} />
              <span className="individual__invitation" aria-hidden="true">
                enter portrait
              </span>
            </button>
            <button className="individual__caption" type="button" onClick={() => onSelect(individual.id)}>
              <span>
                <span className="individual__number">{individual.number}</span>
                <span className="individual__name">{individual.name}</span>
              </span>
              <span className={`individual__state individual__state--${presence.phase}`}>
                <span className="state-signal" aria-hidden="true" />
                {presence.activity}
              </span>
            </button>
          </article>
        );
      })}
    </section>
  );
}
