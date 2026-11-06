/* Design choice X5 (`short`, round 72): the town's canvas is named "The town" (fixed: it does not follow the place), and
   its key guide, unchanged, stands in a visually hidden paragraph the canvas points to with aria-describedby, so a screen
   reader says "The town, application" on focus and the guide after a pause or on request; before, the 60 words were the
   name, read in full on every focus. The naming is world/canvasName.ts (TownScene makes the paragraph in the canvas's host
   and calls it in its constructor; the scene itself loads under Vite only); this test drives it with fake elements. */
import assert from "node:assert/strict";
import test from "node:test";
import { TOWN_CANVAS_NAME, TOWN_KEY_GUIDE, TOWN_KEY_GUIDE_ID, nameTownCanvas } from "../src/world/canvasName.ts";

test("X5: the canvas is named 'The town' and described by the hidden key guide, unchanged", () => {
  const attributes = new Map<string, string>();
  const canvas = { setAttribute: (name: string, value: string) => void attributes.set(name, value) };
  const guide = { id: "", className: "", textContent: null as string | null };
  nameTownCanvas(canvas, guide);
  assert.equal(attributes.get("aria-label"), "The town");
  assert.equal(TOWN_CANVAS_NAME, "The town");
  assert.equal(attributes.get("aria-describedby"), guide.id);
  assert.equal(guide.id, TOWN_KEY_GUIDE_ID);
  assert.equal(guide.className, "sr-only");
  assert.equal(guide.textContent, TOWN_KEY_GUIDE);
  assert.match(TOWN_KEY_GUIDE, /^Arrow keys move between buildings, Enter goes inside\. .*Slash opens the jump list\.$/);
  assert.ok(!TOWN_KEY_GUIDE.startsWith("The town"), "the name is not repeated in the guide");
});
