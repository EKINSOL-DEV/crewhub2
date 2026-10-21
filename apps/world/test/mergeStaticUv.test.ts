import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { mergeStatic } from "../src/world/mergeStatic.ts";

/** `n` boxes under their own wrappers, each with a material of its own: a palette batch when the materials are plain. */
function boxes(n: number, material: () => THREE.Material) {
  const root = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const wrapper = new THREE.Group();
    wrapper.position.set(i * 3, 0, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material());
    mesh.castShadow = true;
    wrapper.add(mesh);
    root.add(wrapper);
  }
  return root;
}

test("a palette batch of plain colours keeps no uv: nothing reads it, and it was a quarter of every vertex", () => {
  const root = boxes(3, () => new THREE.MeshStandardMaterial({ color: 0x4488aa }));
  const created = mergeStatic(root);
  assert.equal(created.length, 1, "three plain colours merge into one palette batch");
  const geometry = created[0]!;
  assert.equal(geometry.attributes.uv, undefined, "no uv");
  assert.ok(geometry.attributes.position && geometry.attributes.normal && geometry.attributes.aSwatch, "position, normal and the swatch stay");
  assert.equal(geometry.attributes.position!.count, 3 * 24);
  assert.ok(geometry.boundingSphere, "bounds are computed before the data goes");
});

test("a textured material keeps its uv, and so does a material with a shader of its own", () => {
  const shared = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  const textured = mergeStatic(boxes(2, () => shared));
  assert.equal(textured.length, 1, "one material, one batch");
  assert.ok(textured[0]!.attributes.uv, "a map reads the uv");
  const patterned = mergeStatic(
    boxes(2, () => {
      const material = new THREE.MeshStandardMaterial();
      material.onBeforeCompile = () => undefined; // a pattern of its own, not a lighting hook
      return material;
    }),
  );
  assert.equal(patterned.length, 2, "a shader of its own merges per material");
  for (const geometry of patterned) assert.ok(geometry.attributes.uv, "a shader may read the uv");
});

test("a lighting hook (userData.lightHook) still batches by palette, without uv", () => {
  const hook = () => undefined;
  const root = boxes(2, () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x224433 });
    material.onBeforeCompile = hook;
    material.userData.lightHook = hook;
    return material;
  });
  const created = mergeStatic(root);
  assert.equal(created.length, 1);
  assert.equal(created[0]!.attributes.uv, undefined);
});
