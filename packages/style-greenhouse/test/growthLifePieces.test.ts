/* growth.ts, life.ts and pieces.ts, which no node test loaded before (round 55, r55-style-load): what their exported
   functions promise in their doc comments, built headless (three.js geometry and materials, no renderer). plotSign,
   and districtGate with a name, letter on a canvas (`shell.ts` `lettering`: `document.createElement`), so only the
   gate without a name is built here. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import type { ModelOptions } from "@crewhub/world-style";
import { districtGate, scaffolding, stakedPlot } from "../src/growth.ts";
import { Kit, type GreenhouseManifestData, type Swatch } from "../src/kit.ts";
import { affordance, bird, butterfly, disposeLife, firefly, lifeTheme, mote, ripple, steam, windowGlow } from "../src/life.ts";
import { floor, focusRing, sticker, zoneMark } from "../src/pieces.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as GreenhouseManifestData & { lighting: ConstructorParameters<typeof Kit>[1] };
const kit = () => new Kit(manifest, manifest.lighting);

/** The meshes of `g` drawn in the swatch `swatch` (the kit's one material per swatch). */
function inSwatch(k: Kit, g: THREE.Object3D, swatch: Swatch): THREE.Mesh[] {
  const material = k.material(swatch);
  const out: THREE.Mesh[] = [];
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === material) out.push(o as THREE.Mesh);
  });
  return out;
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const opts = (o: Partial<ModelOptions>) => o as ModelOptions;

/* ── growth.ts ───────────────────────────────────────────────────────────────────────────────────────────────── */

test("a staked plot: the corner stakes capped in coral, the string all round but the middle of the front edge", () => {
  const k = kit();
  const g = stakedPlot(k, opts({ size: { width: 6, height: 0, depth: 6 } }));
  const caps = inSwatch(k, g, "coral").filter((m) => near(Math.abs(m.position.x), 3) && near(Math.abs(m.position.z), 3));
  assert.equal(caps.length, 4, "a coral cap on each corner");
  const strings = inSwatch(k, g, "cream");
  assert.equal(strings.length, 11, "twelve stakes round the plot, a string between each pair but one");
  const at = (x: number, z: number) => strings.some((m) => near(m.position.x, x) && near(m.position.z, z));
  assert.ok(at(0, -3), "the back edge is strung across its middle");
  assert.ok(!at(0, 3), "the front edge is open in the middle, where the path will come");
  assert.ok(at(2, 3) && at(-2, 3), "the rest of the front is strung");
});

test("a narrow plot keeps its front closed: there is no middle to leave open", () => {
  const k = kit();
  const strings = inSwatch(k, stakedPlot(k, opts({ size: { width: 4, height: 0, depth: 4 } })), "cream");
  assert.equal(strings.length, 8, "eight stakes, eight strings");
  const front = strings.filter((m) => near(m.position.z, 2)).map((m) => m.position.x).sort((a, b) => a - b);
  assert.deepEqual(front, [-1, 1], "both front strings, the middle stake's included");
});

test("a staked plot ties a ribbon on here and there, the same ones for the same seed", () => {
  const k = kit();
  const ribbons = (seed: number) => {
    const g = stakedPlot(k, opts({ size: { width: 6, height: 0, depth: 6 }, seed }));
    return [...inSwatch(k, g, "tangerine"), ...inSwatch(k, g, "coral").filter((m) => !(near(Math.abs(m.position.x), 3) && near(Math.abs(m.position.z), 3)))].map((m) => m.position.toArray().map((v) => v.toFixed(3)).join(","));
  };
  assert.equal(ribbons(0).length, 3);
  assert.deepEqual(ribbons(0), ribbons(0));
  assert.notDeepEqual(ribbons(0), ribbons(1));
});

