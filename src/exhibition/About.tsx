import { useDialogFocus } from "./useDialogFocus";

interface AboutProps {
  readonly onClose: () => void;
  readonly returnFocus?: HTMLElement | null;
}

export function About({ onClose, returnFocus }: AboutProps) {
  const dialogRef = useDialogFocus<HTMLElement>(returnFocus);
  return (
    <section
      ref={dialogRef}
      className="about"
      id="about-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      tabIndex={-1}
    >
      <button
        className="text-control about__close"
        type="button"
        onClick={onClose}
        data-dialog-initial-focus
      >
        close <span aria-hidden="true">×</span>
      </button>
      <div className="about__body">
        <p className="eyebrow">About the work</p>
        <h2 id="about-title">No portrait is authoritative.</h2>
        <div className="about__copy">
          <p>
            Each Individual is trained on an ideal physical form. It understands that form as its own
            body and draws the bodily version of itself it currently believes it has become.
          </p>
          <p>
            Its peers return other drawings of that same body. Anatomy, posture, surface, and face
            change in response, but physical identity remains the ground of every portrait.
          </p>
        </div>
        <p className="about__note">
          Coherence between ideal body, perceived body, and socially returned body remains the goal.
          Every act of seeing makes complete coherence impossible.
        </p>
      </div>
    </section>
  );
}
