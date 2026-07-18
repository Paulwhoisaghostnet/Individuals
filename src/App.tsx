const individuals = [
  { id: "01", name: "Unformed", state: "observing" },
  { id: "02", name: "Unformed", state: "waiting" },
  { id: "03", name: "Unformed", state: "waiting" },
];

function App() {
  return (
    <main>
      <header className="masthead">
        <h1>Individuals</h1>
        <p>A society learning how it is seen.</p>
      </header>

      <section className="gallery" aria-label="Individual portraits">
        {individuals.map((individual) => (
          <article className="individual" key={individual.id}>
            <div className="canvas" aria-label={`${individual.name}'s canvas`}>
              <span>{individual.id}</span>
            </div>
            <div className="caption">
              <p>{individual.name}</p>
              <p>{individual.state}</p>
            </div>
          </article>
        ))}
      </section>

      <footer>
        <span>Cycle 000</span>
        <span>Three Individuals are present</span>
      </footer>
    </main>
  );
}

export default App;

