// Shared docked-panel chrome (side-panel conversion): every in-game card
// used to be a centered modal over a dimmed backdrop — clicking a room, the
// camera flies to it (M8), and then a modal blacked out the very shot it
// flew to. This wrapper docks the same chunky white/slate game-card look
// (rounded-3xl border-2 border-white/60 bg-white/90 backdrop-blur shadow-2xl)
// to the top-right corner instead: no backdrop, no dim, and pointer events
// only land on the panel itself, so the world — and the bottom-right chat
// stack / bottom-left HUD row, both of which this panel's position
// deliberately leaves clear — stays live behind it.
//
// Escape-to-close is each card's own concern (existing per-card `window`
// keydown listeners, unchanged) — this wrapper adds no key handling of its
// own. A card that needs a sub-region to stay put while the rest of the body
// scrolls (a tab bar, a footer of action buttons) uses `sticky top-0` /
// `sticky bottom-0` with a matching background on that child — the body
// below is the one scroll container, not a stack of independently-scrolling
// panes.
import type { ReactNode } from "react";
import { playSfx } from "@/game/audio/sfx";
import { useCameraDirector } from "@/game/engine/camera/director";

export interface GamePanelProps {
  /** Header content left of the ✕ — a plain string/span for most cards, a
   *  richer fragment (color dot + name + status chip) for DossierCard. */
  title: ReactNode;
  onClose: () => void;
  /** Optional extra header action, rendered between the title and ✕ (round
   *  2) — e.g. RoomCard/HqCard/DossierCard's "🎥 Exit zoom" chip, shown only
   *  while the camera is focused/following. Kept separate from `title`
   *  (which can already carry its own extra buttons, e.g. ProjectsDialog's
   *  ➕) since this one is specifically the shared camera-exit affordance,
   *  not per-card content. */
  headerAction?: ReactNode;
  children: ReactNode;
}

export function GamePanel({ title, onClose, headerAction, children }: GamePanelProps) {
  return (
    <div className="pointer-events-auto fixed right-4 top-4 bottom-auto z-40 flex max-h-[calc(100vh-160px)] w-[380px] flex-col rounded-3xl border-2 border-white/60 bg-white/90 text-slate-900 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2 rounded-t-3xl border-b-2 border-slate-900/10 px-4 py-3">
        {title}
        {headerAction}
        <button
          type="button"
          aria-label="Close"
          data-testid="game-panel-close"
          className="rounded-full px-1.5 py-0.5 font-bold hover:bg-slate-900/10"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

/**
 * Shared "🎥 Exit zoom" header action (round 2): RoomCard/HqCard/DossierCard
 * each pass `<ExitZoomButton />` as GamePanel's `headerAction` — visible only
 * while the camera is focused/following (subscribed, not read imperatively:
 * this button's own visibility IS the render that must react to the mode
 * changing, same convention as HudOverlay's own 🎥✕ chip). It only calls
 * `exit()` — GameShell's focus-coupled dock lifetime (see GameShell.tsx's
 * own doc comment) is what then closes the panel too, so this button
 * doesn't need an onClose of its own.
 */
export function ExitZoomButton() {
  const active = useCameraDirector((s) => s.mode.kind !== "free");
  if (!active) return null;
  return (
    <button
      type="button"
      aria-label="Exit zoom"
      data-testid="game-panel-exit-zoom"
      onClick={() => {
        useCameraDirector.getState().exit();
        playSfx("click");
      }}
      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold hover:bg-slate-900/10"
    >
      🎥 Exit zoom
    </button>
  );
}
