/* Which keys pressed inside the stage are the scene's (App.tsx `sceneKey`; round 50, r50-a11y A4): the agent card and
   any dialog inside the stage keep their keys, so an arrow in an open card scrolls it instead of moving the ring behind
   it. Pure: the target only needs `closest`, as an element has. */
import assert from "node:assert/strict";
import test from "node:test";
import { sceneOwnsKey } from "../src/state/sceneKeys.ts";

/** An element whose ancestors (itself first) match the selectors given. */
const inside = (...matches: string[]) => ({
  closest: (selector: string) => (selector.split(",").some((s) => matches.includes(s.trim())) ? {} : null),
});

test("sceneOwnsKey: the canvas and the scene's labels are the scene's; a card or a dialog in the stage is not", () => {
  assert.equal(sceneOwnsKey(inside("canvas")), true, "the canvas");
  assert.equal(sceneOwnsKey(inside(".town-sign")), true, "a building's sign");
  assert.equal(sceneOwnsKey(inside('[role="dialog"]', ".agent-card")), false, "a control in an open agent card");
  assert.equal(sceneOwnsKey(inside('[role="dialog"]')), false, "any dialog in the stage (the failed card too)");
  assert.equal(sceneOwnsKey(null), true, "no target: as before");
  assert.equal(sceneOwnsKey({}), true, "a target without closest (not an element): as before");
});
