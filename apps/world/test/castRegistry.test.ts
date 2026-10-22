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

test("a choice resolves building over zone over viewer over town over style, and names the unknown ids", () => {
  const { r } = registry();
  r.registerCast(pegs);
  r.registerCast(mossy);
  assert.deepEqual(r.resolve({ building: "mossy-pegs", viewer: "pegs" }), { id: "mossy-pegs", unknown: [] });
  assert.deepEqual(r.resolve({ building: "pegs", zone: "mossy-pegs", viewer: "mossy-pegs" }), { id: "pegs", unknown: [] });
  assert.deepEqual(r.resolve({ zone: "mossy-pegs", viewer: "pegs", town: "pegs", style: "pegs" }), { id: "mossy-pegs", unknown: [] }, "the viewer's choice yields to a zone that sets a cast");
  assert.deepEqual(r.resolve({ zone: null, viewer: "mossy-pegs", town: "pegs" }), { id: "mossy-pegs", unknown: [] }, "a zone without a cast leaves it to the viewer");
  assert.deepEqual(r.resolve({ zone: "ghosts", viewer: "mossy-pegs" }), { id: "mossy-pegs", unknown: ["ghosts"] });
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
  assert.equal(meshes(cast.figure({ key: "a", role: "worker", accent: null })), 4, "peg, tuft, the shadow and the halo");
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

/* ── The person ───────────────────────────────────────────────────────── */

const person: FigureSpec = {
  format: "crewhub-figure/1",
  joints: [{ id: "body", position: [0, 0.2, 0] }],
  parts: [
    { id: "coat", joint: "body", shape: "cylinder", size: [0.15, 0.5, 0.18], position: [0, 0.25, 0], color: "slot:coat" },
    { id: "head", joint: "body", shape: "sphere", size: [0.15, 0.16, 0.15], position: [0, 0.6, 0], color: "wood" },
  ],
  poses: {},
  motions: {},
  colorways: { coat: { others: ["wood"] } },
  anchors: { label: [0, 1, 0], carry: [0, 0.4, 0.2], ground: 0.2, height: 0.9 },
};
/** The figure's meshes: data until it is drawn near (round 23), so a reader of meshes asks for them first. */
const meshes = (handle: { materialise(): void; object: { getObjectsByProperty(name: string, value: string): unknown[] } }) => (handle.materialise(), handle.object.getObjectsByProperty("type", "Mesh").length);

test("a cast without a person draws its plain worker for one; a cast with person.json draws that", () => {
  const { r } = registry();
  r.registerCast(pegs);
  r.registerCast({ manifest: manifest("people-pegs"), figure, person });
  const plain = r.castFor(style, "pegs");
  assert.equal(plain.hasPerson, false);
  assert.equal(r.personOf("pegs"), null);
  assert.equal(meshes(plain.person({ key: "visitor" })), 3, "the peg, the shadow and the halo: the plain worker");
  const people = r.castFor(style, "people-pegs");
  assert.equal(people.hasPerson, true);
  assert.equal(r.personOf("people-pegs"), person);
  assert.equal(meshes(people.person({ key: "visitor" })), 4, "coat, head, the shadow and the halo");
});

test("a person is inherited down the extends chain, re-dressed by a person patch, and refused when it breaks", () => {
  const { r, warnings } = registry();
  r.registerCast({ manifest: manifest("people-pegs"), figure, person });
  // A re-dress without a person of its own wears its base's person; one with a patch re-dresses it.
  r.registerCast({ manifest: manifest("mossy-people", { extends: "people-pegs", colors: { moss: { day: "#49634f", lamplight: "#49634f" } } }), figure: { format: "crewhub-figure-patch/1" } });
  r.registerCast({
    manifest: manifest("hatted-people", { extends: "mossy-people", colors: { moss: { day: "#49634f", lamplight: "#49634f" } } }),
    figure: { format: "crewhub-figure-patch/1" },
    person: { format: "crewhub-figure-patch/1", recolor: { wood: "moss" }, add: [{ id: "hat", joint: "body", shape: "cone", size: [0.2, 0.2, 0], position: [0, 0.8, 0], color: "moss" }] },
  });
  assert.equal(r.personOf("mossy-people"), person);
  const hatted = r.personOf("hatted-people")!;
  assert.deepEqual(hatted.parts.map((p) => p.id), ["coat", "head", "hat"]);
  assert.deepEqual(hatted.colorways.coat!.others, ["moss"]);
  assert.equal(r.castFor(style, "hatted-people").hasPerson, true);
  assert.equal(meshes(r.castFor(style, "hatted-people").person({ key: "visitor" })), 5);
  // A person patch over a base without a person, and a patch that dresses the person in the project colour: refused, the plain worker stands in.
  r.registerCast({ manifest: manifest("pegs"), figure });
  r.registerCast({ manifest: manifest("orphan", { extends: "pegs" }), figure: { format: "crewhub-figure-patch/1" }, person: { format: "crewhub-figure-patch/1", recolor: { wood: "moss" } } });
  assert.equal(r.personOf("orphan"), null);
  assert.equal(r.castFor(style, "orphan").hasPerson, false);
  r.registerCast({ manifest: manifest("vain", { extends: "people-pegs" }), figure: { format: "crewhub-figure-patch/1" }, person: { format: "crewhub-figure-patch/1", colorways: { coat: { lead: "accent", others: ["wood"] } } } });
  assert.equal(r.personOf("vain"), null);
  assert.equal(warnings.filter((w) => /person/.test(w)).length, 2);
  // Person data that is no person is refused at registration, as broken figure data is.
  assert.equal(r.registerCast({ manifest: manifest("proud"), figure, person: { ...person, halo: "accent" } }), false);
  assert.equal(r.registerCast({ manifest: manifest("patchy"), figure, person: { format: "crewhub-figure-patch/1" } }), false, "a person patch needs a cast to extend");
});
