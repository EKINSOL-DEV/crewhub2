/* Round 34: the prop document under fuzz. A prop comes from outside twice over: a file (`npm run prop:validate`), and
   the json block of a loops comment on a done prop ticket, written by an agent. `validatePropModel` is the one gate.
   Seeded, a few thousand inputs: broken copies of a whole prop, random parts of every shape, boundary values on every
   limit with odd numbers and strings, prototype keys. What a caller sees: never a throw, an accepted model within
   every limit (its parts finite and in bounds, so `partBounds` and `toPropDefinition` can take it), errors with a path
   and a message, and `Object.prototype` as it was. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PROP_CATEGORIES, PROP_FORMAT, PROP_ID_PATTERN, PROP_LIMITS, PROP_MATERIALS, PROP_SHAPES, TAG_PATTERN, partBounds, toPropDefinition, validatePropModel, type PropModel } from "../src/props.ts";
import { Fuzz, ODD_NUMBERS, ODD_STRINGS, PROTO_KEYS, protoSnapshot, replay } from "./fuzz.ts";

const SEEDS = [34_011, 34_012, 34_013];
const L = PROP_LIMITS;
const BASE = {
  format: PROP_FORMAT,
  id: "user:fuzz-lamp",
  name: "Fuzz lamp",
  description: "A lamp for the fuzz.",
  category: "light",
  tags: ["lamp", "fuzz"],
  footprint: { width: 2, depth: 1 },
  blocksMovement: true,
  approaches: [{ x: 0, z: -1 }, { x: 2, z: 0 }],
  parts: [
    { shape: "box", size: [0.5, 0.4, 0.3], position: [-0.2, 0.2, 0], material: "timber", radius: 0.02 },
    { shape: "cylinder", size: [0.1, 0.6, 0.12], position: [0.3, 0.3, 0], material: "chalk" },
    { shape: "sphere", size: [0.15, 0.15, 0.15], position: [0.3, 0.75, 0], material: "cream", emissive: true },
    { shape: "cone", size: [0.1, 0.2, 0], position: [-0.2, 0.5, 0], rotation: [0, 45, 0], material: "timber-light" },
    { shape: "torus", size: [0.1, 0.03, 0], position: [0.3, 0.95, 0], rotation: [90, 0, 0], material: "chalk" },
    { shape: "wedge", size: [0.15, 0.1, 0.15], position: [-0.2, 0.05, 0.1], material: "cream", sweep: 120 },
  ],
  provenance: { kind: "ticket", ticketKey: "CR-41" },
};

function protoKeysIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(protoKeysIn);
  if (value === null || typeof value !== "object") return [];
  return Object.keys(value as object).flatMap((key) => [...(PROTO_KEYS.includes(key as (typeof PROTO_KEYS)[number]) ? [key] : []), ...protoKeysIn((value as Record<string, unknown>)[key])]);
}

/** What an accepted model must keep, so the engine and the renderer can take it as it is. */
function assertWithinLimits(model: PropModel, where: string): void {
  assert.equal(model.format, PROP_FORMAT, where);
  assert.ok(PROP_ID_PATTERN.test(model.id) && model.id.slice(model.id.indexOf(":") + 1).length <= L.slugMax, `${where}: id ${model.id}`);
  assert.ok(model.name.trim().length >= 1 && model.name.length <= L.nameMax, where);
  assert.ok(model.description.length <= L.descriptionMax, where);
  assert.ok(PROP_CATEGORIES.includes(model.category), where);
  assert.ok(model.tags.length <= L.tagsMax && model.tags.every((t) => TAG_PATTERN.test(t) && t.length <= L.tagMax), where);
  assert.equal(new Set(model.tags).size, model.tags.length, `${where}: duplicate tag`);
  for (const n of [model.footprint.width, model.footprint.depth]) assert.ok(Number.isInteger(n) && n >= L.footprintMin && n <= L.footprintMax, `${where}: footprint ${n}`);
  assert.equal(typeof model.blocksMovement, "boolean", where);
  assert.ok(model.approaches.length <= L.approachesMax, where);
  for (const c of model.approaches) assert.ok(Number.isInteger(c.x) && Number.isInteger(c.z) && c.x >= -1 && c.z >= -1 && c.x <= model.footprint.width && c.z <= model.footprint.depth, `${where}: approach ${c.x},${c.z}`);
  assert.ok(model.parts.length >= L.partsMin && model.parts.length <= L.partsMax, `${where}: ${model.parts.length} parts`);
  for (const part of model.parts) {
    assert.ok(PROP_SHAPES.includes(part.shape) && PROP_MATERIALS.includes(part.material), where);
    for (const v of [part.size, part.position, part.rotation ?? [0, 0, 0]]) {
      assert.equal(v.length, 3, where);
      for (const n of v) assert.ok(Number.isFinite(n), `${where}: ${n}`);
    }
    for (const n of part.size) assert.ok(n >= 0 && n <= L.sizeMax, `${where}: size ${n}`);
    for (const n of part.position) assert.ok(Math.abs(n) <= L.positionMax, `${where}: position ${n}`);
    for (const n of part.rotation ?? []) assert.ok(Math.abs(n) <= L.rotationMax, `${where}: rotation ${n}`);
    if (part.radius !== undefined) assert.ok(part.shape === "box" && part.radius >= 0 && part.radius <= L.cornerRadiusMax, where);
    if (part.sweep !== undefined) assert.ok(part.shape === "wedge" && part.sweep >= L.sweepMin && part.sweep <= L.sweepMax, where);
    const bounds = partBounds(part);
    for (const n of [...bounds.min, ...bounds.max]) assert.ok(Number.isFinite(n), `${where}: bounds`);
    assert.ok(bounds.max[1] <= L.heightMax + 1e-6 && bounds.min[1] >= -1e-6, `${where}: a part above the ceiling or below the floor`);
  }
  if (model.provenance) assert.ok(model.provenance.kind === "local" || (model.provenance.kind === "ticket" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(model.provenance.ticketKey)), where);
  assert.deepEqual(protoKeysIn(model), [], `${where}: a prototype key got through`);
  const definition = toPropDefinition(model);
  assert.deepEqual(definition.footprint, model.footprint, where);
}

