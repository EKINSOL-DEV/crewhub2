/* The soft wall tint (round 15, Nicky's decision 5, variant B): the outer walls' chalk washed a third of the way to the
   project colour, with a floor of difference for a colour that sits close to chalk (mist by day); an archived building
   keeps its muted chalk and a building without a colour keeps plain chalk. The values are pinned per colour and theme:
   a change of the wash is a deliberate one. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { Kit, WALL_WASH, WALL_WASH_FLOOR, deltaE, washHex, type GreenhouseManifestData } from "../src/kit.ts";
import { glassWall, rim, tallWall } from "../src/shell.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as GreenhouseManifestData & { lighting: ConstructorParameters<typeof Kit>[1] };
const kit = () => new Kit(manifest, manifest.lighting);

/** The washed wall per project colour and theme, as built (hex, lower case). */
const PINNED = {
  day: { coral: "#f0c6b8", tangerine: "#efcdb3", circle: "#e2c3b5", mist: "#dcdbd7", ink: "#c3bfaf" },
  lamplight: { coral: "#f9c5aa", tangerine: "#f9cca6", circle: "#ecc3a7", mist: "#ebdfcb", ink: "#cfbea1" },
} as const;

test("the wash is chalk a third of the way to the project colour, per theme, pinned", () => {
  const k = kit();
  for (const theme of ["day", "lamplight"] as const)
    for (const [colour, expected] of Object.entries(PINNED[theme])) {
      assert.equal(k.hex(`wash:${colour}`, theme), expected, `${theme} ${colour}`);
      const chalk = k.hex("chalk", theme);
      assert.ok(deltaE(new THREE.Color(chalk), new THREE.Color(expected)) >= WALL_WASH_FLOOR, `${theme} ${colour}: at least the floor from chalk`);
      // The far colours are exactly a third of the way; only mist, close to chalk, goes further.
      if (colour !== "mist") assert.equal(washHex(chalk, k.hex(colour, theme), WALL_WASH, 0), expected, `${theme} ${colour}: a plain third`);
    }
});

test("mist sits too close to chalk for a third: the floor washes it further, and only it", () => {
  const k = kit();
  for (const theme of ["day", "lamplight"] as const) {
    const chalk = k.hex("chalk", theme), mist = k.hex("mist", theme);
    const third = washHex(chalk, mist, WALL_WASH, 0);
    assert.ok(deltaE(new THREE.Color(chalk), new THREE.Color(third)) < WALL_WASH_FLOOR, `${theme}: a plain third is under the floor`);
    assert.notEqual(k.hex("wash:mist", theme), third, theme);
    assert.ok(deltaE(new THREE.Color(chalk), new THREE.Color(k.hex("wash:mist", theme))) >= WALL_WASH_FLOOR, theme);
  }
  // By day mist goes about four fifths of the way, in the warmer lamplight under a half.
  assert.equal(k.hex("wash:mist", "day"), washHex(k.hex("chalk", "day"), k.hex("mist", "day"), 0.7833, 0));
  assert.equal(k.hex("wash:mist", "lamplight"), washHex(k.hex("chalk", "lamplight"), k.hex("mist", "lamplight"), 0.4333, 0));
  // The floor never pushes past the colour itself.
  assert.equal(washHex("#e8e4d1", "#e8e4d1"), "#e8e4d1");
});

/** The colours of a model's meshes (hex, lower case), each once. */
function colours(g: THREE.Object3D): Set<string> {
  const set = new Set<string>();
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m?.color) set.add(`#${m.color.getHexString()}`);
  });
  return set;
}

test("the outer walls carry the wash, an archived wall its muted chalk, a wall without a colour plain chalk", () => {
  const k = kit();
  const glass = new THREE.MeshStandardMaterial();
  const chalk = k.hex("chalk"), dim = k.hex("chalk-dim"), wash = k.hex("wash:coral");
  for (const [name, build] of [
    ["wall", (o: object) => tallWall(k, o, glass)],
    ["wall.glass", (o: object) => glassWall(k, o, glass)],
    ["wall.low", (o: object) => rim(k, o)],
  ] as const) {
    const tinted = colours(build({ accent: "coral" }));
    assert.ok(tinted.has(wash) && !tinted.has(chalk) && !tinted.has(dim), `${name} with a colour: washed, no plain chalk`);
    const closed = colours(build({ accent: "coral", variant: "archived" }));
    assert.ok(closed.has(dim) && !closed.has(wash) && !closed.has(chalk), `${name} archived: muted chalk, no wash`);
    const plain = colours(build({}));
    assert.ok(plain.has(chalk) && !plain.has(wash), `${name} without a colour: plain chalk`);
  }
});

test("a washed wall is a material of its own and follows the theme", () => {
  const k = kit();
  const washed = k.material("wash:circle");
  assert.notEqual(washed, k.material("chalk"));
  assert.equal(`#${washed.color.getHexString()}`, PINNED.day.circle);
  k.setTheme("lamplight");
  assert.equal(`#${washed.color.getHexString()}`, PINNED.lamplight.circle);
  k.setTheme("day");
  assert.equal(`#${washed.color.getHexString()}`, PINNED.day.circle);
});
