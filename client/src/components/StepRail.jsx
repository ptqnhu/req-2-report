import { STEPS } from "../steps/steps.js";
import UserBadge from "./UserBadge.jsx";

/**
 * Sticky top bar (the signed-in person), with the progress bar of the steps in its own row below.
 * The progress bar scrolls away with the page, so long reports get the full height.
 */
export default function StepRail({ flow, step, reached, onGo, sql }) {
  return (
    <>
      <header className="rb-rail">
        <div className="rail-end">
          <UserBadge />
        </div>
      </header>

      <nav className="rb-steps" aria-label="Progress">
        <ol className="steps">
          {flow.map((id, i) => (
            <li key={id} className={i <= reached ? "reached" : ""}>
              <button
                className={`step-btn ${id === step ? "current" : i <= reached ? "done" : ""}`}
                disabled={i > reached}
                onClick={() => onGo(id)}
                aria-current={id === step ? "step" : undefined}
                title={id === "query" && sql.trim() ? sql.trim() : STEPS[id].title}
              >
                <span className="step-dot">{i < reached && id !== step ? "✓" : i + 1}</span>
                <span className="step-label">{STEPS[id].title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