test("round 34 fuzz: broken copies of a whole prop never throw; what passes is within every limit, finite, and takes no prototype key", () => {
  const before = protoSnapshot();
  const base = validatePropModel(BASE);
  assert.ok(base.ok && base.warnings.length === 0, "the base prop is valid and warning-free");
  let accepted = 0,
    refused = 0;
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 1000; i += 1) {
      const input = f.mutate(BASE, f.int(1, 4));
      let result;
      try {
        result = validatePropModel(input);
      } catch (error) {
        assert.fail(`${replay(seed, i, input)} threw ${String(error)}`);
      }
      if (result.ok) {
        accepted += 1;
        assertWithinLimits(result.value, replay(seed, i));
        assert.ok(validatePropModel(result.value).ok, `${replay(seed, i)}: the accepted value validates again`);
        assert.notEqual(result.value, input, `${replay(seed, i)}: a copy`);
      } else {
        refused += 1;
        assert.ok(result.errors.length > 0, replay(seed, i));
        for (const issue of result.errors) assert.ok(typeof issue.path === "string" && issue.path !== "" && typeof issue.message === "string" && issue.message !== "", replay(seed, i, issue));
      }
    }
  }
  assert.ok(accepted > 20 && refused > 2000, `the mix: ${accepted} accepted, ${refused} refused`);
  assert.equal(protoSnapshot(), before);
});

