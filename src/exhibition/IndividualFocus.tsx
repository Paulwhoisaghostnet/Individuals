import { PortraitCanvas } from "./PortraitCanvas";
import { localPortraitProvenance } from "./portrait/provenance";
import type { ArtworkDisplayMode, RuntimeIndividualView } from "./runtime/types";
import type { ExhibitionIndividual, PerceptionTuningMap } from "./types";

interface IndividualFocusProps {
  readonly individual: ExhibitionIndividual;
  readonly people: readonly ExhibitionIndividual[];
  readonly runtime?: RuntimeIndividualView;
  readonly artworkMode: ArtworkDisplayMode;
  readonly onClose: () => void;
  readonly onSelect: (individualId: string) => void;
  readonly tuningMap: PerceptionTuningMap;
}

const skillLabels = {
  observationalAccuracy: "observation",
  proportionAccuracy: "proportion",
  anatomicalCoherence: "anatomy",
  lineControl: "line control",
  detailCapacity: "detail",
  spatialCoherence: "space",
} as const;

export function IndividualFocus({
  individual,
  people,
  runtime,
  artworkMode,
  onClose,
  onSelect,
  tuningMap,
}: IndividualFocusProps) {
  const peers = people.filter((peer) => peer.id !== individual.id);
  const cycle = runtime?.cycle ?? 0;
  const embodiment = runtime?.embodiment;
  const selfProvenance = !runtime?.portraits.self
    ? localPortraitProvenance(artworkMode, "self-portrait")
    : undefined;
  const socialProvenance = !runtime?.portraits.social
    ? localPortraitProvenance(artworkMode, "social portrait")
    : undefined;

  return (
    <section className="focus" aria-labelledby="focus-title">
      <div className="focus__portrait">
        <PortraitCanvas
          individual={individual}
          cycle={cycle}
          mode="self"
          artwork={runtime?.portraits.self}
        />
        {selfProvenance && <span className="portrait-provenance">{selfProvenance}</span>}
        {!runtime?.portraits.self && (
          <div className="focus__portrait-label">
            <span>self-portrait</span>
            <span>cycle {String(cycle).padStart(3, "0")}</span>
          </div>
        )}
      </div>

      <div className="focus__context">
        <div className="focus__heading">
          <div>
            <p className="eyebrow">Individual {individual.number}</p>
            <h2 id="focus-title">{individual.name}</h2>
          </div>
          <button
            className="text-control focus__close"
            type="button"
            onClick={onClose}
            aria-label={`Close ${individual.name} focus view`}
            autoFocus
          >
            close <span aria-hidden="true">×</span>
          </button>
        </div>

        <blockquote>{individual.statement}</blockquote>

        <dl className="identity-axis">
          <div>
            <dt>Ideal body</dt>
            <dd>{individual.physicalIdentity.ideal}</dd>
          </div>
          <div>
            <dt>Body perceived</dt>
            <dd>{embodiment?.description ?? individual.physicalIdentity.current}</dd>
          </div>
          <div>
            <dt>Peers return</dt>
            <dd>{individual.socialView}</dd>
          </div>
        </dl>

        <div className="body-distance" aria-label="Current distance from ideal body">
          <div className="body-distance__heading">
            <span>{embodiment ? "live body coherence" : "authored starting distance"}</span>
            {embodiment && <output>{Math.round(embodiment.similarity * 100)}%</output>}
          </div>
          {embodiment && (
            <span className="body-distance__track" aria-hidden="true">
              <span style={{ width: `${Math.round(embodiment.similarity * 100)}%` }} />
            </span>
          )}
          <p>
            {(embodiment?.perceivedDifferences ?? individual.physicalIdentity.currentDifferences).join(" / ")}
          </p>
          {embodiment?.nextBodilyAdjustment && (
            <p className="body-distance__adjustment">
              <span>next bodily adjustment</span>
              {embodiment.nextBodilyAdjustment}
            </p>
          )}
        </div>

        <div className="embodied-register" aria-label="Physical identity register">
          <p>
            <span>face</span>
            {individual.physicalIdentity.face}
          </p>
          <p>
            <span>surface</span>
            {individual.physicalIdentity.surface}
          </p>
          <p>
            <span>posture</span>
            {individual.physicalIdentity.posture}
          </p>
          <p>
            <span>recognition</span>
            {individual.physicalIdentity.invariantFeatures.join(" / ")}
          </p>
          <p>
            <span>distance</span>
            {individual.physicalIdentity.currentDifferences.join(" / ")}
          </p>
        </div>

        <div className="focus__systems">
          <p>
            <span>vision</span>
            {individual.perceptionModel.name}: {individual.perception}
          </p>
          <p>
            <span>hand</span>
            {individual.artisticAbility.name}: {individual.drawingConstraint}
          </p>
        </div>

        <section className="artistic-scope" aria-labelledby={`${individual.id}-artistic-scope`}>
          <div className="artistic-scope__heading">
            <p className="eyebrow">Artistic ability scope</p>
            <h3 id={`${individual.id}-artistic-scope`}>{individual.artisticAbility.name}</h3>
            <p>{individual.artisticAbility.description}</p>
          </div>

          <p className="artistic-scope__primitives">
            <span>favored marks</span>
            {individual.artisticAbility.primitives.join(" / ")}
          </p>

          <div className="artistic-scope__practice">
            <p><span>mark behavior</span>{individual.artisticAbility.markBehavior}</p>
            <p><span>composition</span>{individual.artisticAbility.compositionBehavior}</p>
            <p><span>correction</span>{individual.artisticAbility.correctionBehavior}</p>
          </div>

          <div className="artistic-scope__skills" aria-label="Drawing proficiency">
            {Object.entries(individual.artisticAbility.skill).map(([skill, value]) => (
              <div className="artistic-skill" key={skill}>
                <span>{skillLabels[skill as keyof typeof skillLabels]}</span>
                <span className="artistic-skill__track" aria-hidden="true">
                  <span style={{ width: `${Math.round(value * 100)}%` }} />
                </span>
                <output>{Math.round(value * 100)}%</output>
              </div>
            ))}
          </div>

          <p className="artistic-scope__limits">
            <span>limits</span>
            {individual.artisticAbility.limitations.join(" ")}
          </p>
        </section>
      </div>

      <div className="social-portrait">
        <div className="section-label">
          <span>the body the world returns to {individual.name}</span>
          <span>{peers.length} perceptions / ideal registered beneath</span>
        </div>
        <div className="social-portrait__art">
          <PortraitCanvas
            individual={individual}
            cycle={cycle}
            mode="social"
            artwork={runtime?.portraits.social}
            socialPerceptions={peers.map((peer) => ({
              observer: peer,
              tuning: tuningMap[peer.id],
            }))}
          />
          {socialProvenance && <span className="portrait-provenance">{socialProvenance}</span>}
        </div>
      </div>

      <div className="peer-readings">
        <div className="section-label">
          <span>peer interpretations</span>
          <span>before compositing</span>
        </div>
        <div className="peer-readings__grid">
          {peers.map((peer) => {
            const peerArtwork = runtime?.portraits.peers.find(
              ({ artistId }) => artistId === peer.id,
            )?.artwork;
            const peerProvenance = !peerArtwork
              ? localPortraitProvenance(artworkMode, "peer drawing")
              : undefined;
            return (
              <div className="peer-reading" key={peer.id}>
                <div className="peer-reading__art">
                  <PortraitCanvas
                    individual={individual}
                    observedBy={peer}
                    perceptionTuning={tuningMap[peer.id]}
                    cycle={cycle}
                    mode="peer"
                    artwork={peerArtwork}
                  />
                  {peerProvenance && <span className="portrait-provenance">{peerProvenance}</span>}
                </div>
                <p>
                  <span>{peerArtwork ? "live drawing" : "study"} by {peer.name}</span>
                  {peer.perceptionModel.name} → {peer.artisticAbility.name}
                </p>
              </div>
            );
          })}
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
