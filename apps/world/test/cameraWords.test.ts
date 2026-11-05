/* The camera keys (+, -, [, ], H) say one polite line each, as D and F do (round 65, walk finding w5-6): a screen reader
   person could not tell the key did anything. The words per camera action, pure (state/cameraWords.ts). */
import assert from "node:assert/strict";
import test from "node:test";
import { cameraWords } from "../src/state/cameraWords.ts";
import type { CameraAction } from "../src/world/TownScene.ts";

test("every camera action has a short sentence of its own", () => {
  const actions: CameraAction[] = ["zoom-in", "zoom-out", "rotate-left", "rotate-right", "home"];
  const said = actions.map((action) => cameraWords(action));
  assert.deepEqual(said, ["Zoomed in.", "Zoomed out.", "Rotated left.", "Rotated right.", "Home view."]);
  assert.equal(new Set(said).size, actions.length, "no two actions share a sentence");
});
