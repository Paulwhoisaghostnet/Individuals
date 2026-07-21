import { useEffect, useRef, useState } from "react";
import { PerceptionCalibration } from "./PerceptionCalibration";
import { PerceptionModelControls } from "./PerceptionModelControls";
import type {
  ControlRequestState,
  RuntimeControlTarget,
  RuntimeIndividualView,
  RuntimeSource,
} from "./runtime/types";
import { useDialogFocus } from "./useDialogFocus";
import type { ExhibitionIndividual, PerceptionTuningMap } from "./types";

interface PerceptionTunerProps {
  readonly people: readonly ExhibitionIndividual[];
  readonly tuningMap: PerceptionTuningMap;
  readonly cycle: number;
  readonly runtimeSource: RuntimeSource;
  readonly controlTarget: RuntimeControlTarget;
  readonly runtimeIndividuals: Readonly<Record<string, RuntimeIndividualView>>;
  readonly runtimeDescription: string;
  readonly societyPaused: boolean;
  readonly controlState: ControlRequestState;
  readonly onPause: (token?: string) => Promise<boolean>;
  readonly onResume: (token?: string) => Promise<boolean>;
  readonly onChange: (
    individualId: string,
    controlId: string,
    value: number,
    token?: string,
  ) => Promise<boolean>;
  readonly onResetIndividual: (
    individual: ExhibitionIndividual,
    token?: string,
  ) => Promise<boolean>;
  readonly onResetAll: (token?: string) => Promise<boolean>;
  readonly onClearError: () => void;
  readonly onClose: () => void;
  readonly returnFocus?: HTMLElement | null;
}

