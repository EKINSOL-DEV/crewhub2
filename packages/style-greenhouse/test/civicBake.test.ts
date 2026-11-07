/* Round 21: the landmarks' bake (civic.ts) reads a model's parts as data and unrolls, transforms and concatenates each
   source in one pass. What it makes must be, to the bit, what the old road made (a non-indexed copy per source, its
   extra attributes dropped, uv and normals filled in, `applyMatrix4`, then `mergeGeometries`): held side by side here
   over sources of every kind the kit makes, and pinned for the seven landmarks against the round-21 base (f2c3000). */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { validatePropModel, type PropModel } from "@crewhub/world-engine";
import { bake, bakeGeometry, cafe, greenhouse, postOffice, square, townHall, welcomeSign, windmill } from "../src/civic.ts";
import { Kit, type GreenhouseManifestData } from "../src/kit.ts";
import { partsModel, wedgeGeometry } from "../src/parts.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as GreenhouseManifestData & { lighting: ConstructorParameters<typeof Kit>[1] };
const FIXTURE = path.join(ROOT, "test", "data", "civic-r21.json");
const hash = (a: Float32Array | undefined) => (a ? createHash("sha256").update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest("hex").slice(0, 32) : null);

const model = (kit: Kit, key: string) => {
  const checked = validatePropModel(JSON.parse(readFileSync(path.join(ROOT, "models", `${key}.json`), "utf8")));
  assert.ok(checked.ok, key);
  return partsModel((checked as { value: PropModel }).value, kit);
};

/** The bake as it was before the round: a copy per source, transformed, then three's merge. */
function reference(root: THREE.Group): { material: THREE.Material; geometry: THREE.BufferGeometry }[] {
  root.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material)) return;
    const source = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const attribute of Object.keys(source.attributes)) if (!["position", "normal", "uv"].includes(attribute)) source.deleteAttribute(attribute);
    if (!source.attributes.uv) source.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(source.attributes.position!.count * 2), 2));
    if (!source.attributes.normal) source.computeVertexNormals();
    source.applyMatrix4(o.matrixWorld);
    const list = byMaterial.get(o.material) ?? [];
    list.push(source);
    byMaterial.set(o.material, list);
  });
  return [...byMaterial].map(([material, geometries]) => ({ material, geometry: mergeGeometries(geometries, false) ?? new THREE.BufferGeometry() }));
}

/** The extruded source's own material (one object, so the two builds of the sources share it as the kit's are shared). */
const GABLE = new THREE.MeshStandardMaterial({ color: 0x808080 });

/** `object` placed at x, y, z, turned `ry` about y and scaled. */
function at<T extends THREE.Object3D>(object: T, x: number, y: number, z: number, ry = 0, scale: [number, number, number] = [1, 1, 1]): T {
  object.position.set(x, y, z);
  object.rotation.y = ry;
  object.scale.set(...scale);
  return object;
}

/** Sources of every kind the landmarks are made of, under transforms that turn and stretch them, with what the bake must skip. */
function sources(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const a = kit.material("chalk"), b = kit.material("timber"), c = kit.material("sage");
  const turned = new THREE.Group();
  turned.position.set(1.5, 0.25, -2);
  turned.rotation.set(0.2, 1.1, -0.3);
  turned.scale.set(1.3, 0.8, 1.1);
  g.add(turned);
  // The kit's rounded box (indexed), a plain box, a cone (a hip roof), a torus, a sphere: indexed, with uv.
  turned.add(kit.mesh(kit.boxGeometry(1.2, 0.4, 0.9), a));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 0.7), b), -1, 1, 0.5, 0.7, [2, 0.5, 1]));
  g.add(at(new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(3, 1.2, 2), a), 0, 2, 0));
  turned.add(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 10, 32), c));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), b));
  // Non-indexed sources: an extruded gable (attributes position, uv, normal in that order) and a wedge (a merge itself).
  const shape = new THREE.Shape();
  shape.moveTo(-1, 0);
  shape.lineTo(1, 0);
  shape.lineTo(0, 0.8);
  shape.closePath();
  // Its own material, so it comes first in it: an extruded geometry's attributes are position, uv, normal, in that order.
  g.add(at(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false }).translate(0, 0, -1.5).rotateY(Math.PI / 2), GABLE), 0, 3, 0));
  turned.add(new THREE.Mesh(wedgeGeometry(0.6, 0.6, 0.3, 270), a));
  // A source without uv (indexed), one with an attribute of its own, and one without normals (the old road).
  const bare = new THREE.BufferGeometry();
  bare.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
  bare.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  bare.setIndex([0, 1, 2, 2, 1, 3]);
  g.add(at(new THREE.Mesh(bare, b), 2, 0, 2));
  const extra = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  extra.setAttribute("aSwatch", new THREE.BufferAttribute(new Uint8Array(extra.attributes.position!.count), 1));
  turned.add(new THREE.Mesh(extra, c));
  const flat = new THREE.BufferGeometry();
  flat.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1], 3));
  flat.setIndex([0, 2, 1, 1, 2, 3]);
  g.add(at(new THREE.Mesh(flat, a), -2, 0.1, -2, 0, [2, 1, 0.5]));
  // Models that hold their parts as data, one nested under the turned group, and what the bake leaves out.
  g.add(at(model(kit, "civic.park-bench"), 3, 0, 1, 0.5));
  turned.add(at(model(kit, "civic.planter"), -0.5, 0, 0.5));
  g.add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), a, 3));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), [a, b, c, a, b, c]));
  return g;
}

