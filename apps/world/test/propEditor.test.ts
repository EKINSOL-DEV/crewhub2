import assert from "node:assert/strict";
import test from "node:test";
import { PROP_SHAPES, validatePropModel } from "@crewhub/world-engine";
import { blankProp, draftToModel, newPart, propIdFor, snap, snapPart } from "../src/world/propEditor.ts";

test("snapping lands on the 5 cm grid without floating dust, and turns on 15 degrees", () => {
  assert.equal(snap(0.123), 0.1);
  assert.equal(snap(0.126), 0.15);
  assert.equal(snap(0.1 + 0.05), 0.15);
  assert.equal(snap(-0.074), -0.05);
  assert.equal(snap(-0.01), 0);
  assert.equal(Object.is(snap(-0.01), -0), false);
  assert.equal(snap(Number.NaN), 0);
  assert.deepEqual(snapPart({ shape: "box", size: [0.31, 0.29, 0.52], position: [0.02, 0.16, -0.33], rotation: [0, 50, 7], material: "timber" }), {
    shape: "box",
    size: [0.3, 0.3, 0.5],
    position: [0, 0.15, -0.35],
    rotation: [0, 45, 0],
    material: "timber",
  });
});

test("every shape the editor adds is a valid prop on its own, on a one-cell footprint", () => {
  for (const shape of PROP_SHAPES) {
    const result = validatePropModel({ ...draftToModel(blankProp(), null), parts: [newPart(shape)] });
    assert.ok(result.ok, `${shape}: ${result.ok ? "" : result.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
  }
});

test("a new prop takes its id from its name; an edited one keeps its id; both are local", () => {
  assert.equal(propIdFor("Coffee Machine!"), "user:coffee-machine");
  assert.equal(propIdFor("  ***  "), "user:prop");
  assert.equal(propIdFor("Café crème"), "user:cafe-creme");
  const draft = { ...blankProp(), name: "Tall fern", provenance: { kind: "ticket" as const, ticketKey: "CR-1" } };
  assert.equal(draftToModel(draft, null).id, "user:tall-fern");
  assert.equal(draftToModel(draft, "user:old-fern").id, "user:old-fern");
  assert.deepEqual(draftToModel(draft, null).provenance, { kind: "local" });
});

test("a part pushed off its footprint is caught by the same validator the save uses", () => {
  const draft = blankProp();
  draft.parts = [{ ...newPart("box"), position: [0.4, 0.15, 0] }];
  const result = validatePropModel(draftToModel(draft, null));
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.errors[0]!.path, /^parts\[0\]/);
});
