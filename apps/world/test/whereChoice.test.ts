/* "Where is …?" (components/WhereForm.tsx): which name the select shows and what the answer is about (round 50,
   r48-ui U6). A name the person chose stays chosen when it leaves the world (a person's visit ends, a worker's session
   goes): the answer says so, and never switches to another agent by itself. Pure, no DOM. */
import assert from "node:assert/strict";
import test from "node:test";
import { goneWords, whereChoice } from "../src/state/whereChoice.ts";

const agents = [
  { key: "analyst", displayName: "Analyst" },
  { key: "cr-lead", displayName: "cr-lead" },
];
const nicky: [string, string] = ["p-nicky", "Nicky"];

test("whereChoice: nothing chosen yet, the first agent; nobody in the world, no choice", () => {
  assert.deepEqual(whereChoice(agents, [nicky], null), { selected: "analyst", gone: null, options: [] });
  assert.deepEqual(whereChoice([], [nicky], null), { selected: "p-nicky", gone: null, options: [] });
  assert.deepEqual(whereChoice([], [], null), { selected: "", gone: null, options: [] });
});

test("whereChoice: a chosen name in the world is the choice", () => {
  assert.deepEqual(whereChoice(agents, [nicky], { key: "cr-lead", name: "cr-lead" }), { selected: "cr-lead", gone: null, options: [] });
  assert.deepEqual(whereChoice(agents, [nicky], { key: "p-nicky", name: "Nicky" }), { selected: "p-nicky", gone: null, options: [] });
});

test("whereChoice (U6): a chosen person whose visit ends stays chosen, said to be gone, with an option of its own", () => {
  const choice = whereChoice(agents, [], { key: "p-nicky", name: "Nicky" });
  assert.equal(choice.selected, "p-nicky", "the select keeps the chosen name, not the first agent");
  assert.equal(choice.gone, "Nicky");
  assert.deepEqual(choice.options, [{ key: "p-nicky", label: "Nicky (no longer in the world)" }]);
  assert.equal(goneWords(choice.gone!), "Nicky is no longer in the world.");
});

test("whereChoice (U6): a chosen agent whose session goes stays chosen too, and comes back as itself", () => {
  const gone = whereChoice([agents[0]!], [nicky], { key: "cr-lead", name: "cr-lead" });
  assert.deepEqual(gone, { selected: "cr-lead", gone: "cr-lead", options: [{ key: "cr-lead", label: "cr-lead (no longer in the world)" }] });
  assert.deepEqual(whereChoice(agents, [nicky], { key: "cr-lead", name: "cr-lead" }), { selected: "cr-lead", gone: null, options: [] }, "back in the world");
});
