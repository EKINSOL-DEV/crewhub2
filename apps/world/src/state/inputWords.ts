/* The page's words by input kind (round 65, walk finding w4-2): a touch device (a coarse pointer, the first half of the
   joystick's CSS rule; a narrow window with a mouse keeps the keys' words) has no click and no key, so the tour, walk mode, the build sheet and the card's Follow say tap, drag and the
   joystick there, and name no key. With a pointer and a keyboard the words are as they were. Pure: media.ts reads the
   input kind (`useTouchInput`, `touchInput`); tour.ts takes it as a parameter. */

export type InputKind = "pointer" | "touch";

/** Walk mode's status sentence. */
export function walkWords(touch: boolean): string {
  return touch
    ? "Walking. The joystick at the bottom left moves you, drag to look around. Walk through a door to go in or out. The Walk button stops."
    : "Walking. W A S D or the arrow keys move you, Shift hurries, drag to look around. Walk through a door to go in or out. Escape stops.";
}

/** Build mode's sentences: the sheet's idle line and its "point at a floor" tail, and the announcements. */
export function buildWords(touch: boolean): { idle: string; point: string; on: string; chosen: string; placed: string; selected: string } {
  return touch
    ? {
        idle: "Choose a prop, or tap a placed prop to select it.",
        point: "tap a floor.",
        on: "Build mode on. Choose a prop in the palette, then tap a floor to place it.",
        chosen: "Tap a floor to place it.",
        placed: "It is selected: a drag moves it.",
        selected: "A drag moves it.",
      }
    : {
        idle: "Choose a prop, or click a placed prop to select it.",
        point: "point at a floor or use the arrow keys.",
        on: "Build mode on. Choose a prop in the palette, then click a floor or use the arrow keys and Enter to place it.",
        chosen: "Move the pointer over a floor or use the arrow keys, R turns it, Enter or a click places it.",
        placed: "It is selected: arrow keys move it, R turns it.",
        selected: "Arrow keys or a drag move it, R turns it, Delete removes it.",
      };
}

/** What stops a follow, said when it starts. */
export function followStopWords(touch: boolean): string {
  return touch ? "A drag stops following." : "Escape, Shift+F or a drag stops following.";
}

/** What opens the card of a figure a jump landed on. */
export function figureCardWords(touch: boolean): string {
  return touch ? "A tap on it opens its card." : "Enter opens its card.";
}

/** The card's Follow button: its titles. Its key hint, as every button's, is hidden under a coarse pointer (world.css). */
export function followWords(touch: boolean): { follow: string; stop: string } {
  return touch
    ? { follow: "The camera follows this figure wherever it walks", stop: "Stop following" }
    : { follow: "The camera follows this figure wherever it walks (Shift+F)", stop: "Stop following (Shift+F or Escape)" };
}
