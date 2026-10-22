/* The introduction inside the world (round 20): one small card per step over the real UI, a ring around the element
   the step is about, Next / Back / Skip, Escape skips. The focus moves into the card when it opens and goes back to
   where it was when it closes; the ring's element is named to a screen reader in the card's description; nothing is
   dimmed and the camera never moves (reduced motion or not). The steps, the placement and the flag are state/tour.ts. */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { placeStep, tourSteps, type Placement, type Rect, type TourStep } from "../state/tour";
import { Button } from "./primitives";

interface TourProps {
  mode: "demo" | "live";
  /** Skip or Done: both end the tour for this browser. */
  onClose: (reason: "skip" | "done") => void;
  reducedMotion: boolean;
  /** Where the focus goes back to when the card closes, when the opener knows better than the focused element at mount
      (Settings closes as the tour opens, so its button is gone); else the element focused at mount, else `fallback`. */
  returnTo?: HTMLElement | null;
  /** A selector for the element to focus when nothing else is left (the "?" menu's button). */
  fallback?: string;
}

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width === 0 && r.height === 0 ? null : { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** The accessible name of the highlighted element: its aria-label, else its visible text. */
const nameOf = (el: Element | null): string | null => {
  if (!el) return null;
  const label = el.getAttribute("aria-label");
  if (label) return label;
  const text = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > 0 ? text.slice(0, 80) : null;
};

export function Tour({ mode, onClose, reducedMotion, returnTo = null, fallback = ".help-menu button" }: TourProps) {
  const steps = tourSteps(mode);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<{ rect: Rect | null; name: string | null }>({ rect: null, name: null });
  // A first placement at once (centred), so the card is never hidden: the focus must land in it the moment it mounts;
  // the layout effect below corrects it before the paint.
  const [placement, setPlacement] = useState<Placement>(() => placeStep(null, { width: window.innerWidth, height: window.innerHeight }, { width: 352, height: 180 }));
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textId = useId();
  const step: TourStep = steps[Math.min(index, steps.length - 1)]!;
  const last = index === steps.length - 1;

  // The focus: into the card when it opens, back where it was when it closes (or to the opener's choice, or the "?").
  const back = useRef<HTMLElement | null>(returnTo);
  useEffect(() => {
    const captured = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    back.current = returnTo ?? captured;
    next.current?.focus();
    return () => {
      const target = back.current?.isConnected ? back.current : document.querySelector<HTMLElement>(fallback);
      target?.focus();
    };
    // Once, at mount: what the opener passed is read then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    next.current?.focus();
  }, [index]);

  // The element of the step: measured now, and again when the window changes (the labels and corners move with it).
  const measure = useCallback(() => {
    const el = step.target ? document.querySelector(step.target) : null;
    setTarget({ rect: rectOf(el), name: nameOf(el) });
  }, [step.target]);
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);
  useLayoutEffect(() => {
    const size = card.current ? { width: card.current.offsetWidth, height: card.current.offsetHeight } : { width: 320, height: 160 };
    setPlacement(placeStep(target.rect, { width: window.innerWidth, height: window.innerHeight }, size));
  }, [target, index]);

  const close = (reason: "skip" | "done") => onClose(reason);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close("skip");
    }
  };
  const highlighted = step.target ? `Highlighted on the screen: ${target.name ?? step.targetName}.` : `Nothing is highlighted: ${step.targetName}.`;

  return (
    <div className="tour" data-step={step.id} data-reduced-motion={reducedMotion ? "" : undefined} onKeyDown={onKey}>
      {target.rect && (
        <div className="tour-spot" aria-hidden="true" style={{ left: target.rect.left - 6, top: target.rect.top - 6, width: target.rect.width + 12, height: target.rect.height + 12 }} />
      )}
      <div
        ref={card}
        className="tour-card"
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={textId}
        data-side={placement.side}
        style={{ left: placement.left, top: placement.top }}
      >
        <p className="tour-count">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id={titleId} className="tour-title">
          {step.title}
        </h2>
        <p id={textId} className="tour-text">
          {step.text}
          <span className="sr-only"> {highlighted}</span>
        </p>
        <div className="tour-actions">
          <Button size="sm" variant="ghost" onClick={() => close("skip")}>
            Skip
          </Button>
          <span className="tour-actions-main">
            <Button size="sm" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              Back
            </Button>
            <Button ref={next} size="sm" variant="primary" onClick={() => (last ? close("done") : setIndex((i) => i + 1))}>
              {last ? "Done" : "Next"}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
