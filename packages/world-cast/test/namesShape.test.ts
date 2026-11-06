/* Design choice K1 (`lenient`, round 72): a part's roles or activities list is lenient about names this world does not
   know, but its shape is still checked: every entry a string, at least one. Round 73's mutation run found the "every"
   unpinned: a list with a number among its names passed as if the one string were enough. */
import assert from "node:assert/strict";
import test from "node:test";
import { validateFigure, type FigureSpec } from "../src/index.ts";

const figure = (part: Record<string, unknown>): FigureSpec =>
  ({
    format: "crewhub-figure/1",
    joints: [{ id: "body", position: [0, 0.2, 0] }],
    parts: [{ id: "peg", joint: "body", shape: "box", size: [0.2, 0.6, 0.2], position: [0, 0.3, 0], color: "slot:coat", ...part }],
    poses: {},
    motions: {},
    colorways: { coat: { others: ["wood"] } },
    anchors: { label: [0, 1, 0], carry: [0, 0.4, 0.3], ground: 0.2, height: 0.9 },
  }) as unknown as FigureSpec;

test("K1: a roles or activities list with an entry that is not a name is an error, lenient or not", () => {
  const roles = validateFigure(figure({ roles: ["lead", 3] }));
  assert.ok(!roles.ok, "a number among the roles");
  assert.ok(roles.errors.some((e) => e.startsWith("figure.parts[0].roles: must be a list of")), roles.errors.join("; "));
  const activities = validateFigure(figure({ activities: ["working", null] }));
  assert.ok(!activities.ok, "a null among the activities");
  assert.ok(activities.errors.some((e) => e.startsWith("figure.parts[0].activities: must be a list of")), activities.errors.join("; "));
  const fine = validateFigure(figure({ roles: ["lead", "gardener"] }));
  assert.ok(fine.ok && fine.warnings.length === 1, "an unknown name is a warning, as before");
});
