/* The Object3D cut (round 15): a data model is one node holding its parts as data, and must be, to the bit, the model
   it was as a mesh per part: the same geometry and material objects in the same order, the same position, rotation
   and scale, the same composed matrix, the same shadow flags; read through `children` it is that group of meshes
   (in front of anything added to it), and a matrix update from above never makes the meshes. Every model file. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { validatePropModel, type PropModel } from "@crewhub/world-engine";
import { staticPartsOf } from "@crewhub/world-style";
import { Kit, type GreenhouseManifestData } from "../src/kit.ts";
import { partMesh, partsModel } from "../src/parts.ts";
import { PartsNode } from "../src/partsNode.ts";
import { townDetail } from "../src/town.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as GreenhouseManifestData & { lighting: ConstructorParameters<typeof Kit>[1] };
const files = readdirSync(path.join(ROOT, "models")).filter((f) => f.endsWith(".json"));
const models = files.map((file) => {
  const checked = validatePropModel(JSON.parse(readFileSync(path.join(ROOT, "models", file), "utf8")));
  assert.ok(checked.ok, file);
  return { file, model: (checked as { value: PropModel }).value };
});

/** The model as it was drawn before the cut: a group with a mesh per part, from the same kit. */
function reference(model: PropModel, kit: Kit, accent: string | null = null, swap: Record<string, string> | null = null): THREE.Group {
  const g = new THREE.Group();
  const accented = model.tags.find((t) => t.startsWith("accent-"))?.slice("accent-".length) ?? null;
  for (const part of model.parts) {
    const color = accent && part.material === accented ? accent : (swap?.[part.material] ?? part.material);
    g.add(partMesh(kit, part, color));
  }
  return g;
}

const elements = (m: THREE.Matrix4) => Float64Array.from(m.elements);
const meshesOf = (o: THREE.Object3D) => o.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);

function sameAsReference(node: PartsNode, ref: THREE.Group, label: string) {
  const parts = node.staticParts;
  const refMeshes = meshesOf(ref);
  assert.equal(parts.length, refMeshes.length, `${label}: one part per mesh`);
  ref.updateMatrixWorld(true);
  parts.forEach((part, i) => {
    const mesh = refMeshes[i]!;
    assert.equal(part.geometry, mesh.geometry, `${label} part ${i}: the same geometry object`);
    assert.equal(part.material, mesh.material, `${label} part ${i}: the same material object`);
    assert.deepEqual(part.position.toArray(), mesh.position.toArray(), `${label} part ${i}: position`);
    assert.deepEqual([part.rotation.x, part.rotation.y, part.rotation.z, part.rotation.order], [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z, mesh.rotation.order], `${label} part ${i}: rotation`);
    assert.deepEqual(part.scale.toArray(), mesh.scale.toArray(), `${label} part ${i}: scale`);
    assert.deepEqual(elements(part.matrix), elements(mesh.matrix), `${label} part ${i}: the composed matrix, to the bit`);
    assert.equal(part.castShadow, mesh.castShadow, `${label} part ${i}: castShadow`);
    assert.equal(part.receiveShadow, mesh.receiveShadow, `${label} part ${i}: receiveShadow`);
  });
}

test("every model file: the node's parts are the reference meshes' geometry, material, transform and matrix, to the bit", () => {
  const kit = new Kit(manifest, manifest.lighting);
  for (const { file, model } of models) {
    const node = partsModel(model, kit);
    assert.ok(node instanceof PartsNode && staticPartsOf(node) === node, `${file}: a static-parts holder`);
    assert.equal(node.name, model.id);
    assert.equal(node.type, "Group", `${file}: a Group to the batchers' empty-group sweep`);
    assert.equal(node.rawChildren.length, 0, `${file}: nothing but the parts`);
    sameAsReference(node, reference(model, kit), file);
  }
});

test("an accent and a look's material swap pick the same materials as before", () => {
  const kit = new Kit(manifest, manifest.lighting);
  const banner = models.find((m) => m.file === "banner.json")!.model;
  sameAsReference(partsModel(banner, kit, "sage"), reference(banner, kit, "sage"), "banner with the sage accent");
  const swap = { leaf: "blossom", coral: "sky" };
  for (const { file, model } of models.slice(0, 40)) sameAsReference(partsModel(model, kit, null, swap), reference(model, kit, null, swap), `${file} swapped`);
});

