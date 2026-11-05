import assert from "node:assert/strict";
import test from "node:test";
import { emptyTownDocument } from "@crewhub/world-model";
import { escapeLayer } from "../src/state/sceneKeys.ts";
import { HOME_VIEW, stepView, type ViewFacts } from "../src/state/view.ts";
import { planTown } from "../src/world/townPlan.ts";
import { districtsOf } from "../src/world/wayfinding.ts";
import { agent, building, world } from "./fixtures.ts";

const facts = (): ViewFacts => {
  const model = world([building("alpha", [agent("alpha-dev-1", "workers")])]);
  return { model, districts: districtsOf(model), plan: planTown(emptyTownDocument(), model.buildings), rooms: "classic" };
};
const escape = (open: { text: boolean; build: boolean }, focus: "text" | "build" | null) => stepView(HOME_VIEW, { type: "escape", open, focus }, facts());

test("w6-7: with build mode and the text view both open, Escape closes the layer that holds the focus", () => {
  assert.equal(escape({ text: true, build: true }, "text").close, "text", "the focus in the text view: the text view closes, build mode stays");
  assert.equal(escape({ text: true, build: true }, "build").close, "build", "the focus in the build sheet: build mode closes");
  assert.equal(escape({ text: true, build: true }, null).close, "build", "the focus on the scene: the fixed order, build mode first");
  assert.equal(escape({ text: true, build: false }, null).close, "text");
  assert.equal(escape({ text: false, build: true }, "text").close, "build", "a focus the text view does not hold (it is closed) changes nothing");
});

test("the layer a key's target stands in: the text view, the build sheet, or neither", () => {
  const inside = (selectors: string[]) => ({ closest: (selector: string) => (selectors.some((s) => selector.split(",").map((x) => x.trim()).includes(s)) ? {} : null) });
  assert.equal(escapeLayer(inside(["#text-view"])), "text");
  assert.equal(escapeLayer(inside([".build-sheet"])), "build");
  assert.equal(escapeLayer(inside(["canvas"])), null);
  assert.equal(escapeLayer(null), null);
});
