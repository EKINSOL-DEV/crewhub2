/* The table of what the style draws with code, through its interface: every key it lists draws an object, and a key it
   does not list draws none (round 60, pk-P4: the list and the switch were two lists with nothing between them, so a key
   in one alone drew the registry's placeholder silently). Built headless: three.js geometry and materials, no renderer. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import type { ModelOptions } from "@crewhub/world-style";
import { CODE_KEYS, codeModel, type DrawContext } from "../src/codeModels.ts";
import { Kit, type GreenhouseManifestData } from "../src/kit.ts";
import { glass } from "../src/pieces.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as GreenhouseManifestData & { lighting: ConstructorParameters<typeof Kit>[1] };
const SIZE = { size: { width: 6, height: 3, depth: 6 } } as ModelOptions;

function drawing() {
  const kit = new Kit(manifest, manifest.lighting);
  const pieces: string[] = [];
  const context: DrawContext = {
    glass: glass(kit),
    piece: (key) => {
      pieces.push(key);
      return new THREE.Group();
    },
  };
  return { kit, context, pieces };
}

test("every code key draws an object: the list is the table's keys", (t) => {
  // A painted sign letters on a canvas; here a canvas that paints nothing.
  const paint = new Proxy({}, { get: (_, name) => (name === "measureText" ? () => ({ width: 10 }) : () => {}), set: () => true });
  (globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => paint }) };
  t.after(() => delete (globalThis as { document?: unknown }).document);
  assert.ok(CODE_KEYS.length >= 94);
  const { kit, context } = drawing();
  for (const key of CODE_KEYS) {
    const object = codeModel(key, kit, SIZE, context);
    assert.ok(object instanceof THREE.Object3D, key);
  }
});

test("a key the table does not list draws nothing, whatever an object inherits", () => {
  const { kit, context } = drawing();
  for (const key of ["nonsense", "town.nonsense", "constructor", "toString", "__proto__", "hasOwnProperty", "emblem"]) {
    assert.equal(codeModel(key, kit, {}, context), null, key);
  }
});

test("an emblem the style has no figure for (a project's icon comes from loops' data) is its plinth alone, and a known one has its figure", () => {
  const { kit, context } = drawing();
  const plinth = codeModel("emblem.rocket", kit, {}, context) as THREE.Group;
  assert.ok(plinth instanceof THREE.Group);
  assert.equal(plinth.children.length, 1);
  assert.ok((codeModel("emblem.home", kit, {}, context) as THREE.Group).children.length > 1);
});

test("the landmarks draw their parts through the context's piece, the glass walls with its glass", () => {
  const { kit, context, pieces } = drawing();
  codeModel("post-office", kit, {}, context);
  assert.ok(pieces.length > 0);
  const wall = codeModel("wall.glass", kit, SIZE, context) as THREE.Group;
  let glazed = false;
  wall.traverse((o) => {
    if ((o as THREE.Mesh).material === context.glass) glazed = true;
  });
  assert.ok(glazed, "the style's glass, not one of the wall's own");
});
