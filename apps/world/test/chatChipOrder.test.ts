/* In live mode the Chat chip stands at the top right under Settings, but came last in the Tab order, after the stage,
   the signs, the pins and the camera toolbar (round 65, walk finding w5-17): a keyboard person looking at the header did
   not find it there. The chip now follows Settings in the page (right after the right corner, before the scene), where it
   is seen; the demo's dock at the bottom right stays last, as it is seen. Read from the source, as chromeOrder.test.ts
   does: these tests have no browser. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/world.css", import.meta.url), "utf8");

/** The z-index of the first rule whose selector list is exactly `selector`. */
function zIndex(selector: string): number {
  const at = css.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, `${selector} has a rule`);
  const z = /z-index:\s*(\d+);/.exec(css.slice(at, css.indexOf("}", at)));
  assert.ok(z, `${selector} has a z-index`);
  return Number(z[1]);
}

test("the live Chat chip comes right after the right corner (Settings) and before the scene; the demo's dock stays after the scene", () => {
  const tools = app.indexOf("<CornerTools ");
  const main = app.indexOf('<main className="world-stage"');
  const live = app.indexOf("{!demo && <ChatCorner ");
  const dock = app.indexOf("{demo && <ChatCorner ");
  assert.ok(tools > 0 && main > tools, "the right corner, then the scene");
  assert.ok(live > tools && live < main, "the live chip between the right corner and the scene");
  assert.ok(dock > main, "the demo's dock after the scene");
  assert.ok(!/^\s*<ChatCorner /m.test(app), "no unconditional ChatCorner is left");
});

test("earlier in the page, the live chip still paints over the frame rate overlay as it did when it came later", () => {
  // The frame rate overlay (inside the scene, z-index 6) starts 5rem down and the chip ends about 6rem down, both at the
  // right edge: a tie went to the chip, later in the page. Before the scene it needs the higher z-index; the corners
  // (7) and an agent's card (7, later in the page) keep their places.
  assert.equal(zIndex(".world-chat.world-chat-live"), 7);
  assert.ok(zIndex(".world-chat.world-chat-live") > zIndex(".fps-overlay"));
  assert.ok(zIndex(".world-chat.world-chat-live") <= zIndex(".world-corner"));
});