test("read through children, the node is the group of meshes it stood for: the same meshes in front of what was added, their world matrices as the node's update left them", () => {
  const kit = new Kit(manifest, manifest.lighting);
  const { model } = models.find((m) => m.file === "town.lodge.json")!;
  const node = partsModel(model, kit);
  const ref = reference(model, kit);
  const decal = new THREE.Object3D();
  decal.name = "added-after";
  node.add(decal);
  ref.add(decal.clone());
  assert.equal(node.staticParts.length, model.parts.length, "add never materialises");
  assert.deepEqual(node.rawChildren.map((o) => o.name), ["added-after"]);
  for (const root of [node, ref]) {
    root.position.set(3, 0.5, -2);
    root.rotation.y = 0.7;
    root.scale.setScalar(1.3);
  }
  const wrapper = new THREE.Group();
  wrapper.position.x = 10;
  wrapper.add(node);
  wrapper.updateMatrixWorld(true);
  assert.equal(node.staticParts.length, model.parts.length, "a matrix update from above never materialises");
  assert.deepEqual(elements(node.matrixWorld), elements(wrapper.matrixWorld.clone().multiply(node.matrix)));
  const refWrapper = new THREE.Group();
  refWrapper.position.x = 10;
  refWrapper.add(ref);
  refWrapper.updateMatrixWorld(true);
  // The read: children materialises the parts, in front of the decal.
  const children = node.children;
  assert.equal(node.staticParts.length, 0);
  assert.equal(children.length, model.parts.length + 1);
  assert.equal(children[children.length - 1], decal);
  const meshes = meshesOf(node);
  const refMeshes = meshesOf(ref);
  meshes.forEach((mesh, i) => {
    const other = refMeshes[i]!;
    assert.equal(mesh.parent, node);
    assert.equal(mesh.geometry, other.geometry);
    assert.equal(mesh.material, other.material);
    assert.deepEqual(mesh.position.toArray(), other.position.toArray());
    assert.deepEqual(mesh.quaternion.toArray(), other.quaternion.toArray());
    assert.deepEqual(mesh.scale.toArray(), other.scale.toArray());
    assert.deepEqual(elements(mesh.matrix), elements(other.matrix));
    assert.deepEqual(elements(mesh.matrixWorld), elements(other.matrixWorld), `mesh ${i}: the world matrix the update would have given`);
    assert.equal(mesh.castShadow, true);
    assert.equal(mesh.receiveShadow, true);
  });
  // traverse and a bounding box see the same meshes.
  let seen = 0;
  node.traverse((o) => void (o instanceof THREE.Mesh && seen++));
  assert.equal(seen, model.parts.length);
  const box = new THREE.Box3().setFromObject(node), refBox = new THREE.Box3().setFromObject(ref);
  assert.deepEqual([...box.min.toArray(), ...box.max.toArray()], [...refBox.min.toArray(), ...refBox.max.toArray()]);
});

test("the town detail pass lightens and unshadows a node's parts as it did the meshes; the parts taken by a batcher are gone, the rest still materialise", () => {
  const kit = new Kit(manifest, manifest.lighting);
  const { model } = models.find((m) => m.file === "town.wildflowers.json")!;
  const node = partsModel(model, kit);
  const ref = reference(model, kit);
  townDetail(kit, node, "town.wildflowers");
  townDetail(kit, ref, "town.wildflowers");
  assert.equal(node.staticParts.length, model.parts.length, "the detail pass reads the parts as data");
  const refMeshes = meshesOf(ref);
  node.staticParts.forEach((part, i) => {
    assert.equal(part.geometry, refMeshes[i]!.geometry, `part ${i}: the same (lighter) geometry`);
    assert.equal(part.castShadow, refMeshes[i]!.castShadow, `part ${i}: the same shadow flag`);
  });
  assert.ok(node.staticParts.some((part, i) => part.geometry !== partsModel(model, kit).staticParts[i]!.geometry), "something was lightened");
  const [first, second, ...rest] = node.staticParts;
  node.takeParts([first!, second!]);
  assert.deepEqual(node.staticParts, rest);
  assert.equal(meshesOf(node).length, rest.length);
});