const same = (x: Float32Array | undefined, y: Float32Array | undefined, what: string) => {
  assert.ok(x && y, what);
  assert.equal(x.length, y.length, `${what} length`);
  for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) assert.fail(`${what}[${i}]: ${x[i]} vs ${y[i]}`);
};

test("bake: the sources of every kind, baked as data in one pass, are the old road's geometries to the bit (materials, attribute order, every value)", () => {
  const kit = new Kit(manifest, manifest.lighting);
  const expected = reference(sources(kit));
  const actual = bake(kit, "test", sources(kit));
  assert.equal(actual.length, expected.length);
  assert.ok(expected.length >= 3, `${expected.length} materials`);
  let vertices = 0;
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i]!, e = expected[i]!;
    assert.equal(a.material, e.material, `material ${i}`);
    assert.deepEqual(Object.keys(a.geometry.attributes), Object.keys(e.geometry.attributes), `attribute order ${i}`);
    assert.equal(a.geometry.index, null);
    for (const name of ["position", "normal", "uv"]) {
      const x = a.geometry.attributes[name] as THREE.BufferAttribute, y = e.geometry.attributes[name] as THREE.BufferAttribute;
      assert.equal(x.itemSize, y.itemSize);
      assert.ok(x.array instanceof Float32Array && y.array instanceof Float32Array, `${name} ${i} Float32`);
      same(x.array as Float32Array, y.array as Float32Array, `${name} ${i}`);
    }
    vertices += a.geometry.attributes.position!.count;
  }
  assert.ok(vertices > 2000, `${vertices} vertices`);
  // The gable first in its material: the old order (position, uv, normal) is kept.
  assert.ok(actual.some((b) => Object.keys(b.geometry.attributes).join() === "position,uv,normal"), "an extruded source first keeps its attribute order");
  // A source without normals or with no uv takes the old road and lands the same; nothing of the data models was made a mesh.
  assert.equal(bakeGeometry([]).attributes.position, undefined);
});

test("bake: the seven landmarks are the round-21 base's, hash for hash (every baked mesh's position, normal and uv; the live meshes and spots too)", () => {
  const kit = new Kit(manifest, manifest.lighting);
  const piece = (key: string) => model(kit, key);
  const landmarks: Record<string, () => THREE.Group> = {
    "post-office": () => postOffice(kit, piece),
    "town-hall": () => townHall(kit, piece),
    "civic.square": () => square(kit, piece),
    "civic.cafe": () => cafe(kit, piece),
    "civic.greenhouse": () => greenhouse(kit),
    "civic.windmill": () => windmill(kit),
    "civic.welcome-sign": () => welcomeSign(kit),
  };
  const expected = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
  for (const [key, make] of Object.entries(landmarks)) {
    const o = make();
    const meshes: unknown[] = [];
    for (const c of o.children) {
      if (!(c instanceof THREE.Mesh)) continue;
      const g = c.geometry as THREE.BufferGeometry;
      meshes.push({ vertices: g.attributes.position!.count, indexed: !!g.index, attributes: Object.keys(g.attributes), position: hash(g.attributes.position!.array as Float32Array), normal: hash(g.attributes.normal?.array as Float32Array), uv: hash(g.attributes.uv?.array as Float32Array), material: (c.material as THREE.MeshStandardMaterial).color?.getHexString?.() ?? (c.material as THREE.Material).type });
    }
    const spots = o.children.filter((c) => typeof c.userData.life === "string").map((c) => ({ life: c.userData.life, p: [...c.position.toArray()], q: [...c.quaternion.toArray()] }));
    assert.deepEqual(JSON.parse(JSON.stringify({ children: o.children.length, meshes, spots })), expected[key], key);
  }
  assert.equal(Object.keys(expected).length, 7);
});
