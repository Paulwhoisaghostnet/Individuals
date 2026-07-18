interface AboutProps {
  readonly onClose: () => void;
}

export function About({ onClose }: AboutProps) {
  return (
    <section className="about" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <button className="text-control about__close" type="button" onClick={onClose} autoFocus>
        close <span aria-hidden="true">×</span>
      </button>
      <div className="about__body">
        <p className="eyebrow">About the work</p>
        <h2 id="about-title">No portrait is authoritative.</h2>
        <div className="about__copy">
          <p>
            Each Individual holds an ideal self, draws the self it currently believes in, and receives
            a composite image made from the perceptions of its peers.
          </p>
          <p>
            It changes in response. So do they. Coherence remains the goal, but every act of seeing
            introduces another difference.
          </p>
        </div>
        <p className="about__note">
          This digital society is a prototype for a distributed physical installation in which cameras
          become eyes and dedicated displays become canvases.
        </p>
      </div>
    </section>
  );
}
