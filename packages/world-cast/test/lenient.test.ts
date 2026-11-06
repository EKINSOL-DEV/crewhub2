/* Design choice K1 (`lenient`, round 72): a cast written for a newer world (a new activity, a new role, a new work pose)
   is drawn with what this world knows. The validators keep a warnings list beside the errors: an activity key of poses,
   motions or looks this world does not know, an activity or a role in a part's lists, a role in a colourway's roles and a
   perch key are warned about and ignored (their contents are not read), for those three enums only; an unknown field
   stays an error, as in the prop format, and so does a known key with a wrong shape. */
import assert from "node:assert/strict";
import test from "node:test";
import { validateFigure, validateFigurePatch, type FigureSpec } from "../src/index.ts";

const figure = (): FigureSpec => ({
  format: "crewhub-figure/1",
  joints: [{ id: "body", position: [0, 0.2, 0] }],
  parts: [{ id: "peg", joint: "body", shape: "box", size: [0.2, 0.6, 0.2], position: [0, 0.3, 0], color: "slot:coat" }],
  poses: {},
  motions: {},
  colorways: { coat: { others: ["wood"] } },
  anchors: { label: [0, 1, 0], carry: [0, 0.4, 0.3], ground: 0.2, height: 0.9 },
});

test("K1: a valid figure of this world validates with no warnings", () => {
  assert.deepEqual(validateFigure(figure()), { ok: true, value: figure(), warnings: [] });
});

test("K1: unknown activities, roles and perch keys are warned about and ignored; the figure is accepted", () => {
  const newer = {
    ...figure(),
    parts: [
      ...figure().parts,
      { id: "hat", joint: "body", shape: "cone", size: [0.1, 0.1, 0.1], position: [0, 0.7, 0], color: "slot:coat", roles: ["lead", "gardener"], activities: ["working", "singing"] },
    ],
    poses: { working: {}, singing: { body: { rotation: "sideways" } } },
    motions: { idle: [], dancing: "not even a list" },
    looks: { near: { parts: {} }, glowing: 42 },
    colorways: { coat: { others: ["wood"], roles: { lead: "wood", gardener: "nothing" } } },
    perch: { desk: { kind: "floor" }, sofa: { kind: "ladder" } },
  };
  const checked = validateFigure(newer);
  assert.equal(checked.ok, true, checked.ok ? "" : checked.errors.join("\n"));
  const warnings = checked.ok ? checked.warnings : [];
  assert.deepEqual(
    warnings.map((w) => w.split(":")[0]).sort(),
    [
      "figure.colorways.coat.roles.gardener",
      "figure.looks.glowing",
      "figure.motions.dancing",
      "figure.parts[1].activities[1]",
      "figure.parts[1].roles[1]",
      "figure.perch.sofa",
      "figure.poses.singing",
    ],
  );
  assert.ok(warnings.every((w) => /this world knows; ignored$/.test(w)), warnings.join("\n"));
});

test("K1: an unknown field stays an error, and so does a known activity with a wrong shape", () => {
  const extra = validateFigure({ ...figure(), hat: true });
  assert.equal(extra.ok, false);
  assert.ok(!extra.ok && extra.errors.some((e) => e.startsWith("figure.hat:")), extra.ok ? "" : extra.errors.join("\n"));
  const wrong = validateFigure({ ...figure(), poses: { working: "sideways" } });
  assert.equal(wrong.ok, false);
  const bad = validateFigure({ ...figure(), parts: [{ ...figure().parts[0], roles: [] }] });
  assert.equal(bad.ok, false, "an empty roles list is still an error");
});

test("K1: a patch from a newer world is lenient the same way", () => {
  const checked = validateFigurePatch({ format: "crewhub-figure-patch/1", poses: { singing: { body: {} } }, perch: { sofa: { kind: "floor" } } });
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.ok ? checked.warnings.map((w) => w.split(":")[0]).sort() : [], ["patch.perch.sofa", "patch.poses.singing"]);
});
