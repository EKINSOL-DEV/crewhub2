/* Round 23: the far crowd (robotCrowd.ts) draws a figure whose parts are data on its joints exactly as it drew the
   same figure made of meshes: the same batches, instance for instance (matrix and colour), resting or not; and it
   makes no mesh of a far figure on the way. The old runtime (the round-23 base, verbatim) builds the mesh figure. */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createCast, referenceKit } from "@crewhub/world-cast";
import { createCast as createCastBefore } from "../../../packages/world-cast/test/fixtures/runtimeBase.ts";
import { castRegistry } from "../src/world/cast.ts";
import { RobotCrowd } from "../src/world/robotCrowd.ts";

// The classic bots through the registry (the only module that imports a cast): their data for both runtimes.
const manifest = castRegistry.listCasts().find((m) => m.id === "classic-bots")!;
const spec = castRegistry.figureOf("classic-bots")!;
const kit = referenceKit(manifest.colors);

/** The batches as drawn: per geometry and look (the reference kit's shadow decals have a material per figure: those batches join by geometry) the instances, matrices and colours in order. */
function drawn(crowd: RobotCrowd) {
  const out: Record<string, { count: number; matrices: number[]; colors: number[] | null; geometry: THREE.BufferGeometry }> = {};
  for (const child of crowd.group.children) {
    const mesh = child as THREE.InstancedMesh;
    if (!mesh.visible) continue;
    const standard = mesh.material as THREE.MeshStandardMaterial;
    const key = `${mesh.geometry.uuid}|${standard.isMeshStandardMaterial ? standard.emissive.getHexString() : "decal"}`;
    const entry = (out[key] ??= { count: 0, matrices: [], colors: mesh.instanceColor ? [] : null, geometry: mesh.geometry });
    entry.count += mesh.count;
    entry.matrices.push(...mesh.instanceMatrix.array.subarray(0, mesh.count * 16));
    if (mesh.instanceColor) entry.colors!.push(...mesh.instanceColor.array.subarray(0, mesh.count * 3));
  }
  return out;
}
const objects = (root: THREE.Object3D) => {
  let n = 0;
  root.traverse(() => n++);
  return n;
};

function scene(make: typeof createCast) {
  const cast = make(manifest, spec, kit);
  const root = new THREE.Group();
  const handles = ["lead", "worker", "worker", "analyst", "design"].map((role, i) => {
    const h = cast.figure({ key: `crowd:${i}`, role: role as "lead", accent: i % 2 ? "coral" : null });
    h.object.position.set(i * 1.3, 0.02, -i * 0.7);
    h.object.rotation.y = i * 0.4;
    h.object.scale.setScalar(0.62);
    h.setDetail("far");
    h.setState({ activity: i === 1 ? "working" : i === 3 ? "stale" : "idle", waiting: i === 2, alert: i === 4, proxy: false, carrying: false });
    h.update(0.25 * (i + 1));
    root.add(h.object);
    return h;
  });
  root.updateMatrixWorld(true);
  return { root, handles };
}

test("a crowd of figures as data draws the same batches, instance for instance, as the same figures made of meshes, and makes no mesh", () => {
  const before = scene(createCastBefore), after = scene(createCast);
  const objectsBefore = objects(after.root);
  const a = new RobotCrowd(), b = new RobotCrowd();
  for (const [crowd, s] of [[a, before], [b, after]] as const) {
    crowd.begin();
    for (const h of s.handles) crowd.add(h.object, true);
    crowd.end();
  }
  const x = drawn(a), y = drawn(b);
  assert.deepEqual(Object.keys(x).sort(), Object.keys(y).sort(), "the same batches");
  assert.ok(Object.keys(x).length >= 4, `${Object.keys(x).length} batches`);
  let instances = 0;
  for (const key of Object.keys(x)) {
    assert.equal(x[key]!.count, y[key]!.count, `${key} count`);
    assert.equal(x[key]!.geometry, y[key]!.geometry, `${key} geometry`);
    assert.deepEqual(x[key]!.matrices, y[key]!.matrices, `${key} matrices`);
    assert.deepEqual(x[key]!.colors, y[key]!.colors, `${key} colours`);
    instances += x[key]!.count;
  }
  assert.ok(instances >= 20, `${instances} instances (five far figures: the parts far keeps, their blobs)`);
  assert.equal(objects(after.root), objectsBefore, "no mesh made by the crowd");
  assert.ok(objects(after.root) < objects(before.root), "fewer objects than the mesh figures");
  // A stale figure draws on its own (see-through): it has meshes, on the default layer; the batched parts' meshes are on the hidden layer.
  const stale = after.handles[3]!;
  const own = stale.object.getObjectsByProperty("type", "Mesh") as THREE.Mesh[];
  assert.ok(own.length > 2, "the stale figure's own meshes");
  // Resting: drawn from what the first resting frame found, the same instances; released, its meshes come back to the default layer.
  for (const crowd of [a, b]) {
    crowd.begin();
    for (const s of crowd === a ? [before] : [after]) for (const h of s.handles) crowd.add(h.object, true, true);
    crowd.end();
    crowd.begin();
    for (const s of crowd === a ? [before] : [after]) for (const h of s.handles) crowd.add(h.object, true, true);
    crowd.end();
  }
  const xr = drawn(a), yr = drawn(b);
  for (const key of Object.keys(xr)) {
    assert.deepEqual(xr[key]!.matrices, yr[key]!.matrices, `${key} resting matrices`);
    assert.deepEqual(xr[key]!.matrices, x[key]!.matrices, `${key} resting as before`);
  }
  // Near again: materialised, the meshes released to the default layer; the crowd forgets the robot.
  b.begin();
  b.end();
  for (const h of after.handles) h.setDetail("near");
  for (const h of after.handles) for (const m of h.object.getObjectsByProperty("type", "Mesh") as THREE.Mesh[]) assert.equal(m.layers.mask, 1, "every mesh on the default layer when near");
  a.dispose();
  b.dispose();
});
