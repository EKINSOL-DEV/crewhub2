/* A card opened by Enter on the stage says one polite line (round 65, walk finding w5-11): the focus stays on the stage
   by design (the arrows keep moving the ring), so before, a blind person did not know a card had opened until the next
   Tab landed on "Close the card of …". The sentence is the view's (state/view.ts `openCard`), in the town and inside
   a building; a click still opens a card without a word (the pointer saw it). */
import assert from "node:assert/strict";
import test from "node:test";
import { emptyTownDocument, type WorldModel } from "@crewhub/world-model";
import { planTown } from "../src/world/townPlan.ts";
import { districtsOf, jumpEntries } from "../src/world/wayfinding.ts";
import { HOME_VIEW, stepView, type ViewFacts } from "../src/state/view.ts";
import { agent, building, world } from "./fixtures.ts";

const facts = (): ViewFacts & { model: WorldModel } => {
  const model = world([building("alpha", [agent("alpha-dev-1", "workers", { displayName: "Ada" })])], { postOffice: [agent("postman", "lobby", { displayName: "Postman" })] });
  return { model, districts: districtsOf(model), plan: planTown(emptyTownDocument(), model.buildings), rooms: "classic" };
};

test("Enter on a figure the jump list landed beside, in the town, opens its card and says so", () => {
  const f = facts();
  const postman = jumpEntries(f.model, f.districts).find((e) => e.kind === "agent" && e.agent === "postman")!;
  const landed = stepView(HOME_VIEW, { type: "jump", entry: postman }, f);
  const opened = stepView(landed.view, { type: "key", key: "Enter", onCanvas: true }, f);
  assert.equal(opened.view.card, true);
  assert.equal(opened.say, "Card of Postman open; Tab reaches it.");
});

test("Enter on a selected figure inside a building opens its card and says so with the figure's name", () => {
  const f = facts();
  const ada = jumpEntries(f.model, f.districts).find((e) => e.kind === "agent" && e.agent === "alpha-dev-1")!;
  const landed = stepView(HOME_VIEW, { type: "jump", entry: ada }, f);
  assert.equal(landed.view.entered, "alpha");
  const opened = stepView(landed.view, { type: "key", key: "Enter", onCanvas: true }, f);
  assert.equal(opened.view.card, true);
  assert.equal(opened.say, "Card of Ada open; Tab reaches it.");
});

test("a click on a figure opens its card without a word, as before", () => {
  const f = facts();
  const picked = stepView(HOME_VIEW, { type: "pick", target: { kind: "agent", key: "postman" }, hover: false }, f);
  assert.equal(picked.view.card, true);
  assert.equal(picked.say, null);
});
