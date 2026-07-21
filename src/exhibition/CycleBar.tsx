import type { SocietyRuntimeView } from "./runtime/types";

interface CycleBarProps {
  readonly runtime: SocietyRuntimeView;
  readonly individualCount: number;
  readonly onAdvanceLocal: () => void;
}

export function CycleBar({ runtime, individualCount, onAdvanceLocal }: CycleBarProps) {
  return (
    <footer className="cycle-bar">
      <div className="cycle-bar__identity">
        <span
          className={`runtime-registration runtime-registration--${runtime.connection.phase}`}
          title={runtime.sourceDescription}
          role="status"
          aria-label={`${runtime.sourceLabel}. ${runtime.sourceDescription}`}
        >
          <span aria-hidden="true" />
          {runtime.sourceLabel}
        </span>
        <span>{String(individualCount).padStart(2, "0")} Individuals present</span>
      </div>
      <p className="cycle-bar__event" aria-live="polite">
        {runtime.eventSentence}
      </p>
      <div className="cycle-bar__controls">
        {runtime.localFallback ? (
          <button className="text-control" type="button" onClick={onAdvanceLocal}>
            cycle {runtime.cycleLabel} <span aria-hidden="true">↗</span>
          </button>
        ) : (
          <span className="cycle-bar__counter">cycle {runtime.cycleLabel}</span>
        )}
        <span
          className={[
            "cycle-progress",
            runtime.allPaused ? "cycle-progress--paused" : "",
            runtime.source === "live" ? "cycle-progress--live" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          key={`${runtime.source}-${runtime.cycleLabel}-${runtime.allPaused}`}
          aria-hidden="true"
        />
      </div>
    </footer>
  );
}