export function PerceptionTuner({
  people,
  tuningMap,
  cycle,
  runtimeSource,
  controlTarget,
  runtimeIndividuals,
  runtimeDescription,
  societyPaused,
  controlState,
  onPause,
  onResume,
  onChange,
  onResetIndividual,
  onResetAll,
  onClearError,
  onClose,
  returnFocus,
}: PerceptionTunerProps) {
  const dialogRef = useDialogFocus<HTMLElement>(returnFocus);
  const [sessionToken, setSessionToken] = useState("");
  const sessionTokenRef = useRef("");
  const [draftTuningMap, setDraftTuningMap] = useState<PerceptionTuningMap>(tuningMap);
  const commitTimers = useRef(new Map<string, number>());
  const controlTargetRef = useRef(controlTarget);
  const tuningMapRef = useRef(tuningMap);
  controlTargetRef.current = controlTarget;
  tuningMapRef.current = tuningMap;
  const [observerId, setObserverId] = useState(people[0].id);
  const observer = people.find((individual) => individual.id === observerId) ?? people[0];
  const tuning = draftTuningMap[observer.id] ?? tuningMap[observer.id];
  const isLiveTarget = controlTarget === "live";
  const hasVerifiedLiveSource = runtimeSource === "live";
  const authorized = !isLiveTarget || sessionToken.trim().length > 0;
  const anyPending = Object.values(controlState.pending).some(Boolean);

  useEffect(() => {
    if (commitTimers.current.size === 0) setDraftTuningMap(tuningMap);
  }, [tuningMap]);
  useEffect(() => {
    if (controlState.error) setDraftTuningMap(tuningMap);
  }, [controlState.error, tuningMap]);
  useEffect(() => {
    // A debounced live mutation must never cross into a later local-target view.
    for (const timer of commitTimers.current.values()) window.clearTimeout(timer);
    commitTimers.current.clear();
    setDraftTuningMap(tuningMapRef.current);
  }, [controlTarget]);
  useEffect(
    () => () => {
      for (const timer of commitTimers.current.values()) window.clearTimeout(timer);
      commitTimers.current.clear();
      sessionTokenRef.current = "";
    },
    [],
  );

  const changeControl = (controlId: string, value: number) => {
    setDraftTuningMap((current) => ({
      ...current,
      [observer.id]: { ...current[observer.id], [controlId]: value },
    }));
    const key = `${observer.id}:${controlId}`;
    const existing = commitTimers.current.get(key);
    if (existing !== undefined) window.clearTimeout(existing);

    if (!isLiveTarget) {
      void onChange(observer.id, controlId, value);
      return;
    }
    const timer = window.setTimeout(() => {
      commitTimers.current.delete(key);
      if (controlTargetRef.current !== "live") return;
      void onChange(observer.id, controlId, value, sessionTokenRef.current);
    }, 420);
    commitTimers.current.set(key, timer);
  };

  const cancelScheduledCommits = (individualId?: string) => {
    for (const [key, timer] of commitTimers.current) {
      if (!individualId || key.startsWith(`${individualId}:`)) {
        window.clearTimeout(timer);
        commitTimers.current.delete(key);
      }
    }
  };

  return (
    <section
      ref={dialogRef}
      className="tuner"
      id="perception-tuner"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tuner-title"
      tabIndex={-1}
    >
      <header className="tuner__header">
        <div>
          <p className="eyebrow">Exhibition calibration</p>
          <h2 id="tuner-title">Perception</h2>
        </div>
        <div className="tuner__header-actions">
          <button
            className="text-control"
            type="button"
            disabled={!authorized || anyPending}
            onClick={() => {
              cancelScheduledCommits();
              void onResetAll(sessionToken);
            }}
          >
            {controlState.pending["reset-all"] ? "resetting…" : "reset all"}
          </button>
          <button
            className="text-control"
            type="button"
            onClick={onClose}
            data-dialog-initial-focus
          >
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
        <PerceptionCalibration
          people={people}
          observer={observer}
          tuning={tuning}
          fallbackCycle={cycle}
          verifiedSource={runtimeSource}
          controlTarget={controlTarget}
          runtimeIndividuals={runtimeIndividuals}
        />

        <aside className="tuner__controls" aria-label={`${observer.name} perception controls`}>
          <section className="tuner__runtime" aria-labelledby="runtime-control-title">
            <div>
              <p className="eyebrow" id="runtime-control-title">Runtime control</p>
              <p className="tuner__runtime-source">
                <span className={`runtime-dot runtime-dot--${controlTarget}`} aria-hidden="true" />
                {isLiveTarget ? "live runtime target" : "local simulation target"}
              </p>
              <p className="tuner__runtime-description">{runtimeDescription}</p>
              {isLiveTarget && !hasVerifiedLiveSource && (
                <p className="tuner__runtime-verification">
                  No verified live snapshot is currently displayed.
                </p>
              )}
            </div>

            {isLiveTarget ? (
              <label className="curator-token">
                <span>session curator token</span>
                <input
                  type="password"
                  name="runtime-curator-session-token"
                  value={sessionToken}
                  autoComplete="off"
                  maxLength={4_096}
                  spellCheck={false}
                  placeholder="required to change live state"
                  onChange={(event) => {
                    onClearError();
                    const nextToken = event.currentTarget.value;
                    sessionTokenRef.current = nextToken;
                    setSessionToken(nextToken);
                  }}
                />
                <small>Held only in memory; cleared when this view closes or reloads.</small>
              </label>
            ) : (
              <p className="tuner__local-notice">
                These controls affect only this deterministic browser simulation.
              </p>
            )}

            <div className="tuner__runtime-action">
              <button
                className="text-control"
                type="button"
                disabled={!authorized || anyPending}
                onClick={() => void (societyPaused ? onResume(sessionToken) : onPause(sessionToken))}
              >
                {controlState.pending["society-pause"] || controlState.pending["society-resume"]
                  ? "applying…"
                  : societyPaused
                    ? "resume society"
                    : "pause society"}
              </button>
            </div>

            {controlState.error && (
              <p className="tuner__control-error" role="alert">
                {controlState.error}
              </p>
            )}
          </section>

          <PerceptionModelControls
            observer={observer}
            tuning={tuning}
            controlState={controlState}
            authorized={authorized}
            liveTarget={isLiveTarget}
            onChange={changeControl}
            onReset={() => {
              cancelScheduledCommits(observer.id);
              void onResetIndividual(observer, sessionToken);
            }}
          />
        </aside>
      </div>
    </section>
  );
}
