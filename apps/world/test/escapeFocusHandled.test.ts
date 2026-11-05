/* Escape with the focus in the text view over build mode (round 65, w6-7) is handled by the view: the key goes no
   further (round 68, mutation run mx1 over sugg/w6-7: `handled: false` on that line passed every test). */
import assert from "node:assert/strict";
import test from "node:test";
import { emptyTownDocument } from "@crewhub/world-model";
import { HOME_VIEW, stepView, type ViewFacts } from "../src/state/view.ts";
import { planTown } from "../src/world/townPlan.ts";
import { districtsOf } from "../src/world/wayfinding.ts";
import { agent, building, world } from "./fixtures.ts";

const facts = (): ViewFacts => {
  const model = world([building("alpha", [agent("alpha-dev-1", "workers")])]);
  return { model, districts: districtsOf(model), plan: planTown(emptyTownDocument(), model.buildings), rooms: "classic" };
};

test("w6-7: Escape with the focus in the text view closes the text view, says nothing, leaves the view as it is, and is handled", () => {
  const step = stepView(HOME_VIEW, { type: "escape", open: { text: true, build: true }, focus: "text" }, facts());
  assert.deepEqual(step, { view: HOME_VIEW, say: null, close: "text", handled: true });
});
