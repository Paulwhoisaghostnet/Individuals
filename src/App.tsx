import { useEffect, useMemo, useState } from "react";
import { About } from "./exhibition/About";
import { createCycleEvent } from "./exhibition/cycle";
import { individuals } from "./exhibition/data";
import { ExhibitionGallery } from "./exhibition/ExhibitionGallery";
import { IndividualFocus } from "./exhibition/IndividualFocus";
import { PerceptionTuner } from "./exhibition/PerceptionTuner";
import { usePerceptionTuning } from "./exhibition/usePerceptionTuning";

const CYCLE_DURATION_MS = 14_000;
const STORAGE_KEY_CYCLE = "individuals.cycle.v1";
const STORAGE_KEY_PAUSED = "individuals.paused.v1";

function getInitialCycle(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CYCLE);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // Fallback to default if localStorage disabled
  }
  return 7;
}

function getInitialPaused(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PAUSED);
    if (saved !== null) return saved === "true";
  } catch {
    // Fallback to default if localStorage disabled
  }
  return false;
}

function App() {
  const [cycle, setCycle] = useState(getInitialCycle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(getInitialPaused);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isTunerOpen, setIsTunerOpen] = useState(false);
  const [liveReflection, setLiveReflection] = useState<string | null>(null);
  const { tuningMap, setControl, resetIndividual, resetAll } = usePerceptionTuning(individuals);
  const selected = individuals.find((individual) => individual.id === selectedId);
  const event = useMemo(() => createCycleEvent(individuals, cycle), [cycle]);

  useEffect(() => {
    fetch("/api/society/snapshots")
      .then((res) => res.json())
      .then((snapshots: any[]) => {
        if (Array.isArray(snapshots) && snapshots.length > 0) {
          const iris = snapshots.find((s) => s.manifest?.id === "iris") ?? snapshots[0];
          if (iris?.state?.lastReflection?.summary) {
            setLiveReflection(`Groq LLM Reflection: ${iris.state.lastReflection.summary}`);
          }
        }
      })
      .catch(() => {
        // Fallback to local cycle sentence if server endpoint unconfigured
      });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CYCLE, String(cycle));
    } catch {
      // Ignore storage errors
    }
  }, [cycle]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PAUSED, String(isPaused));
    } catch {
      // Ignore storage errors
    }
  }, [isPaused]);

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
    <main className={`exhibition ${selected ? "exhibition--focused" : ""}`} role="main">
      <header className="masthead" role="banner">
        <button className="wordmark" type="button" onClick={returnToSociety} aria-label="Return to society view">
          Individuals
        </button>
        <p>A society learning how it is seen.</p>
        <div className="masthead__controls" role="toolbar" aria-label="Exhibition controls">
          <button
            className="text-control"
            type="button"
            aria-expanded={isTunerOpen}
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
            aria-expanded={isAboutOpen}
            onClick={() => {
              setIsAboutOpen(true);
              setIsTunerOpen(false);
            }}
          >
            about
          </button>
          <button
            className="text-control"
            type="button"
            aria-pressed={isPaused}
            onClick={() => setIsPaused((value) => !value)}
          >
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
          {liveReflection ?? event.sentence}
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
