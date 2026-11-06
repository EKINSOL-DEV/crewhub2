/* Design choice K1 (`lenient`, round 72): a person from a newer world is accepted like a figure, and what the figure
   check ignored (an activity this world does not know) is carried in the person's warnings, so the registry can warn
   about it once. validatePerson ran validateFigure first and then answered with a fresh report of its own checks, so a
   person's ignored keys were never warned about: round 73's mutation run found the registry's `person.warnings` line
   could go with every test green. */
import assert from "node:assert/strict";
import test from "node:test";
import { validateFigure, validatePerson, type FigureSpec } from "../src/index.ts";

const person = (poses: FigureSpec["poses"] = {}): FigureSpec => ({
  format: "crewhub-figure/1",
  joints: [{ id: "body", position: [0, 0.2, 0] }],
  parts: [{ id: "peg", joint: "body", shape: "box", size: [0.2, 0.6, 0.2], position: [0, 0.3, 0], color: "slot:coat" }],
  poses,
  motions: {},
  colorways: { coat: { others: ["wood"] } },
  anchors: { label: [0, 1, 0], carry: [0, 0.4, 0.3], ground: 0.2, height: 0.9 },
});
const newer = () => person({ singing: { body: { rotation: [0, 0, 10] } } } as FigureSpec["poses"]);

test("K1: a person of this world validates with no warnings", () => {
  assert.deepEqual(validatePerson(person()), { ok: true, value: person(), warnings: [] });
});

test("K1: a person from a newer world is accepted and carries the figure check's warnings", () => {
  const asFigure = validateFigure(newer());
  assert.ok(asFigure.ok && asFigure.warnings.length === 1, "the figure check warns once about the unknown activity");
  const asPerson = validatePerson(newer());
  assert.ok(asPerson.ok, `accepted: ${asPerson.ok ? "" : asPerson.errors.join("; ")}`);
  assert.deepEqual(asPerson.warnings, ["figure.poses.singing: is not an activity this world knows; ignored"], "the person says what the figure check ignored");
});

test("K1: a person refused on its own rules carries errors, not warnings", () => {
  const refused = validatePerson({ ...newer(), perch: {} });
  assert.ok(!refused.ok, "a person never sits at a desk");
  assert.ok(refused.errors.some((e) => e.startsWith("person.perch")), refused.errors.join("; "));
});
