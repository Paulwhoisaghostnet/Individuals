import type { ControlRequestState } from "./runtime/types";
import type {
  ExhibitionIndividual,
  PerceptionControl,
  PerceptionTuning,
} from "./types";

interface PerceptionModelControlsProps {
  readonly observer: ExhibitionIndividual;
  readonly tuning: PerceptionTuning;
  readonly controlState: ControlRequestState;
  readonly authorized: boolean;
  readonly liveTarget: boolean;
  readonly onChange: (controlId: string, value: number) => void;
  readonly onReset: () => void;
}

const formatValue = (control: PerceptionControl, value: number): string => {
  if (control.format === "percent") return `${Math.round(value * 100)}%`;
  if (control.format === "pixels") return `${Math.round(value)} px`;
  return String(Math.round(value));
};

export function PerceptionModelControls({
  observer,
  tuning,
  controlState,
  authorized,
  liveTarget,
  onChange,
  onReset,
}: PerceptionModelControlsProps) {
  const anyPending = Object.values(controlState.pending).some(Boolean);

  return (
    <>
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
          const pendingKey = `tuning-${observer.id}-${control.id}`;
          const pending = Boolean(controlState.pending[pendingKey]);
          return (
            <label className={`tuner-control ${pending ? "is-pending" : ""}`} key={control.id}>
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
                disabled={!authorized || pending || Boolean(controlState.pending["reset-all"])}
                onChange={(event) => onChange(control.id, Number(event.currentTarget.value))}
              />
              <span className="tuner-control__description">{control.description}</span>
            </label>
          );
        })}
      </div>

      <div className="tuner__control-footer">
        <p>
          {liveTarget
            ? "Accepted changes become runtime truth and are returned through the public stream."
            : "Local changes persist in this browser and are clearly separate from the live society."}
        </p>
        <button
          className="text-control"
          type="button"
          disabled={!authorized || anyPending}
          onClick={onReset}
        >
          {controlState.pending[`reset-${observer.id}`]
            ? "resetting…"
            : `reset ${observer.name}`}
        </button>
      </div>
    </>
  );
}