test("round 34 fuzz: random parts of every shape, with odd sizes, positions and rotations, are judged without a throw and only finite parts in bounds pass", () => {
  const before = protoSnapshot();
  let accepted = 0;
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 600; i += 1) {
      const n = (lo: number, hi: number) => (f.bool(0.08) ? f.pick(ODD_NUMBERS) : Math.round((lo + f.float() * (hi - lo)) * 100) / 100);
      const vec = (lo: number, hi: number) => (f.bool(0.03) ? f.value(1) : [n(lo, hi), n(lo, hi), n(lo, hi)]);
      const shape = f.bool(0.05) ? f.string() : f.pick(PROP_SHAPES);
      const part: Record<string, unknown> = { shape, size: vec(0, 1), position: vec(-1, 1), material: f.bool(0.05) ? f.string() : f.pick(PROP_MATERIALS) };
      if (f.bool(0.5)) part.rotation = vec(-400, 400);
      if (f.bool(0.2)) part.radius = n(-0.1, 0.6);
      if (f.bool(0.2)) part.sweep = n(-10, 400);
      if (f.bool(0.1)) part.emissive = f.value(0);
      const parts = Array.from({ length: f.pick([1, 1, 2, 3, 64, 65]) }, () => part);
      const footprint = f.bool(0.1) ? { width: n(-1, 8), depth: n(-1, 8) } : { width: f.int(1, 6), depth: f.int(1, 6) };
      const input = { ...BASE, footprint, approaches: [], blocksMovement: false, parts };
      let result;
      try {
        result = validatePropModel(input);
      } catch (error) {
        assert.fail(`${replay(seed, i, input)} threw ${String(error)}`);
      }
      if (result.ok) {
        accepted += 1;
        assertWithinLimits(result.value, replay(seed, i));
      }
    }
  }
  assert.ok(accepted > 0, `some random parts pass: ${accepted}`);
  assert.equal(protoSnapshot(), before);
});

