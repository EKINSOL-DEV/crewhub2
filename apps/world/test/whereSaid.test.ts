/* Design choice W12 (round 72, `on-choice`): the "Where is …?" answer is announced when a name is chosen, once; while
   the choice stands, the visible answer updates silently (an agent walks, the names nearby change) and the live region
   keeps its words. Nothing is said before the first choice (the text view opening says nothing by itself). */
import assert from "node:assert/strict";
import test from "node:test";
import { whereSaid } from "../src/state/whereChoice.ts";

const lead = { key: "cr-lead", name: "cr-lead" };
const dev = { key: "cr-dev", name: "cr-dev" };

test("W12: said once at the choice, kept while the answer moves on", () => {
  assert.equal(whereSaid("", null, null, "cr-lead is on the floor of Brand."), "", "before the first choice: nothing");
  assert.equal(whereSaid("", null, lead, "cr-lead is on the floor of Brand."), "cr-lead is on the floor of Brand.", "a name chosen: its answer now");
  assert.equal(whereSaid("cr-lead is on the floor of Brand.", lead, lead, "cr-lead is walking to Lab."), "cr-lead is on the floor of Brand.", "the same choice, the answer moved: silent");
  assert.equal(whereSaid("cr-lead is on the floor of Brand.", lead, dev, "cr-dev is in the lodge."), "cr-dev is in the lodge.", "another name: said again");
  assert.equal(whereSaid("cr-dev is in the lodge.", dev, { ...dev }, "cr-dev is no longer in the world."), "cr-dev is in the lodge.", "the same key in a new object is the same choice");
});
