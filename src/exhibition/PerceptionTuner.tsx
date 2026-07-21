import { useMemo, useState } from "react";
import { PortraitCanvas } from "./PortraitCanvas";
import type {
  ExhibitionIndividual,
  PerceptionControl,
  PerceptionTuningMap,
} from "./types";

interface PerceptionTunerProps {
  readonly people: readonly ExhibitionIndividual[];
  readonly tuningMap: PerceptionTuningMap;
  readonly cycle: number;
  readonly onChange: (individualId: string, controlId: string, value: number) => void;
  readonly onResetIndividual: (individual: ExhibitionIndividual) => void;
  readonly onResetAll: () => void;
  readonly onClose: () => void;
}

const formatValue = (control: PerceptionControl, value: number): string => {
  if (control.format === "percent") return `${Math.round(value * 100)}%`;
  if (control.format === "pixels") return `${Math.round(value)} px`;
  return String(Math.round(value));
};

export function PerceptionTuner({
  people,
  tuningMap,
  cycle,
  onChange,
  onResetIndividual,
  onResetAll,
  onClose,
}: PerceptionTunerProps) {
  const [observerId, setObserverId] = useState(people[0].id);
  const observer = people.find((individual) => individual.id === observerId) ?? people[0];
  const availableSubjects = useMemo(
    () => people.filter((individual) => individual.id !== observer.id),
    [observer.id, people],
  );
  const [preferredSubjectId, setPreferredSubjectId] = useState(people[1]?.id ?? people[0].id);
  const subject =
    availableSubjects.find((individual) => individual.id === preferredSubjectId) ??
    availableSubjects[0];
  const tuning = tuningMap[observer.id];

  return (
    <section
      className="tuner"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tuner-title"
    >
      <header className="tuner__header">
        <div>
          <p className="eyebrow">Exhibition calibration</p>
          <h2 id="tuner-title">Perception</h2>
        </div>
        <div className="tuner__header-actions">
          <button className="text-control" type="button" onClick={onResetAll}>
            reset all
          </button>
          <button className="text-control" type="button" onClick={onClose} autoFocus>
            close <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <nav className="tuner__people" aria-label="Individual perception models">
        {people.map((individual) => (
          <button
            type="button"
            key={individual.id}
            className={individual.id === observer.id ? "is-active" : ""}
            onClick={() => setObserverId(individual.id)}
            aria-pressed={individual.id === observer.id}
          >
            <span>{individual.number}</span>
            {individual.name}
          </button>
        ))}
      </nav>

      <div className="tuner__workspace">
        <div className="tuner__preview">
          <div className="tuner__preview-heading">
            <div>
              <p className="eyebrow">Live comparison</p>
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
                <PortraitCanvas individual={subject} cycle={cycle} mode="self" />
              </div>
              <figcaption>
                <span>source body</span>
                {subject.name}'s canvas
              </figcaption>
            </figure>
            <figure>
              <div className="tuner__canvas">
                <PortraitCanvas
                  individual={subject}
                  observedBy={observer}
                  perceptionTuning={tuning}
                  cycle={cycle}
                  mode="peer"
                />
              </div>
              <figcaption>
                <span>peer drawing</span>
                {observer.perceptionModel.name} → {observer.artisticAbility.name}
              </figcaption>
            </figure>
          </div>
        </div>

        <aside className="tuner__controls" aria-label={`${observer.name} perception controls`}>
          <div className="tuner__model-heading">
            <p className="eyebrow">{observer.perceptionModel.id}</p>
            <h3>{observer.perceptionModel.name}</h3>
            <p>{observer.perceptionModel.description}</p>
          </div>

          <p className="tuner__invariant">
            <span>constant distortion</span>
            {observer.perceptionModel.invariant}
          </p>

          <p className="tuner__practice">
            <span>fixed artistic practice</span>
            What {observer.name} perceives is then drawn through {observer.artisticAbility.name}. Its mark
            vocabulary and proficiency are part of identity and are not changed by these controls.
          </p>

          <div className="tuner__sliders">
            {observer.perceptionModel.controls.map((control) => {
              const currentValue = tuning[control.id] ?? control.defaultValue;
              return (
                <label className="tuner-control" key={control.id}>
                  <span className="tuner-control__heading">
                    <span>{control.label}</span>
                    <output>{formatValue(control, currentValue)}</output>
                  </span>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={currentValue}
                    aria-label={control.label}
                    aria-valuemin={control.min}
                    aria-valuemax={control.max}
                    aria-valuenow={currentValue}
                    aria-valuetext={formatValue(control, currentValue)}
                    onChange={(event) =>
                      onChange(observer.id, control.id, Number(event.currentTarget.value))
                    }
                  />
                  <span className="tuner-control__description">{control.description}</span>
                </label>
              );
            })}
          </div>

          <div className="tuner__control-footer">
            <p>Changes persist in this browser and affect peer drawings and social composites.</p>
            <button className="text-control" type="button" onClick={() => onResetIndividual(observer)}>
              reset {observer.name}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