test("scaffolding: ledgers at every lift on all four sides, poles just outside the footprint and taller than the top lift, a five-rung ladder and a sage tarp on the front", () => {
  const k = kit();
  const width = 6,
    height = 3,
    depth = 5;
  const g = scaffolding(k, opts({ size: { width, height, depth } }));
  const lifts = Math.round(height / 1.15);
  const timber = inSwatch(k, g, "timber");
  const ledgers = timber.filter((m) => m.scale.z > 1);
  assert.equal(ledgers.length, lifts * 4, "four ledgers per lift");
  assert.deepEqual([...new Set(ledgers.map((m) => m.position.y.toFixed(3)))].sort(), Array.from({ length: lifts }, (_, i) => ((i + 1) * (height / lifts)).toFixed(3)).sort());
  const rungs = timber.filter((m) => m.scale.z < 0.5 && m.geometry.type === "BoxGeometry" && m.scale.x < 0.1);
  assert.equal(rungs.length, 5, "a ladder of five rungs");
  const poles = g.children.filter((o) => (o as THREE.Mesh).geometry?.type === "CylinderGeometry" && (o as THREE.Mesh).material === k.material("timber")) as THREE.Mesh[];
  assert.ok(poles.length > 0);
  for (const p of poles) {
    assert.ok(near(Math.abs(p.position.x), width / 2) || near(Math.abs(p.position.z), depth / 2), "a pole stands on the footprint's edge");
    assert.ok(p.position.y * 2 > height, "taller than the top lift");
  }
  const tarp = inSwatch(k, g, "sage");
  assert.equal(tarp.length, 1);
  assert.ok(tarp[0]!.position.z > depth / 2, "the tarp hangs on the front");
});

test("a district gate without a name: two piers either side of the opening, a lantern each, ivy, a sprig on both faces of the board in the district's colour", () => {
  const k = kit();
  const width = 4.2;
  const g = districtGate(k, opts({ accent: "coral" }));
  const piers = inSwatch(k, g, "ledge");
  assert.equal(piers.length, 2);
  for (const p of piers) assert.ok(Math.abs(p.position.x) > width / 2, "the piers stand outside the opening");
  assert.ok(piers[0]!.position.x * piers[1]!.position.x < 0, "one either side");
  const lanterns: THREE.Mesh[] = [];
  const lit = k.material("lantern-glass", { glow: "lantern-light" });
  g.traverse((o) => {
    if ((o as THREE.Mesh).material === lit) lanterns.push(o as THREE.Mesh);
  });
  assert.equal(lanterns.length, 2, "a lantern either side");
  assert.equal(inSwatch(k, g, "leaf").length + inSwatch(k, g, "leaf-dark").length, 12, "six ivy leaves on each pier");
  assert.equal(inSwatch(k, g, "coral").length, 1, "the name board in the district's colour");
  const sprig = inSwatch(k, g, "cream").filter((m) => m.geometry.type === "SphereGeometry");
  assert.equal(sprig.length, 6, "three leaves on each face");
  assert.deepEqual([...new Set(sprig.map((m) => Math.sign(m.position.z)))].sort(), [-1, 1]);
});

/* ── life.ts ─────────────────────────────────────────────────────────────────────────────────────────────────── */

test("a life material is made once per kit and shared by every creature of its kind", () => {
  const k = kit();
  for (const make of [bird, butterfly, firefly, mote, windowGlow, ripple, steam]) assert.equal(make(k).material, make(k).material, make.name);
  const other = kit();
  assert.notEqual(butterfly(other).material, butterfly(k).material, "another kit has its own");
  const before = butterfly(k).material as THREE.Material;
  disposeLife(k);
  assert.notEqual(butterfly(k).material, before, "freed: the next creature gets a fresh material");
});

test("an affordance: the size lives in the geometry, so one material serves every size; the shapes differ in softness and strength", () => {
  const k = kit();
  const small = affordance(k, "outline", 2, 1),
    large = affordance(k, "outline", 6, 4);
  assert.equal(small.material, large.material);
  assert.notEqual(small.geometry, large.geometry);
  const shape = (m: THREE.Mesh) => Array.from((m.geometry.attributes.aShape as THREE.BufferAttribute).array.slice(0, 3));
  const plane = (m: THREE.Mesh) => (m.geometry as THREE.PlaneGeometry).parameters;
  const softness = { outline: 0.9, fill: 0.5, ring: 0.14 } as const;
  const strength = { outline: 0.8, fill: 0.2, ring: 0.9 } as const;
  for (const kind of ["outline", "fill", "ring"] as const) {
    const m = affordance(k, kind, 3, 2);
    const [hx, hz, soft] = shape(m);
    assert.deepEqual([hx, hz], [1.5, 1]);
    assert.ok(Math.abs(soft! - softness[kind]) < 1e-6, kind);
    assert.ok(Math.abs((m.material as THREE.ShaderMaterial).uniforms.uOpacity!.value - strength[kind]) < 1e-6, kind);
    const pad = kind === "fill" ? 0 : softness[kind] * 1.5;
    assert.ok(Math.abs(plane(m).width - (3 + 2 * pad)) < 1e-6 && Math.abs(plane(m).height - (2 + 2 * pad)) < 1e-6, `${kind}: the glow has room round the shape, the wash none`);
    assert.equal(m.renderOrder, 2);
  }
});

