import { useEffect, useMemo, useState } from "react";
import { About } from "./exhibition/About";
import { createCycleEvent } from "./exhibition/cycle";
import { individuals } from "./exhibition/data";
import { ExhibitionGallery } from "./exhibition/ExhibitionGallery";
import { IndividualFocus } from "./exhibition/IndividualFocus";
import { PerceptionTuner } from "./exhibition/PerceptionTuner";
import { usePerceptionTuning } from "./exhibition/usePerceptionTuning";

const CYCLE_DURATION_MS = 14_000;

function App() {
  const [cycle, setCycle] = useState(7);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isTunerOpen, setIsTunerOpen] = useState(false);
  const { tuningMap, setControl, resetIndividual, resetAll } = usePerceptionTuning(individuals);
  const selected = individuals.find((individual) => individual.id === selectedId);
  const event = useMemo(() => createCycleEvent(individuals, cycle), [cycle]);

  useEffect(() => {
    if (isPaused || isTunerOpen) return undefined;
    const interval = window.setInterval(() => setCycle((value) => value + 1), CYCLE_DURATION_MS);
    return () => window.clearInterval(interval);
  }, [isPaused, isTunerOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isTunerOpen) setIsTunerOpen(false);
      else if (isAboutOpen) setIsAboutOpen(false);
      else if (selectedId) setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAboutOpen, isTunerOpen, selectedId]);

  const returnToSociety = () => {
    setSelectedId(null);
    setIsAboutOpen(false);
    setIsTunerOpen(false);
  };

  return (
    <main className={`exhibition ${selected ? "exhibition--focused" : ""}`}>
      <header className="masthead">
        <button className="wordmark" type="button" onClick={returnToSociety}>
          Individuals
        </button>
        <p>A society learning how it is seen.</p>
        <div className="masthead__controls">
          <button
            className="text-control"
            type="button"
            onClick={() => {
              setIsTunerOpen(true);
              setIsAboutOpen(false);
            }}
          >
            tune
          </button>
          <button
            className="text-control"
            type="button"
            onClick={() => {
              setIsAboutOpen(true);
              setIsTunerOpen(false);
            }}
          >
            about
          </button>
          <button className="text-control" type="button" onClick={() => setIsPaused((value) => !value)}>
            {isPaused ? "resume" : "pause"}
          </button>
        </div>
      </header>

      <div className="exhibition__body" key={selected?.id ?? `society-${cycle}`}>
        {selected ? (
          <IndividualFocus
            individual={selected}
            people={individuals}
            cycle={cycle}
            onClose={() => setSelectedId(null)}
            onSelect={setSelectedId}
            tuningMap={tuningMap}
          />
        ) : (
          <ExhibitionGallery people={individuals} cycle={cycle} onSelect={setSelectedId} />
        )}
      </div>

      <footer className="cycle-bar">
        <div className="cycle-bar__identity">
          <span>live study</span>
          <span>03 Individuals present</span>
        </div>
        <p className="cycle-bar__event" aria-live="polite">
          {event.sentence}
        </p>
        <div className="cycle-bar__controls">
          <button className="text-control" type="button" onClick={() => setCycle((value) => value + 1)}>
            cycle {String(cycle).padStart(3, "0")} <span aria-hidden="true">↗</span>
          </button>
          <span
            className={`cycle-progress ${isPaused ? "cycle-progress--paused" : ""}`}
            key={`${cycle}-${isPaused}`}
            aria-hidden="true"
          />
        </div>
      </footer>

      {isAboutOpen && <About onClose={() => setIsAboutOpen(false)} />}
      {isTunerOpen && (
        <PerceptionTuner
          people={individuals}
          tuningMap={tuningMap}
          cycle={cycle}
          onChange={setControl}
          onResetIndividual={resetIndividual}
          onResetAll={resetAll}
          onClose={() => setIsTunerOpen(false)}
        />
      )}
    </main>
  );
}

export default App;
