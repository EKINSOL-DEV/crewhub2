import assert from "node:assert/strict";
import test from "node:test";
import type { CastFactory, CastManifest, FigureSpec } from "@crewhub/world-cast";
import { createCastRegistry, type CastStyle } from "../src/world/castRegistry.ts";

const manifest = (id: string, more: Partial<CastManifest> = {}): CastManifest => ({
  format: "crewhub-cast/1",
  id,
  name: id,
  version: "1.0.0",
  description: "A test cast.",
  colors: { wood: { day: "#bf9873", lamplight: "#bf9873" } },
  budget: { nearTriangles: 100, farTriangles: 100, nearMeshes: 4, farMeshes: 4 },
  ...more,
});
const figure: FigureSpec = {
  format: "crewhub-figure/1",
  joints: [{ id: "body", position: [0, 0.2, 0] }],
  parts: [{ id: "peg", joint: "body", shape: "box", size: [0.2, 0.6, 0.2], position: [0, 0.3, 0], color: "slot:coat" }],
  poses: {},
  motions: {},
  colorways: { coat: { others: ["wood"] } },
  anchors: { label: [0, 1, 0], carry: [0, 0.4, 0.3], ground: 0.2, height: 0.9 },
};
const pegs: CastFactory = { manifest: manifest("pegs"), figure };
const mossy: CastFactory = {
  manifest: manifest("mossy-pegs", { extends: "pegs", colors: { moss: { day: "#49634f", lamplight: "#49634f" } } }),
  figure: { format: "crewhub-figure-patch/1", recolor: { wood: "moss" }, add: [{ id: "tuft", joint: "body", shape: "sphere", size: [0.1, 0.05, 0.1], position: [0, 0.65, 0], color: "moss" }] },
};
const style: CastStyle = { manifest: { id: "plain", defaultCast: "pegs" } };

function registry() {
  const warnings: string[] = [];
  const r = createCastRegistry("pegs", (m) => warnings.push(m));
  return { r, warnings };
}

test("casts register by manifest and a cast with broken data is refused", () => {
  const { r, warnings } = registry();
  assert.equal(r.registerCast(pegs), true);
  assert.equal(r.registerCast({ manifest: manifest("Bad Id"), figure }), false);
  assert.equal(r.registerCast({ manifest: manifest("no-figure") }), false);
  assert.equal(r.registerCast({ manifest: manifest("wrong-format", { extends: "pegs" }), figure }), false);
  assert.deepEqual(r.listCasts().map((m) => m.id), ["pegs"]);
  assert.equal(warnings.length, 3);
});

test("a choice resolves building over viewer over town over style, and names the unknown ids", () => {
  const { r } = registry();
  r.registerCast(pegs);
  r.registerCast(mossy);
  assert.deepEqual(r.resolve({ building: "mossy-pegs", viewer: "pegs" }), { id: "mossy-pegs", unknown: [] });
  assert.deepEqual(r.resolve({ viewer: "mossy-pegs", town: "pegs", style: "pegs" }), { id: "mossy-pegs", unknown: [] });
  assert.deepEqual(r.resolve({ building: "ghosts", viewer: "ghosts", town: "mossy-pegs" }), { id: "mossy-pegs", unknown: ["ghosts"] });
  assert.deepEqual(r.resolve({ style: "elves" }), { id: "pegs", unknown: ["elves"] });
  assert.deepEqual(r.resolve({}), { id: "pegs", unknown: [] });
});

test("extends resolves through the registry: the base's figure with the patch applied", () => {
  const { r } = registry();
  r.registerCast(mossy);
  assert.equal(r.figureOf("mossy-pegs"), null, "its base is not registered yet");
  r.registerCast(pegs);
  const spec = r.figureOf("mossy-pegs")!;
  assert.deepEqual(spec.parts.map((p) => p.id), ["peg", "tuft"]);
  assert.deepEqual(spec.colorways.coat!.others, ["moss"]);
  const cast = r.castFor(style, "mossy-pegs");
  assert.equal(cast.manifest.id, "mossy-pegs");
  assert.equal(cast.figure({ key: "a", role: "worker", accent: null }).object.getObjectsByProperty("type", "Mesh").length, 4, "peg, tuft, the shadow and the halo");
});

test("one cast instance per style; an unknown id draws the fallback with one warning", () => {
  const { r, warnings } = registry();
  r.registerCast(pegs);
  assert.equal(r.castFor(style, "pegs"), r.castFor(style, "pegs"));
  assert.notEqual(r.castFor(style, "pegs"), r.castFor({ manifest: { id: "other" } }, "pegs"));
  assert.equal(r.castFor(style, "ghosts"), r.castFor(style, "pegs"));
  r.castFor(style, "ghosts");
  assert.equal(warnings.length, 1);
  r.registerCast({ manifest: manifest("loop-a", { extends: "loop-b" }), figure: { format: "crewhub-figure-patch/1" } });
  r.registerCast({ manifest: manifest("loop-b", { extends: "loop-a" }), figure: { format: "crewhub-figure-patch/1" } });
  assert.equal(r.castFor(style, "loop-a").manifest.id, "pegs", "a cast that extends in a circle draws the fallback");
});