test("the affordances' colours: the wash the focus colour, the outline and the ring a warm accent by day and lantern light in lamplight", () => {
  const k = kit();
  const colour = (shape: "outline" | "fill" | "ring") => `#${((affordance(k, shape, 1, 1).material as THREE.ShaderMaterial).uniforms.uColor!.value as THREE.Color).getHexString()}`;
  assert.deepEqual([colour("fill"), colour("outline"), colour("ring")], [k.hex("focus-ring"), k.hex("tangerine"), k.hex("tangerine")]);
  k.setTheme("lamplight");
  lifeTheme(k);
  assert.deepEqual([colour("fill"), colour("outline"), colour("ring")], [k.hex("focus-ring"), k.hex("lantern-light"), k.hex("lantern-light")]);
});

/* ── pieces.ts ───────────────────────────────────────────────────────────────────────────────────────────────── */

test("a room floor: UVs in 0.6 m cells; each variant its tone, \"dim\" the empty room's, none or an unknown one the studio's cream", () => {
  const k = kit();
  const f = floor(k, opts({ size: { width: 3, height: 0, depth: 1.8 } }));
  const uv = f.geometry.attributes.uv!;
  const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i)),
    vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
  assert.deepEqual([Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)].map((v) => +v.toFixed(6)), [0, 5, 0, 3], "3 m by 1.8 m is 5 by 3 cells");
  const tone = (variant?: string) => floor(k, opts(variant === undefined ? {} : { variant })).material;
  for (const [variant, swatch] of [["wood", "floor-wood"], ["oak", "floor-oak"], ["tile", "floor-tile"], ["sage", "floor-sage"], ["concrete", "floor-concrete"], ["mist", "floor-mist"], ["dim", "floor-dim"]] as const)
    assert.equal(tone(variant), k.material(swatch), variant);
  assert.equal(tone(), k.material("floor"));
  assert.equal(tone("marble"), k.material("floor"), "an unknown variant is the plain floor");
});

test("a zone's mark carries its emblem only when the variant names one", () => {
  const k = kit();
  const groups = (g: THREE.Group) => g.children.filter((c) => !(c as THREE.Mesh).isMesh).length;
  assert.equal(groups(zoneMark(k, opts({ accent: "coral", variant: "star" }))), 1, "an emblem in relief");
  assert.equal(groups(zoneMark(k, opts({ accent: "coral", variant: "no-such-icon" }))), 0);
  assert.equal(groups(zoneMark(k, opts({ accent: "coral" }))), 0);
  assert.equal(inSwatch(k, zoneMark(k, opts({ accent: "coral" })), "coral").length, 1, "the medallion in the zone's colour");
  assert.equal(inSwatch(k, zoneMark(k, opts({})), "sage").length, 1, "sage without a colour");
});

test("a sticker: a brass star for \"star\", else a small square", () => {
  const k = kit();
  const star = sticker(k, opts({ variant: "star" })) as THREE.Mesh;
  assert.equal(star.geometry.type, "ExtrudeGeometry");
  const square = sticker(k, opts({ variant: "dot", accent: "coral" })) as THREE.Mesh;
  assert.equal(square.geometry.type, "BoxGeometry");
});

test("the focus ring frames the room floor: four sides on its edges", () => {
  const k = kit();
  const g = focusRing(k, opts({ size: { width: 4, height: 0, depth: 3 } }));
  const sides = g.children as THREE.Mesh[];
  assert.equal(sides.length, 4);
  assert.deepEqual(sides.map((m) => [m.position.x, m.position.z]).sort(), [[-2, 0], [0, -1.5], [0, 1.5], [2, 0]].sort());
});
