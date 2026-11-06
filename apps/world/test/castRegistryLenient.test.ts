/* Design choice K1 (`lenient`, round 72): a cast from a newer world registers, drawn with what this world knows, and the
   registry warns once about what it ignored (an activity, a role, a perch key this world does not know); a cast that
   fails validation is refused as before (castRegistry.test.ts). */
import assert from "node:assert/strict";
import test from "node:test";
import type { CastFactory, CastManifest, FigureSpec } from "@crewhub/world-cast";
import { createCastRegistry } from "../src/world/castRegistry.ts";

const manifest = (id: string): CastManifest => ({
  format: "crewhub-cast/1",
  id,
  name: id,
  version: "1.0.0",
  description: "A test cast.",
  colors: { wood: { day: "#bf9873", lamplight: "#bf9873" } },
  budget: { nearTriangles: 100, farTriangles: 100, nearMeshes: 4, farMeshes: 4 },
});
const figure: FigureSpec = {
  format: "crewhub-figure/1",
  joints: [{ id: "body", position: [0, 0.2, 0] }],
  parts: [{ id: "peg", joint: "body", shape: "box", size: [0.2, 0.6, 0.2], position: [0, 0.3, 0], color: "slot:coat" }],
  poses: { singing: { body: { rotation: [0, 0, 10] } } } as FigureSpec["poses"],
  motions: {},
  colorways: { coat: { others: ["wood"] } },
  anchors: { label: [0, 1, 0], carry: [0, 0.4, 0.3], ground: 0.2, height: 0.9 },
};

test("K1: a cast from a newer world registers, and the registry warns once about what it ignored", () => {
  const warnings: string[] = [];
  const registry = createCastRegistry("pegs", (m) => warnings.push(m));
  const newer: CastFactory = { manifest: manifest("newer-pegs"), figure };
  assert.equal(registry.registerCast(newer), true);
  assert.equal(registry.has("newer-pegs"), true);
  assert.deepEqual(registry.refused(), []);
  assert.equal(warnings.length, 1, warnings.join("\n---\n"));
  assert.match(warnings[0]!, /^Cast "newer-pegs" comes from a newer world; ignored:\n {2}figure\.poses\.singing: is not an activity this world knows; ignored$/);
  // The same cast under another id warns again (its own message); the same message never twice.
  assert.equal(registry.registerCast({ manifest: manifest("newer-pegs-2"), figure }), true);
  assert.equal(warnings.length, 2);
});

test("K1: a cast whose person comes from a newer world warns once about what the person check ignored", () => {
  const warnings: string[] = [];
  const registry = createCastRegistry("pegs", (m) => warnings.push(m));
  const ofThisWorld: FigureSpec = { ...figure, poses: {} };
  const person: FigureSpec = { ...figure, poses: { singing: { body: { rotation: [0, 0, 10] } } } as FigureSpec["poses"] };
  assert.equal(registry.registerCast({ manifest: manifest("newer-person"), figure: ofThisWorld, person }), true);
  assert.deepEqual(registry.refused(), []);
  assert.equal(warnings.length, 1, warnings.join("\n---\n"));
  assert.match(warnings[0]!, /^Cast "newer-person" comes from a newer world; ignored:\n {2}figure\.poses\.singing: is not an activity this world knows; ignored$/);
});
