/* mergeStatic writes every vertex once, straight into its batch's arrays (no copy per source, no mergeGeometries).
   The result must be the geometry the two-copy way produced, to the bit: the same vertices in the same order, the
   positions and normals transformed the same (applyMatrix4's maths), the index offset the same, the uv kept or
   dropped the same, the swatches the same. The reference here is that two-copy way. */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mergeStatic, mergeStaticSteps } from "../src/world/mergeStatic.ts";

/** The shapes a style hands over: shared, indexed, non-indexed, without uv, without normals. */
function shapes(): THREE.BufferGeometry[] {
  const box = new THREE.BoxGeometry(1, 0.5, 0.25);
  const rounded = new RoundedBoxGeometry(0.4, 0.4, 0.4, 2, 0.05);
  const flat = new THREE.BoxGeometry(0.3, 0.3, 0.3).toNonIndexed();
  const noUv = new THREE.BoxGeometry(0.2, 0.6, 0.2);
  noUv.deleteAttribute("uv");
  const noNormal = new THREE.BufferGeometry();
  noNormal.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0.5, 1, 0.5], 3));
  noNormal.setIndex([0, 1, 2, 0, 2, 3, 0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0]);
  return [box, rounded, flat, noUv, noNormal, box];
}

/** A tree of nested, turned, unevenly scaled wrappers, a mesh of each shape, in `materials` round-robin. */
function scene(materials: THREE.Material[]): { root: THREE.Group; meshes: THREE.Mesh[] } {
  const root = new THREE.Group();
  root.position.set(3, 0, -2);
  root.rotation.y = 0.3;
  const meshes: THREE.Mesh[] = [];
  let parent: THREE.Object3D = root;
  shapes().forEach((geometry, n) => {
    const wrapper = new THREE.Group();
    wrapper.position.set(n * 1.7, n % 2, -n);
    wrapper.rotation.set(0.1 * n, 0.4 * n, 0.05 * n);
    wrapper.scale.set(1 + 0.1 * n, 1.3, 0.8);
    const mesh = new THREE.Mesh(geometry, materials[n % materials.length]!);
    mesh.position.y = 0.2;
    // All cast shadows: `look()` keys on castShadow, so a mix would split the palette batch in two.
    mesh.castShadow = true;
    wrapper.add(mesh);
    parent.add(wrapper);
    parent = wrapper;
    meshes.push(mesh);
  });
  return { root, meshes };
}

/** The two-copy way: a transformed copy of each source (as `mergeStatic` made it), then `mergeGeometries`. */
function reference(root: THREE.Group, meshes: THREE.Mesh[], swatch: (mesh: THREE.Mesh) => number | null): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const copies = meshes.map((o) => {
    const source = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const attribute = o.geometry.attributes[name];
      if (attribute) source.setAttribute(name, attribute.clone());
    }
    const index = o.geometry.index;
    source.setIndex(index ? index.clone() : Array.from({ length: o.geometry.attributes.position!.count }, (_, i) => i));
    if (!source.attributes.uv) source.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(source.attributes.position!.count * 2), 2));
    if (!source.attributes.normal) source.computeVertexNormals();
    source.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    const index2 = swatch(o);
    if (index2 !== null) source.setAttribute("aSwatch", new THREE.BufferAttribute(new Uint8Array(source.attributes.position!.count).fill(index2), 1));
    return source;
  });
  const merged = mergeGeometries(copies, false)!;
  if (swatch(meshes[0]!) !== null) merged.deleteAttribute("uv");
  return merged;
}

function same(actual: THREE.BufferGeometry, expected: THREE.BufferGeometry, what: string) {
  assert.deepEqual(Object.keys(actual.attributes).sort(), Object.keys(expected.attributes).sort(), `${what}: the same attributes`);
  for (const name of Object.keys(expected.attributes)) {
    const a = actual.attributes[name] as THREE.BufferAttribute, e = expected.attributes[name] as THREE.BufferAttribute;
    assert.equal(a.itemSize, e.itemSize, `${what}: ${name} itemSize`);
    assert.equal(a.array.constructor, e.array.constructor, `${what}: ${name} array type`);
    assert.deepEqual(Array.from(a.array), Array.from(e.array), `${what}: ${name} to the bit`);
  }
  assert.equal(actual.index!.array.constructor, expected.index!.array.constructor, `${what}: index type`);
  assert.deepEqual(Array.from(actual.index!.array), Array.from(expected.index!.array), `${what}: the index`);
  expected.computeBoundingSphere();
  assert.ok(actual.boundingSphere!.center.equals(expected.boundingSphere!.center) && actual.boundingSphere!.radius === expected.boundingSphere!.radius, `${what}: the bounding sphere`);
}

test("a palette batch is, to the bit, what a transformed copy per source and mergeGeometries gave (uv dropped, swatches per material)", () => {
  const colours = [0xd8d3c8, 0x8a6a4a, 0x6a8a5a].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  const { root, meshes } = scene(colours);
  const expected = reference(root, meshes, (mesh) => colours.indexOf(mesh.material as THREE.MeshStandardMaterial));
  const created = mergeStatic(root, { keepData: true });
  assert.equal(created.length, 1, "one palette batch");
  same(created[0]!, expected, "palette");
  assert.equal(created[0]!.attributes.uv, undefined);
  assert.ok(root.children.length === 1 && root.children[0] instanceof THREE.Mesh, "the sources and their wrappers are gone");
  assert.equal((root.children[0] as THREE.Mesh).castShadow, true, "a batch casts shadows when a source did");
});

test("a per-material batch keeps its uv (zeros where a source had none) and matches the two-copy way", () => {
  const textured = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  const { root, meshes } = scene([textured]);
  const expected = reference(root, meshes, () => null);
  const created = mergeStatic(root, { keepData: true });
  assert.equal(created.length, 1, "one material, one batch");
  same(created[0]!, expected, "textured");
  assert.ok(created[0]!.attributes.uv, "the uv stays for a map");
});

test("a batch past 65535 vertices indexes in 32 bits, a smaller one in 16", () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x334455 });
  const big = new THREE.Group();
  for (let i = 0; i < 3; i++) big.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 60, 60, 60), material)); // 3 x 22326 vertices
  const [wide] = mergeStatic(big);
  assert.equal(wide!.attributes.position!.count, 3 * 6 * 61 * 61);
  assert.ok(wide!.index!.array instanceof Uint32Array, "32-bit index");
  const small = new THREE.Group();
  small.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const [narrow] = mergeStatic(small);
  assert.ok(narrow!.index!.array instanceof Uint16Array, "16-bit index");
});

test("the merge in steps yields between chunks and gives the same geometry as the merge at once", () => {
  const colours = [0xd8d3c8, 0x8a6a4a].map((color) => new THREE.MeshStandardMaterial({ color }));
  const many = () => {
    const root = new THREE.Group();
    for (let i = 0; i < 400; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), colours[i % 2]!);
      mesh.position.set(i % 20, 0, Math.floor(i / 20));
      root.add(mesh);
    }
    return root;
  };
  const atOnce = mergeStatic(many(), { keepData: true });
  const steps = mergeStaticSteps(many(), { keepData: true });
  let yields = 0;
  let result: THREE.BufferGeometry[] = [];
  for (;;) {
    const next = steps.next();
    if (next.done) {
      result = next.value;
      break;
    }
    yields++;
  }
  assert.ok(yields >= 3, `400 sources take several steps (${yields})`);
  assert.equal(result.length, atOnce.length);
  same(result[0]!, atOnce[0]!, "stepped");
});
