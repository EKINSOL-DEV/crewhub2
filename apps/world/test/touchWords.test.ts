/* Round 65 (walk finding w4-2): the tour, the card, the build sheet and walk mode spoke of clicks and keys to a thumb.
   On a touch device (no hover, a coarse pointer) the words are a tap's and the joystick's, with no key hints; with a
   pointer and a keyboard they are as they were. */
import assert from "node:assert/strict";
import test from "node:test";
import { buildWords, followWords, walkWords } from "../src/state/inputWords.ts";
import { tourSteps } from "../src/state/tour.ts";
import { emptyTownDocument } from "@crewhub/world-model";
import { HOME_VIEW, stepView, type View, type ViewFacts } from "../src/state/view.ts";
import { planTown } from "../src/world/townPlan.ts";
import { districtsOf } from "../src/world/wayfinding.ts";
import { agent, building, world } from "./fixtures.ts";

const makeFacts = (): ViewFacts => {
  const model = world([building("alpha", [agent("alpha-dev-1", "workers")])]);
  return { model, districts: districtsOf(model), plan: planTown(emptyTownDocument(), model.buildings), rooms: "classic" };
};
const townView = (): View => ({ ...HOME_VIEW });

const KEY_HINT = /\(T\)|\(\/\)|W A S D|arrow keys|Enter|Shift|Escape|⇧F|\bR turns\b/;

test("the tour on a touch device says tap and names no key; with a pointer it says click as before (round 65, w4-2)", () => {
  for (const mode of ["demo", "live"] as const) {
    const touch = tourSteps(mode, "touch");
    const pointer = tourSteps(mode, "pointer");
    assert.deepEqual(tourSteps(mode), pointer, "the pointer's words are the default");
    assert.equal(touch.length, pointer.length);
    for (const step of touch) {
      assert.doesNotMatch(step.text, /click/i, `${step.id}: no click`);
      assert.doesNotMatch(`${step.text} ${step.targetName}`, KEY_HINT, `${step.id}: no key hint`);
    }
    assert.match(touch[0]!.text, /a tap on a building enters it/);
    assert.match(touch[2]!.text, /a tap on one opens its card/);
    assert.match(pointer[0]!.text, /a click on a building enters it/);
    assert.match(pointer[1]!.text, /the jump list \(\/\)/);
    assert.match(pointer[4]!.text, /the text view \(T\)/);
    assert.match(touch[4]!.targetName, /the text view/);
  }
});

test("walk mode's status names the joystick on a touch device, the keys otherwise (round 65, w4-2)", () => {
  assert.match(walkWords(true), /joystick/);
  assert.doesNotMatch(walkWords(true), KEY_HINT);
  assert.equal(walkWords(false), "Walking. W A S D or the arrow keys move you, Shift hurries, drag to look around. Walk through a door to go in or out. Escape stops.");
  const facts: ViewFacts = makeFacts();
  const view: View = townView();
  assert.equal(stepView(view, { type: "startWalk" }, { ...facts, touch: true }).say, walkWords(true));
  assert.equal(stepView(view, { type: "startWalk" }, facts).say, walkWords(false), "no input kind given: the keys' words");
});

test("the follow's sentence and a jump's on a touch device name no key; with a keyboard they are as before (round 65, w4-2)", () => {
  const facts = makeFacts();
  const view = townView();
  const key = "alpha-dev-1";
  assert.doesNotMatch(stepView(view, { type: "follow", key }, { ...facts, touch: true }).say ?? "", KEY_HINT);
  assert.match(stepView(view, { type: "follow", key }, { ...facts, touch: true }).say ?? "", /A drag stops following\.$/);
  assert.match(stepView(view, { type: "follow", key }, facts).say ?? "", /Escape, Shift\+F or a drag stops following\.$/);
  const entry = { label: "Postman", detail: "At the post office.", agent: "postman", place: { district: null, building: null, room: null } } as Parameters<typeof stepView>[1] extends infer I ? (I extends { type: "jump"; entry: infer E } ? E : never) : never;
  assert.match(stepView(view, { type: "jump", entry }, { ...facts, touch: true }).say ?? "", /A tap on it opens its card\.$/);
  assert.match(stepView(view, { type: "jump", entry }, facts).say ?? "", /Enter opens its card\.$/);
});

test("the build sheet and the card's Follow on a touch device: tap, drag, no keys (round 65, w4-2)", () => {
  const touch = buildWords(true), pointer = buildWords(false);
  for (const key of Object.keys(pointer) as (keyof typeof pointer)[]) {
    assert.doesNotMatch(touch[key], /click|pointer/i, `${key}: no click`);
    assert.doesNotMatch(touch[key], KEY_HINT, `${key}: no key hint`);
  }
  assert.equal(pointer.idle, "Choose a prop, or click a placed prop to select it.");
  assert.equal(touch.idle, "Choose a prop, or tap a placed prop to select it.");
  assert.equal(pointer.on, "Build mode on. Choose a prop in the palette, then click a floor or use the arrow keys and Enter to place it.");
  assert.match(touch.on, /then tap a floor to place it\.$/);
  assert.match(touch.chosen, /^Tap a floor to place it\.$/);
  assert.match(touch.placed, /a drag moves it\.$/);
  assert.match(touch.selected, /^A drag moves it\.$/);
  assert.deepEqual(followWords(false), { kbd: "⇧F", follow: "The camera follows this figure wherever it walks (Shift+F)", stop: "Stop following (Shift+F or Escape)" });
  assert.deepEqual(followWords(true), { kbd: undefined, follow: "The camera follows this figure wherever it walks", stop: "Stop following" });
});
