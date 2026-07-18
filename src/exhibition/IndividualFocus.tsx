import { PortraitCanvas } from "./PortraitCanvas";
import type { ExhibitionIndividual } from "./types";

interface IndividualFocusProps {
  readonly individual: ExhibitionIndividual;
  readonly people: readonly ExhibitionIndividual[];
  readonly cycle: number;
  readonly onClose: () => void;
  readonly onSelect: (individualId: string) => void;
}

export function IndividualFocus({
  individual,
  people,
  cycle,
  onClose,
  onSelect,
}: IndividualFocusProps) {
  const peers = people.filter((peer) => peer.id !== individual.id);

  return (
    <section className="focus" aria-label={`${individual.name}'s identity`}>
      <div className="focus__portrait">
        <PortraitCanvas individual={individual} cycle={cycle} mode="self" />
        <div className="focus__portrait-label">
          <span>self-portrait</span>
          <span>cycle {String(cycle).padStart(3, "0")}</span>
        </div>
      </div>

      <div className="focus__context">
        <div className="focus__heading">
          <div>
            <p className="eyebrow">Individual {individual.number}</p>
            <h2>{individual.name}</h2>
          </div>
          <button className="text-control focus__close" type="button" onClick={onClose}>
            close <span aria-hidden="true">×</span>
          </button>
        </div>

        <blockquote>{individual.statement}</blockquote>

        <dl className="identity-axis">
          <div>
            <dt>Ideal self</dt>
            <dd>{individual.idealSelf}</dd>
          </div>
          <div>
            <dt>Self view</dt>
            <dd>{individual.selfView}</dd>
          </div>
          <div>
            <dt>The world returns</dt>
            <dd>{individual.socialView}</dd>
          </div>
        </dl>

        <div className="focus__systems">
          <p>
            <span>vision</span>
            {individual.perception}
          </p>
          <p>
            <span>hand</span>
            {individual.drawingConstraint}
          </p>
        </div>
      </div>

      <div className="social-portrait">
        <div className="section-label">
          <span>how the world sees {individual.name}</span>
          <span>{peers.length} perceptions / one image</span>
        </div>
        <div className="social-portrait__art">
          <PortraitCanvas individual={individual} cycle={cycle} mode="social" />
        </div>
      </div>

      <div className="peer-readings">
        <div className="section-label">
          <span>peer interpretations</span>
          <span>before compositing</span>
        </div>
        <div className="peer-readings__grid">
          {peers.map((peer) => (
            <div className="peer-reading" key={peer.id}>
              <div className="peer-reading__art">
                <PortraitCanvas
                  individual={individual}
                  observedBy={peer}
                  cycle={cycle}
                  mode="peer"
                  compact
                />
              </div>
              <p>
                <span>drawn by {peer.name}</span>
                through {peer.pronoun === "they" ? "their" : peer.pronoun === "she" ? "her" : "his"} vision
              </p>
            </div>
          ))}
        </div>
      </div>

      <nav className="focus__neighbors" aria-label="Other Individuals">
        <span>continue to</span>
        {peers.map((peer) => (
          <button type="button" key={peer.id} onClick={() => onSelect(peer.id)}>
            {peer.number} {peer.name}
          </button>
        ))}
      </nav>
    </section>
  );
}