test("round 34 fuzz: each limit at its edge and one past it, with every odd number and string on the fields they bound", () => {
  const prop = (patch: Record<string, unknown>) => validatePropModel({ ...BASE, ...patch });
  const box = (size: number[], position: number[]) => ({ shape: "box", size, position, material: "timber" });
  const wide = { footprint: { width: 6, depth: 6 }, approaches: [], blocksMovement: false };
  // Counts.
  assert.ok(prop({ ...wide, parts: Array.from({ length: L.partsMax }, () => box([0.1, 0.1, 0.1], [0, 0.05, 0])) }).ok);
  assert.ok(!prop({ ...wide, parts: Array.from({ length: L.partsMax + 1 }, () => box([0.1, 0.1, 0.1], [0, 0.05, 0])) }).ok);
  assert.ok(!prop({ parts: [] }).ok);
  assert.ok(prop({ tags: Array.from({ length: L.tagsMax }, (_, i) => `t${i}`) }).ok);
  assert.ok(!prop({ tags: Array.from({ length: L.tagsMax + 1 }, (_, i) => `t${i}`) }).ok);
  // Around the 2x1 blocking footprint: the eight cells of the rows z -1 and z 1; a ninth (x -1, z 0) is one too many.
  const around = (n: number) => Array.from({ length: n }, (_, i) => (i < 8 ? { x: (i % 4) - 1, z: i < 4 ? -1 : 1 } : { x: -1, z: 0 }));
  assert.ok(prop({ approaches: around(L.approachesMax) }).ok);
  assert.ok(!prop({ approaches: around(L.approachesMax + 1) }).ok);
  // Lengths.
  assert.ok(prop({ name: "n".repeat(L.nameMax) }).ok && !prop({ name: "n".repeat(L.nameMax + 1) }).ok);
  assert.ok(prop({ description: "d".repeat(L.descriptionMax) }).ok && !prop({ description: "d".repeat(L.descriptionMax + 1) }).ok);
  assert.ok(prop({ tags: ["t".repeat(L.tagMax)] }).ok && !prop({ tags: ["t".repeat(L.tagMax + 1)] }).ok);
  assert.ok(prop({ id: `user:${"s".repeat(L.slugMax)}` }).ok && !prop({ id: `user:${"s".repeat(L.slugMax + 1)}` }).ok);
  // Numbers on the fields they bound: only the finite ones inside pass; NaN, Infinity and strings never do.
  for (const n of ODD_NUMBERS) {
    const finite = Number.isFinite(n);
    assert.equal(prop({ footprint: { width: n, depth: 1 }, approaches: [], parts: [box([0.2, 0.2, 0.2], [0, 0.1, 0])] }).ok, Number.isInteger(n) && n >= L.footprintMin && n <= L.footprintMax, `footprint ${n}`);
    assert.equal(prop({ ...wide, parts: [box([n, 0.2, 0.2], [0, 0.1, 0])] }).ok, finite && n >= L.sizeMin && n <= L.sizeMax && n <= 3.8, `size ${n}`);
    assert.equal(prop({ ...wide, parts: [box([0.2, 0.2, 0.2], [n, 0.1, 0])] }).ok, finite && Math.abs(n) <= 1.8 + 1e-6, `position ${n}`);
    assert.equal(prop({ ...wide, parts: [{ ...box([0.2, 0.2, 0.2], [0, 0.1, 0]), rotation: [0, n, 0] }] }).ok, finite && Math.abs(n) <= L.rotationMax, `rotation ${n}`);
    assert.equal(prop({ ...wide, parts: [{ ...box([0.2, 0.2, 0.2], [0, 0.1, 0]), radius: n }] }).ok, finite && n >= 0 && n <= L.cornerRadiusMax, `radius ${n}`);
    assert.equal(prop({ ...wide, parts: [{ shape: "wedge", size: [1, 1, 1], position: [0, 0.5, 0], material: "timber", sweep: n }] }).ok, finite && n >= L.sweepMin && n <= L.sweepMax, `sweep ${n}`);
    assert.equal(prop({ approaches: [{ x: n, z: -1 }] }).ok, Number.isInteger(n) && n >= -1 && n <= 2, `approach ${n}`);
  }
  for (const s of ODD_STRINGS) {
    assert.equal(prop({ name: s }).ok, s.trim().length >= 1 && s.length <= L.nameMax, `name ${JSON.stringify(s.slice(0, 20))}`);
    assert.equal(prop({ tags: [s] }).ok, TAG_PATTERN.test(s) && s.length <= L.tagMax, `tag ${JSON.stringify(s.slice(0, 20))}`);
    assert.equal(prop({ id: s }).ok, PROP_ID_PATTERN.test(s), `id ${JSON.stringify(s.slice(0, 20))}`);
    assert.equal(prop({ provenance: { kind: "ticket", ticketKey: s } }).ok, /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(s), `ticket key ${JSON.stringify(s.slice(0, 20))}`);
    assert.equal(prop({ category: s }).ok, false);
    assert.equal(prop({ parts: [{ ...BASE.parts[0], material: s }] }).ok, false);
    assert.equal(prop({ parts: [{ ...BASE.parts[0], shape: s }] }).ok, false);
  }
  // Prototype keys as own keys are unknown keys at every level.
  const before = protoSnapshot();
  for (const key of PROTO_KEYS) {
    assert.ok(!validatePropModel(JSON.parse(`{"${key}":{"polluted":1},${JSON.stringify(BASE).slice(1)}`)).ok, key);
    assert.ok(!prop({ footprint: JSON.parse(`{"${key}":1,"width":1,"depth":1}`) }).ok, `footprint.${key}`);
    assert.ok(!prop({ parts: [JSON.parse(`{"${key}":1,${JSON.stringify(BASE.parts[0]).slice(1)}`)] }).ok, `parts[0].${key}`);
    assert.ok(!prop({ provenance: JSON.parse(`{"${key}":1,"kind":"local"}`) }).ok, `provenance.${key}`);
  }
  assert.equal(protoSnapshot(), before);
  for (const v of [null, undefined, 1, "x", [], [BASE], true]) assert.ok(!validatePropModel(v).ok, String(v));
});
