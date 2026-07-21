import { useMemo, useState } from "react";
import { PortraitCanvas } from "./PortraitCanvas";
import type {
  RuntimeControlTarget,
  RuntimeIndividualView,
  RuntimeSource,
} from "./runtime/types";
import type { ExhibitionIndividual, PerceptionTuning } from "./types";

interface PerceptionCalibrationProps {
  readonly people: readonly ExhibitionIndividual[];
  readonly observer: ExhibitionIndividual;
  readonly tuning: PerceptionTuning;
  readonly fallbackCycle: number;
  readonly verifiedSource: RuntimeSource;
  readonly controlTarget: RuntimeControlTarget;
  readonly runtimeIndividuals: Readonly<Record<string, RuntimeIndividualView>>;
}

export function PerceptionCalibration({
  people,
  observer,
  tuning,
  fallbackCycle,
  verifiedSource,
  controlTarget,
  runtimeIndividuals,
}: PerceptionCalibrationProps) {
  const availableSubjects = useMemo(
    () => people.filter((individual) => individual.id !== observer.id),
    [observer.id, people],
  );
  const [preferredSubjectId, setPreferredSubjectId] = useState(people[1]?.id ?? people[0].id);
  const subject =
    availableSubjects.find((individual) => individual.id === preferredSubjectId) ??
    availableSubjects[0];
  const subjectRuntime = runtimeIndividuals[subject.id];
  const verifiedArtwork =
    verifiedSource === "live" ? subjectRuntime?.portraits.self : undefined;
  const sourceCycle =
    verifiedSource === "live" ? (subjectRuntime?.cycle ?? fallbackCycle) : fallbackCycle;

  const sourceCaption = verifiedArtwork
    ? { label: "verified runtime source", detail: `${subject.name}'s live self-portrait` }
    : verifiedSource === "live"
      ? { label: "modeled source study", detail: "live source artwork unavailable" }
      : controlTarget === "local"
        ? { label: "local simulation source", detail: `${subject.name}'s generated study` }
        : { label: "unverified source study", detail: "no verified live artwork displayed" };

  return (
    <div className="tuner__preview">
      <div className="tuner__preview-heading">
        <div>
          <p className="eyebrow">Calibration comparison</p>
          <p>{observer.name} observing</p>
        </div>
        <div className="tuner__subjects" aria-label="Preview subject">
          {availableSubjects.map((individual) => (
            <button
              type="button"
              key={individual.id}
              className={individual.id === subject.id ? "is-active" : ""}
              onClick={() => setPreferredSubjectId(individual.id)}
              aria-pressed={individual.id === subject.id}
            >
              {individual.name}
            </button>
          ))}
        </div>
      </div>

      <div className="tuner__comparison">
        <figure>
          <div className="tuner__canvas">
            <PortraitCanvas
              individual={subject}
              cycle={sourceCycle}
              mode="self"
              artwork={verifiedArtwork}
            />
            {verifiedSource === "live" && !verifiedArtwork && (
              <span className="portrait-provenance">modeled study · live artwork unavailable</span>
            )}
          </div>
          <figcaption>
            <span>{sourceCaption.label}</span>
            {sourceCaption.detail}
          </figcaption>
        </figure>
        <figure>
          <div className="tuner__canvas">
            <PortraitCanvas
              individual={subject}
              observedBy={observer}
              perceptionTuning={tuning}
              cycle={sourceCycle}
              mode="peer"
            />
          </div>
          <figcaption>
            <span>modeled local preview</span>
            not a live peer drawing · {observer.perceptionModel.name} → {observer.artisticAbility.name}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
