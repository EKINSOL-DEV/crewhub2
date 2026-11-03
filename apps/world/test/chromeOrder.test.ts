/* The header comes before the scene in the Tab order (round 52, r50-a11y A9), without changing what paints over what.
   Read from the source, as the design guard reads the CSS: the page is drawn by a browser, these tests have none. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/world.css", import.meta.url), "utf8");

/** The z-index of the first rule whose selector list is exactly `selector`. */
function zIndex(selector: string): number {
  const at = css.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, `${selector} has a rule`);
  const body = css.slice(at, css.indexOf("}", at));
  const z = /z-index:\s*(\d+);/.exec(body);
  assert.ok(z, `${selector} has a z-index`);
  return Number(z[1]);
}

test("the corners (brand, Demo chip, jump list, Settings, '?') come before the scene's labels in the page", () => {
  const main = app.indexOf('<main className="world-stage"');
  assert.ok(main > 0, "the scene's <main>");
  // The scene's labels (building signs, district cards, pins, chat marks, bubbles) are all inside <main>: from the skip
  // link, Tab reaches the header first, as it is seen (WCAG 2.4.3).
  assert.ok(app.indexOf("<Corner ") > 0 && app.indexOf("<Corner ") < main, "the left corner is before <main>");
  assert.ok(app.indexOf("<CornerTools ") > 0 && app.indexOf("<CornerTools ") < main, "the right corner is before <main>");
});

test("the corners paint as they did when they came after the scene: over its top overlays, under an agent's card", () => {
  const corner = zIndex(".world-corner");
  // Earlier in the page, a tie now goes to the scene: the frame rate and the dev overlays (under the right and the left
  // corner) and the Agent chats row (under the right corner) stay under the corners by their z-index alone.
  for (const overlay of [".fps-overlay", ".dev-overlay", ".world-chat"]) assert.ok(corner > zIndex(overlay), `${overlay} under the corners`);
  // An agent's card opened near a corner still covers it (inside <main>, later in the page, at the same z-index).
  assert.ok(corner <= zIndex(".anchor.card-anchor"), "the agent card over the corners");
});

test("an open menu in the right corner ('?') paints over the sheets, as the Demo chip's menu does (round 53, A5)", () => {
  // The right corner makes its own stacking context (its backdrop filter), so the menu's own z-index stays inside it:
  // with Settings open, "?" opened its menu under the sheet, the rows hidden. While a menu in it is open, the corner
  // itself rises to the menu's level.
  const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
  const zMenu = Number(/--z-menu:\s*(\d+);/.exec(tokens)?.[1]);
  const at = css.indexOf("\n.world-corner-right:has(.menu:not([hidden])) {");
  assert.ok(at >= 0, "the right corner rises while a menu in it is open");
  assert.match(css.slice(at, css.indexOf("}", at)), /z-index:\s*var\(--z-menu\);/, "to the menu's level");
  for (const sheet of [".world-sheet", ".jump-sheet", ".chat-sheet", ".agent-card-sheet", ".anchor.card-anchor"]) assert.ok(zMenu > zIndex(sheet), `the open menu over ${sheet}`);
});
