import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { InstanceCuller, instanceStatic } from "../src/world/instanceStatic.ts";

/** A row of `n` small boxes 20 apart along x, sharing geometry and material, each in its own wrapper group. */
function row(n: number) {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1),
    material = new THREE.MeshBasicMaterial();
  for (let i = 0; i < n; i++) {
    const wrapper = new THREE.Group();
    wrapper.position.set(i * 20, 0, 0);
    wrapper.add(new THREE.Mesh(geometry, material));
    root.add(wrapper);
  }
  return root;
}

test("repeated meshes become one instanced mesh and the emptied wrappers go", () => {
  const root = row(5);
  const instanced = instanceStatic(root);
  assert.equal(instanced.length, 1);
  assert.equal(instanced[0]!.count, 5);
  assert.deepEqual(root.children, instanced, "only the instanced mesh is left under the root");
});

test("the culler draws only the instances near the view, and all of them again when the view widens", () => {
  const root = row(6);
  const [mesh] = instanceStatic(root);
  const culler = new InstanceCuller([mesh!]);
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
  camera.position.set(0, 30, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  assert.equal(culler.update(camera), true);
  assert.equal(mesh!.count, 1, "the camera over the first box sees one");
  const first = new THREE.Matrix4();
  mesh!.getMatrixAt(0, first);
  assert.equal(new THREE.Vector3().setFromMatrixPosition(first).x, 0);
  assert.equal(culler.update(camera), false, "an unmoved camera costs nothing");
  camera.left = -200;
  camera.right = 200;
  camera.updateProjectionMatrix();
  assert.equal(culler.update(camera), true);
  assert.equal(mesh!.count, 6);
  assert.equal(mesh!.visible, true);
});
