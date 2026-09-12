import { useState } from "react";
import { createMockSnapshot } from "./mock";

export function App() {
  const [step, setStep] = useState(0);
  const snapshot = createMockSnapshot(step);
  const session = snapshot.sessions[0]!;

  return (
    <main>
      <header>
        <span className="wordmark">CrewHub</span>
        <span className="badge">Development fixture · Mock data</span>
      </header>
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Browser world / Foundation</p>
        <h1 id="page-title">A fresh start for your crew.</h1>
        <p className="lead">
          The workspace is ready. The next milestone is one expressive, playful
          room where your agents come to life.
        </p>
        <p className="note">
          This screen verifies the bootstrap. Its layout, colors, and typography
          are temporary and do not define the future world.
        </p>
      </section>
      <section className="fixture" aria-labelledby="fixture-title">
        <div>
          <h2 id="fixture-title">Session fixture</h2>
          <p>Cycle a simulated session through the states the world will render.</p>
        </div>
        <div className="session" role="status" aria-live="polite" aria-atomic="true">
          <span className="indicator" data-status={session.status} aria-hidden="true" />
          <div>
            <strong>{session.displayName}</strong>
            <span>{session.status.replace("-", " ")} · {session.activity}</span>
          </div>
        </div>
        <button type="button" onClick={() => setStep((current) => (current + 1) % 4)}>
          Next simulated state <span aria-hidden="true">→</span>
        </button>
        <p className="note">No live sessions are connected. No models are called.</p>
      </section>
      <footer>Start the visual build with docs/ASTRA_HANDOFF.md.</footer>
    </main>
  );
}
