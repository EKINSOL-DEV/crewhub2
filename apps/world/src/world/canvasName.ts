/* The town canvas's accessible name and its key guide (design choice X5, `short`, round 72). The name is "The town",
   fixed (not the place: that would rename the canvas on every move; the stage around it has its own name). The guide,
   about 60 words, stands unchanged in a visually hidden paragraph beside the canvas that the canvas points to with
   aria-describedby: a screen reader says "The town, application" on focus and the guide after a pause or on request
   (NVDA+Tab, VoiceOver's hint). Before, the guide was the name, read in full on every focus. The smallest DOM surface, so
   apps/world/test/canvasName.test.ts holds it with fake elements; TownScene makes the paragraph and calls this once. */

export const TOWN_CANVAS_NAME = "The town";
export const TOWN_KEY_GUIDE_ID = "town-key-guide";
export const TOWN_KEY_GUIDE =
  "Arrow keys move between buildings, Enter goes inside. Inside a building arrow keys move between rooms, Enter zooms to a room, Escape goes back one level. Plus and minus zoom, brackets rotate, H returns home. D shows every label. W walks you around (W A S D or arrow keys, Escape stops). T opens the text view. Slash opens the jump list.";

/** Names the canvas "The town" and makes `guide` (a fresh paragraph in the canvas's host) its hidden description. */
export function nameTownCanvas(canvas: { setAttribute(name: string, value: string): void }, guide: { id: string; className: string; textContent: string | null }): void {
  canvas.setAttribute("aria-label", TOWN_CANVAS_NAME);
  guide.id = TOWN_KEY_GUIDE_ID;
  guide.className = "sr-only";
  guide.textContent = TOWN_KEY_GUIDE;
  canvas.setAttribute("aria-describedby", TOWN_KEY_GUIDE_ID);
}
