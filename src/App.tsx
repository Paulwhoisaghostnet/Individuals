import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { About } from "./exhibition/About";
import { CycleBar } from "./exhibition/CycleBar";
import { individuals } from "./exhibition/data";
import { ExhibitionGallery } from "./exhibition/ExhibitionGallery";
import { ExhibitionHeader } from "./exhibition/ExhibitionHeader";
import { IndividualFocus } from "./exhibition/IndividualFocus";
import { PerceptionTuner } from "./exhibition/PerceptionTuner";
import { useSocietyRuntime } from "./exhibition/runtime/useSocietyRuntime";

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isTunerOpen, setIsTunerOpen] = useState(false);
  const modalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const individualReturnIdRef = useRef<string | null>(null);
  const pendingIndividualReturnIdRef = useRef<string | null>(null);
  const { view: runtime, controls } = useSocietyRuntime(individuals);
  const selected = individuals.find((individual) => individual.id === selectedId);
  const selectedRuntime = selected ? runtime.individuals[selected.id] : undefined;
  const modalOpen = isAboutOpen || isTunerOpen;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isTunerOpen) {
        controls.cancelPending();
        setIsTunerOpen(false);
      }
      else if (isAboutOpen) setIsAboutOpen(false);
      else if (selectedId) {
        pendingIndividualReturnIdRef.current = individualReturnIdRef.current ?? selectedId;
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controls, isAboutOpen, isTunerOpen, selectedId]);

  useLayoutEffect(() => {
    if (selectedId !== null || !pendingIndividualReturnIdRef.current) return;
    const returnId = pendingIndividualReturnIdRef.current;
    pendingIndividualReturnIdRef.current = null;
    const trigger = Array.from(
      document.querySelectorAll<HTMLElement>("[data-individual-trigger]"),
    ).find((element) => element.dataset.individualTrigger === returnId);
    trigger?.focus({ preventScroll: true });
  }, [selectedId]);

  const selectIndividual = (individualId: string) => {
    individualReturnIdRef.current = individualId;
    setSelectedId(individualId);
  };

  const closeIndividual = () => {
    pendingIndividualReturnIdRef.current = individualReturnIdRef.current ?? selectedId;
    setSelectedId(null);
  };

  const returnToSociety = () => {
    controls.cancelPending();
    pendingIndividualReturnIdRef.current = null;
    setSelectedId(null);
    setIsAboutOpen(false);
    setIsTunerOpen(false);
  };

  return (
    <>
      <main
        className={`exhibition ${selected ? "exhibition--focused" : ""}`}
        inert={modalOpen}
        aria-hidden={modalOpen || undefined}
      >
        <ExhibitionHeader
          tunerOpen={isTunerOpen}
          aboutOpen={isAboutOpen}
          localFallback={runtime.localFallback}
          allPaused={runtime.allPaused}
          onReturn={returnToSociety}
          onOpenTuner={(trigger) => {
            modalTriggerRef.current = trigger;
            controls.clearError();
            setIsTunerOpen(true);
            setIsAboutOpen(false);
          }}
          onOpenAbout={(trigger) => {
            modalTriggerRef.current = trigger;
            if (isTunerOpen) controls.cancelPending();
            setIsAboutOpen(true);
            setIsTunerOpen(false);
          }}
          onToggleLocalPause={() => {
            void (runtime.allPaused ? controls.resume() : controls.pause());
          }}
        />

        <div className="exhibition__body">
          {selected ? (
            <IndividualFocus
              individual={selected}
              people={individuals}
              runtime={selectedRuntime}
              artworkMode={runtime.artworkMode}
              onClose={closeIndividual}
              onSelect={selectIndividual}
              tuningMap={runtime.tuningMap}
            />
          ) : (
            <ExhibitionGallery
              people={individuals}
              runtime={runtime.individuals}
              artworkMode={runtime.artworkMode}
              onSelect={selectIndividual}
            />
          )}
        </div>

        <CycleBar
          runtime={runtime}
          individualCount={individuals.length}
          onAdvanceLocal={controls.advanceLocal}
        />
      </main>

      {isAboutOpen && (
        <About
          returnFocus={modalTriggerRef.current}
          onClose={() => setIsAboutOpen(false)}
        />
      )}
      {isTunerOpen && (
        <PerceptionTuner
          people={individuals}
          tuningMap={runtime.tuningMap}
          cycle={
            selectedRuntime?.cycle ??
            Math.max(...Object.values(runtime.individuals).map(({ cycle }) => cycle))
          }
          runtimeSource={runtime.source}
          controlTarget={runtime.controlTarget}
          runtimeIndividuals={runtime.individuals}
          runtimeDescription={runtime.sourceDescription}
          societyPaused={runtime.allPaused}
          controlState={controls.state}
          onPause={controls.pause}
          onResume={controls.resume}
          onChange={controls.tunePerception}
          onResetIndividual={controls.resetIndividual}
          onResetAll={controls.resetAll}
          onClearError={controls.clearError}
          returnFocus={modalTriggerRef.current}
          onClose={() => {
            controls.cancelPending();
            controls.clearError();
            setIsTunerOpen(false);
          }}
        />
      )}
    </>
  );
}

export default App;
