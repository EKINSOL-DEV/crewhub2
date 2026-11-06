/* The page's overlays, one module (round 60, pg-P2): which of the dialogs and panels over the town are open, where the
   focus goes back to when each closes, and which one Escape closes. A value and its moves, so a node test drives them
   with fake elements; `useOverlays` is the browser's adapter.

   - **Where the focus returns.** Opening notes the element that had the focus; closing focuses it again. These are the
     dialogs' own DOM focus returns: a recorded decision (round 59d, review-c2 5), so the view's module (state/view.ts) is
     told `open: { text, build }` and answers `close`, and never holds an element.
   - **One return slot for four.** The jump list, Settings, the text view and the Connection panel share one slot, as
     they always have: a second one opening overwrites the first one's opener. The chat has its own. The prop editor and
     the tour have none (the tour's card returns the focus itself, to `tourReturn`).
   - **Escape** closes by a fixed order, not by which opened last: `ESCAPE_ORDER`. The tour stands before all of them, at
     the top of App's key handler: Escape skips it wherever the focus is, a text field included, but only while no dialog
     stands over the town (`tourTakesEscape`, walk finding w2-1): a dialog a person opened over the tour holds the focus
     and takes Escape first; the tour's card takes it itself while the focus is inside. The text view is the view's
     chain's (state/view.ts), after build mode. */
import { useState } from "react";
import { flushSync } from "react-dom";

export type OverlayKind = "tour" | "editor" | "jump" | "chat" | "connection" | "settings" | "text";

/** Innermost first: the first of these that is open is the one Escape closes. */
export const ESCAPE_ORDER: readonly OverlayKind[] = ["editor", "jump", "chat", "connection", "settings"];

/** Which focus return an overlay uses; an overlay not named has none. */
const RETURN_SLOT: Partial<Record<OverlayKind, "shared" | "chat">> = { jump: "shared", settings: "shared", text: "shared", connection: "shared", chat: "chat" };

export interface OverlaysState<E> {
  open: Readonly<Record<OverlayKind, boolean>>;
  /** Where the tour's card sends the focus when it closes: the Settings button when Settings opened it, else null. */
  tourReturn: E | null;
}

const NOTHING_OPEN: Readonly<Record<OverlayKind, boolean>> = { tour: false, editor: false, jump: false, chat: false, connection: false, settings: false, text: false };

/**
 * Design choice X2 (`inert`): a sheet that starts at the top right covers the right toolbar, the chat chip and the camera
 * toolbar, so App marks those corners inert while it is open (their buttons left the Tab order under it; the picture is
 * unchanged). The Chat panel always: a side sheet on a desktop, the whole screen on a phone. The text view unless the
 * window is a phone's (`phone`: at most 600 px wide, world.css), where it starts under the header rows and covers nothing.
 * Settings starts under the right corner and is not counted.
 */
export const coversCorners = ({ text, chat }: Readonly<Record<OverlayKind, boolean>>, phone: boolean): boolean => chat || (text && !phone);

/** A dialog stands over the town: the tour waits for it (the tour itself does not count). */
export const dialogIsOpen = ({ open }: Pick<OverlaysState<unknown>, "open">): boolean => open.settings || open.jump || open.connection || open.chat || open.text || open.editor;

/** Escape is the tour's (App's key handler skips it wherever the focus is): the tour is open and no dialog stands over it. */
export const tourTakesEscape = (state: Pick<OverlaysState<unknown>, "open">): boolean => state.open.tour && !dialogIsOpen(state);

export interface OverlaysConfig<E> {
  /** The element that has the focus now, or null. */
  active: () => E | null;
  /** Hears each new state, for rendering. */
  publish: (state: OverlaysState<E>) => void;
}

export interface Overlays<E> {
  readonly state: OverlaysState<E>;
  /** Opens an overlay; the element that has the focus is noted where this overlay returns to. */
  open(kind: OverlayKind): void;
  /** Closes an overlay and focuses where it returns to (an overlay with no return focuses nothing). */
  close(kind: OverlayKind): void;
  /** Closes an overlay and leaves the focus alone: the jump list on the chosen entry, where the scene takes it. */
  dismiss(kind: OverlayKind): void;
  /** "Show the introduction": Settings, if open, closes first without taking the focus, and the tour returns to its button. */
  openTour(): void;
  /** Opens the tour by itself (the first visit): the focus is not noted, and `tourReturn` stays as it was. */
  startTour(): void;
  /** The overlay Escape closes now; null when none of `ESCAPE_ORDER` is open. */
  escapeTarget(): OverlayKind | null;
}

export function createOverlays<E extends { focus(): void }>({ active, publish }: OverlaysConfig<E>): Overlays<E> {
  let state: OverlaysState<E> = { open: NOTHING_OPEN, tourReturn: null };
  const slots: { shared: E | null; chat: E | null } = { shared: null, chat: null };
  const change = (next: Partial<OverlaysState<E>["open"]>, tourReturn: E | null = state.tourReturn) => {
    const moved = (Object.keys(next) as OverlayKind[]).some((kind) => state.open[kind] !== next[kind]);
    if (!moved && tourReturn === state.tourReturn) return;
    state = { open: { ...state.open, ...next }, tourReturn };
    publish(state);
  };
  return {
    get state() {
      return state;
    },
    open(kind) {
      const slot = RETURN_SLOT[kind];
      if (slot) slots[slot] = active();
      change({ [kind]: true });
    },
    close(kind) {
      change({ [kind]: false });
      const slot = RETURN_SLOT[kind];
      if (slot) slots[slot]?.focus();
    },
    dismiss(kind) {
      change({ [kind]: false });
    },
    openTour() {
      change({ settings: false, tour: true }, state.open.settings ? slots.shared : null);
    },
    startTour() {
      change({ tour: true });
    },
    escapeTarget: () => ESCAPE_ORDER.find((kind) => state.open[kind]) ?? null,
  };
}

/**
 * The page's overlays: this render's state, and the moves, the same object for the page's life. A move is published
 * through `flushSync`, so the render it causes commits before the move goes on: a close lifts what the sheet made inert
 * (design choice X2: the right toolbar, the chat chip and the camera toolbar under the text view or the Chat panel)
 * before the focus returns to the opener, which an inert element would refuse (round 64's w4-7 row: Escape from the
 * text view gives the focus back to Help).
 */
export function useOverlays(): [OverlaysState<HTMLElement>, Overlays<HTMLElement>] {
  const [state, setState] = useState<OverlaysState<HTMLElement>>({ open: NOTHING_OPEN, tourReturn: null });
  const [overlays] = useState(() =>
    createOverlays<HTMLElement>({ active: () => (document.activeElement instanceof HTMLElement ? document.activeElement : null), publish: (next) => flushSync(() => setState(next)) }),
  );
  return [state, overlays];
}
