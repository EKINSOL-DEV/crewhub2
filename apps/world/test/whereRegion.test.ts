/* Design choice W12 (round 72, `on-choice`), as React runs it (round 73, wb-1): the "Where is …?" form's effect on a
   choice reads the choice the live region last saw, moves the ref, and queues the region's words through `setSaid`,
   whose updater React runs later, in the next render. On 3ac09921 the updater read the ref itself, after the ref had
   moved, and the region stayed silent. The effect's body is state/whereChoice.ts `whereRegionEffect`, so this test runs
   it with a ref and an updater queue standing in for React's order: the effect, then the queued updaters. The component
   (components/WhereForm.tsx) keeps the hooks and the call; the browser row is tools/regress/walk.mjs's W12 row. */
import assert from "node:assert/strict";
import test from "node:test";
import { whereRegionEffect, type WhereChosen } from "../src/state/whereChoice.ts";

const lead = { key: "cr-lead", name: "cr-lead" };
const dev = { key: "cr-dev", name: "cr-dev" };

/** A form's live region: the ref, the state and React's updater queue, run at the next render. */
function region() {
  const seen = { current: null as WhereChosen | null };
  const queue: ((said: string) => string)[] = [];
  let said = "";
  const effect = (chosen: WhereChosen | null, answer: string) => whereRegionEffect(seen, chosen, answer, (update) => void queue.push(update));
  const render = () => {
    for (const update of queue.splice(0)) said = update(said);
    return said;
  };
  return { seen, effect, render };
}

test("W12, wb-1: the region says the answer of the choice's moment, by an updater run after the ref has moved on", () => {
  const r = region();
  r.effect(null, "No agents are in the world yet.");
  assert.equal(r.render(), "", "before the first choice: nothing");
  assert.equal(r.seen.current, null);
  r.effect(lead, "cr-lead is on the floor of Brand.");
  assert.equal(r.seen.current, lead, "the ref names the choice the region now saw");
  assert.equal(r.render(), "cr-lead is on the floor of Brand.", "the updater, run after the ref moved, still says the choice's answer (wb-1)");
  r.effect(dev, "cr-dev is in the lodge.");
  assert.equal(r.render(), "cr-dev is in the lodge.", "another name: said again");
  assert.equal(r.seen.current, dev);
});

test("W12: the same choice again (its key in a new object, the name back in the world) keeps the region's words", () => {
  const r = region();
  r.effect(lead, "cr-lead is on the floor of Brand.");
  r.render();
  r.effect({ ...lead }, "cr-lead is walking to Lab.");
  assert.equal(r.render(), "cr-lead is on the floor of Brand.", "silent: the choice stands, the answer moved");
  assert.equal(r.seen.current?.key, "cr-lead");
});

test("W12: each queued updater is a closure of its own moment", () => {
  const r = region();
  r.effect(lead, "cr-lead is on the floor of Brand.");
  r.effect(dev, "cr-dev is in the lodge.");
  assert.equal(r.render(), "cr-dev is in the lodge.", "two effects before a render: the first said lead, the second dev");
  const late = region();
  late.effect(lead, "cr-lead is on the floor of Brand.");
  late.effect(null, "No agents are in the world yet.");
  assert.equal(late.render(), "cr-lead is on the floor of Brand.", "a choice cleared after: the first updater's words stand, the second keeps them");
});
