interface ExhibitionHeaderProps {
  readonly tunerOpen: boolean;
  readonly aboutOpen: boolean;
  readonly localFallback: boolean;
  readonly allPaused: boolean;
  readonly onReturn: () => void;
  readonly onOpenTuner: (trigger: HTMLButtonElement) => void;
  readonly onOpenAbout: (trigger: HTMLButtonElement) => void;
  readonly onToggleLocalPause: () => void;
}

export function ExhibitionHeader({
  tunerOpen,
  aboutOpen,
  localFallback,
  allPaused,
  onReturn,
  onOpenTuner,
  onOpenAbout,
  onToggleLocalPause,
}: ExhibitionHeaderProps) {
  return (
    <header className="masthead">
      <button
        className="wordmark"
        type="button"
        onClick={onReturn}
        aria-label="Return to society view"
      >
        Individuals
      </button>
      <p>A society learning how it is seen.</p>
      <div className="masthead__controls" role="group" aria-label="Exhibition controls">
        <button
          className="text-control"
          type="button"
          aria-expanded={tunerOpen}
          aria-controls="perception-tuner"
          onClick={(event) => onOpenTuner(event.currentTarget)}
        >
          tune
        </button>
        <button
          className="text-control"
          type="button"
          aria-expanded={aboutOpen}
          aria-controls="about-dialog"
          onClick={(event) => onOpenAbout(event.currentTarget)}
        >
          about
        </button>
        <button
          className="text-control"
          type="button"
          aria-pressed={localFallback ? allPaused : undefined}
          onClick={(event) => {
            if (localFallback) onToggleLocalPause();
            else onOpenTuner(event.currentTarget);
          }}
        >
          {localFallback ? (allPaused ? "resume" : "pause") : "curator"}
        </button>
      </div>
    </header>
  );
}
