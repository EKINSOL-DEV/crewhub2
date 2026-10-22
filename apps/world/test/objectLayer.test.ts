/* Round 24: the objects layer's templates and instanced meshes made ahead of the enter (world/objectLayer.ts
   `prepare`): it bakes what the frame will draw and nothing else, at the capacity the frame needs, hidden and empty,
   so the enter's first frame neither bakes nor grows them; a second call makes nothing. */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { ResolvedStyle } from "@crewhub/world-style";
import { ObjectLayer, type ObjectLayerContext } from "../src/world/objectLayer.ts";
import type { ObjectLayout, Placement } from "../src/world/interiorLayout.ts";
import { building, object } from "./fixtures.ts";

/** A style whose every model is one box of the asked size (a template is one part, one material). */
const style = {
  model: (key: string, options?: { size?: { width: number; height: number; depth: number } }) => {
    const size = options?.size ?? { width: 0.3, height: 0.2, depth: 0.2 };
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(size.width, size.height, size.depth), new THREE.MeshStandardMaterial());
    m.position.y = size.height / 2;
    m.name = key;
    g.add(m);
    return g;
  },
  color: () => new THREE.Color(),
} as unknown as ResolvedStyle;
const ctx: ObjectLayerContext = { style, now: () => 0, reducedMotion: () => false, truck: new THREE.Vector3(), surface: () => 0.5, shelfPitch: () => 0.3, theme: () => "day" };
const objects = [
  object("t1", "planning", { blocked: true, priorityTag: "urgent", labels: ["ops", "web"] }),
  object("t2", "planning", { sealed: true }),
  object("t3", "planning"),
  object("t4", "review", { nameTag: "Ann", labels: ["prop"] }),
];
const town = building("crewhub", [], objects);
const layout = (): ObjectLayout => {
  const placements = new Map<string, Placement>();
  objects.forEach((o, i) => placements.set(o.ticketId, { room: o.room, x: 1 + i, z: 1, surface: "desk", level: 0, slot: `s${i}` }));
  return { placements, targets: new Map(), pallets: [] };
};
const run = (gen: Generator<void, boolean>) => {
  let steps = 0;
  let r = gen.next();
  while (!r.done) {
    steps++;
    r = gen.next();
  }
  return { made: r.value, steps };
};
const meshes = (layer: ObjectLayer) => layer.group.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh);
const drawn = (layer: ObjectLayer) => meshes(layer).map((m) => m.count).sort((a, b) => a - b);

test("prepare bakes the templates the objects draw with, makes their meshes hidden and empty, and yields per bake", () => {
  const layer = new ObjectLayer("crewhub", ctx);
  const { made, steps } = run(layer.prepare(town));
  assert.equal(made, true);
  // t1: body, strap, tag, two stickers; t2: seal; t4: name tag, the star sticker: eight templates, each one mesh.
  assert.deepEqual(layer.baked, { templates: 8, meshes: 8 });
  assert.ok(steps >= 3, `yields after the objects that baked something (${steps})`);
  for (const m of meshes(layer)) {
    assert.equal(m.count, 0, "nothing drawn ahead of the enter");
    assert.ok(m.instanceMatrix.count >= 1, "capacity for the instances the frame will write");
  }
  assert.equal(run(layer.prepare(town)).made, false, "everything stands: a second call makes nothing");
  assert.deepEqual(layer.baked, { templates: 8, meshes: 8 });
});

test("the frame after a prepare writes into the meshes made ahead (no bake, no regrow) and draws what a cold frame draws", () => {
  const ahead = new ObjectLayer("crewhub", ctx);
  run(ahead.prepare(town));
  const before = meshes(ahead);
  ahead.sync(town, layout());
  ahead.update(0.016);
  assert.deepEqual(meshes(ahead), before, "the same meshes: nothing replaced by a bake or a regrow at the enter");
  assert.deepEqual(ahead.baked, { templates: 8, meshes: 8 });
  const cold = new ObjectLayer("crewhub", ctx);
  cold.sync(town, layout());
  cold.update(0.016);
  assert.deepEqual(cold.baked, ahead.baked, "the prepare baked exactly the templates the frame bakes");
  assert.deepEqual(drawn(ahead), drawn(cold), "and the frame writes the same instances into them");
  assert.deepEqual(drawn(cold), [1, 1, 1, 1, 1, 1, 1, 4], "one of each decoration (the two labels' stickers differ by accent, the star is a third), four bodies");
});
