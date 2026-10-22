/* The introduction inside the world (round 20): a first-run tour of six short steps over the real UI, for a person who
   opens the world for the first time, in demo and live mode. The words are docs/INTRODUCTION.md's, shorter (a test
   checks the phrases against the document). Pure: the steps, when the tour may start, where its card goes, and the
   per-browser flag that keeps it from coming back after Skip or Done. The component is components/Tour.tsx. */

export const TOUR_KEY = "crewhub-world.tour";
/** The full document, on GitHub: the host and Vite serve the world, not the repository's docs folder, and a page cannot
    open a file of the checkout; the GitHub page renders the document with its pictures. */
export const INTRODUCTION_URL = "https://github.com/EKINSOL-DEV/crewhub2/blob/feat/world-demo/docs/INTRODUCTION.md";

export interface TourStep {
  id: "town" | "building" | "card" | "chat" | "text" | "connection";
  title: string;
  /** One sentence, picture-free. */
  text: string;
  /** The element the step points at (a CSS selector), or null for a step about something not on the screen as such. */
  target: string | null;
  /** What the highlighted element is, for a screen reader, when the element carries no name of its own. */
  targetName: string;
}

/** The steps in the order the person meets them, by mode: the chat and the chip differ between the demo and live. */
export function tourSteps(mode: "demo" | "live"): TourStep[] {
  return [
    {
      id: "town",
      title: "The town",
      text: "One building per project, on a town plan that grows with the project count; a click on a building enters it.",
      target: "main.world-stage",
      targetName: "the town",
    },
    {
      id: "building",
      title: "A building and its three rooms",
      text: "Inside, Administration by the front door carries the racks of packages (the tickets), the floor holds the workers' desks, and the lead sits in the office at the back; the jump list (/) names every building.",
      target: ".jump-button",
      targetName: "the jump list button",
    },
    {
      id: "card",
      title: "A figure's card",
      text: "Agents are figures in rooms by role; a click on one opens its card: where it is, when loops last saw it, its work ticket and its latest progress line.",
      target: "main.world-stage",
      targetName: "the town, where the figures stand",
    },
    mode === "demo"
      ? {
          id: "chat",
          title: "The chat",
          text: "The demo keeps a scripted chat dock; its replies show as speech bubbles over the figures, as the real chat's answers do in live mode.",
          target: ".world-chat",
          targetName: "the chat corner",
        }
      : {
          id: "chat",
          title: "The chat",
          text: "The Chat chip frames crewhub-loops' own chat. Where crewhub-loops lets the world's key read the chat (a viewer key), an agent's answer shows as a speech bubble over its figure for a few seconds; else the Connection panel's Chat section says how to make one.",
          target: ".chat-open",
          targetName: "the Chat chip",
        },
    {
      id: "text",
      title: "The text view",
      text: "Every fact the scene shows is also a sentence: the text view (T) describes the whole world as text, and Where is …? answers for one agent in zone labels.",
      target: null,
      targetName: "the text view, opened with T",
    },
    mode === "demo"
      ? {
          id: "connection",
          title: "The Demo chip",
          text: "This is demo mode: scripted data in loops' own shapes, no account and no network; the chip picks a scenario, and Settings › Source switches to a live crewhub-loops.",
          target: ".demo-chip",
          targetName: "the Demo chip",
        }
      : {
          id: "connection",
          title: "The Connection panel",
          text: "The chip at the top right says how the world stands with its host and crewhub-loops (Live, Catching up, Loops down…) and opens the Connection panel: where loops was found, the key and the stream.",
          target: "button.connection-chip",
          targetName: "the connection chip",
        },
  ];
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const local = (storage: Storage | null | undefined) => (storage === undefined ? globalThis.localStorage : storage);

/** Whether this browser has seen the tour through to Skip or Done. Storage may throw (a private window): then false, and the tour shows again. */
export function readTourDone(storage?: Storage | null): boolean {
  try {
    return local(storage)?.getItem(TOUR_KEY) === "done";
  } catch {
    return false;
  }
}

export function writeTourDone(storage?: Storage | null): void {
  try {
    local(storage)?.setItem(TOUR_KEY, "done");
  } catch {
    // Not kept: the tour shows again next time, which is the honest fallback.
  }
}

export interface TourConditions {
  /** The per-browser flag. */
  done: boolean;
  /** `navigator.webdriver`: a browser driven by a tool (the regress and the shots) never gets the tour unless asked. */
  webdriver: boolean;
  /** The page's query: `tour=on` asks for it whatever the rest says, `tour=off` refuses it. */
  search: string;
  /** A Connect screen or the pairing page stands in for the town. */
  screenShown: boolean;
  /** Settings, the jump list, the Connection panel, the chat, a card, the text view, build mode, the prop editor. */
  dialogOpen: boolean;
  graphicsFailed: boolean;
}

/** Whether the tour starts by itself now. The URL flag decides first; then never for a tool, never again after Skip or Done, and never over a screen or a dialog. */
export function tourShouldStart(c: TourConditions): boolean {
  const asked = new URLSearchParams(c.search).get("tour");
  if (asked === "off") return false;
  if (c.screenShown || c.dialogOpen || c.graphicsFailed) return false;
  if (asked === "on") return true;
  return !c.done && !c.webdriver;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placement {
  /** Fixed-position offsets of the card, in px. */
  left: number;
  top: number;
  /** Where the card stands relative to the target, for the pointer the style draws. */
  side: "below" | "above" | "centre";
}

const GUTTER = 16;
const GAP = 12;

/**
 * Where the card goes so that it never covers the element it describes: below the target when there is room, else
 * above, else beside it; a step without a target is centred. On a phone (under 600 px) the card spans the width and
 * sits at the bottom, or at the top when the target is in the lower half of the screen.
 */
export function placeStep(target: Rect | null, viewport: { width: number; height: number }, card: { width: number; height: number }): Placement {
  const phone = viewport.width < 600;
  if (target === null) {
    return { left: Math.max(GUTTER, (viewport.width - card.width) / 2), top: phone ? viewport.height - card.height - GUTTER : Math.max(GUTTER, (viewport.height - card.height) / 2), side: "centre" };
  }
  const centreY = target.top + target.height / 2;
  if (phone) {
    const lower = centreY > viewport.height / 2;
    return { left: GUTTER, top: lower ? GUTTER : viewport.height - card.height - GUTTER, side: lower ? "above" : "below" };
  }
  const clampLeft = (x: number) => Math.min(Math.max(GUTTER, x), Math.max(GUTTER, viewport.width - card.width - GUTTER));
  const centred = clampLeft(target.left + target.width / 2 - card.width / 2);
  const below = target.top + target.height + GAP;
  if (below + card.height + GUTTER <= viewport.height) return { left: centred, top: below, side: "below" };
  const above = target.top - GAP - card.height;
  if (above >= GUTTER) return { left: centred, top: above, side: "above" };
  // A target as tall as the screen (the town itself): the card sits over its lower part, which it does not describe as such.
  return { left: centred, top: Math.max(GUTTER, viewport.height - card.height - GUTTER), side: "centre" };
}
