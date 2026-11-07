/* The batchers over a model that holds its parts as data (the StaticParts convention of @crewhub/world-style, the
   round-15 Object3D cut) must give what they gave over the same model as a mesh per part, to the bit: the same merged
   batches (vertices, normals, uv, swatches, index, materials, shadow flags, in the same order), the same instanced
   meshes (count, matrices, flags) and the same leftovers; the tree afterwards the same; and no part made into a mesh
   on the way. The reference is a tree of plain groups and meshes; the holder here is a small one of its own, so the
   test pins the contract, not a style. */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { StaticPart, StaticPartsHolder } from "@crewhub/world-style";
import { instanceStatic } from "../src/world/instanceStatic.ts";
import { mergeStatic, staticPieces } from "../src/world/mergeStatic.ts";

/** The smallest holder: parts as data; `children` read makes meshes (as the convention asks) in front of the rest. */
class Holder extends THREE.Group implements StaticPartsHolder {
  staticParts: StaticPart[];
  #raw: THREE.Object3D[];
  materialised = 0;
  constructor(parts: StaticPart[]) {
    super();
    this.staticParts = parts;
    this.#raw = this.children;
    Object.defineProperty(this, "children", {
      configurable: true,
      get: () => {
        if (this.staticParts.length) {
          this.materialised++;
          const meshes = this.staticParts.map((part) => meshOf(part));
          for (const mesh of meshes) mesh.parent = this;
          this.staticParts = [];
          this.#raw = [...meshes, ...this.#raw];
        }
        return this.#raw;
      },
      set: (v: THREE.Object3D[]) => void (this.#raw = v),
    });
  }
  get rawChildren() {
    return this.#raw;
  }
  takeParts(parts: Iterable<StaticPart>) {
    const taken = new Set(parts);
    this.staticParts = this.staticParts.filter((p) => !taken.has(p));
  }
  override add(...objects: THREE.Object3D[]): this {
    for (const o of objects) {
      o.removeFromParent();
      o.parent = this;
      this.#raw.push(o);
    }
    return this;
  }
  override updateMatrixWorld(force?: boolean): void {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.parent === null) this.matrixWorld.copy(this.matrix);
      else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    for (const child of this.#raw) child.updateMatrixWorld(force);
  }
}

function meshOf(part: StaticPart): THREE.Mesh {
  const mesh = new THREE.Mesh(part.geometry, part.material);
  mesh.castShadow = part.castShadow;
  mesh.receiveShadow = part.receiveShadow;
  mesh.position.copy(part.position);
  mesh.rotation.copy(part.rotation);
  mesh.scale.copy(part.scale);
  return mesh;
}

function part(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, ry = 0, scale = 1, castShadow = true): StaticPart {
  const position = new THREE.Vector3(x, y, z);
  const rotation = new THREE.Euler(0.1, ry, 0.05, "XYZ");
  const size = new THREE.Vector3(scale, 1.2, scale);
  return { geometry, material, position, rotation, scale: size, matrix: new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), size), castShadow, receiveShadow: true };
}

/** A kit-shaped scene: shared geometries, palette materials with a lighting hook, a glass material, a decal. */
function kit() {
  const hook: THREE.Material["onBeforeCompile"] = () => {};
  const plain = (color: number) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 });
    m.onBeforeCompile = hook;
    m.userData.lightHook = hook;
    return m;
  };
  const glass = new THREE.MeshStandardMaterial({ color: 0x88aaff, transparent: true, opacity: 0.5 });
  const box = new THREE.BoxGeometry(0.3, 0.2, 0.1), ball = new THREE.SphereGeometry(0.05, 4, 3), post = new THREE.CylinderGeometry(0.02, 0.03, 0.8, 10), leaf = new THREE.SphereGeometry(0.3, 12, 10);
  const decalGeometry = new THREE.PlaneGeometry(1, 1);
  decalGeometry.setAttribute("aShape", new THREE.BufferAttribute(new Float32Array(decalGeometry.attributes.position!.count * 3), 3));
  return { chalk: plain(0xeeeeee), timber: plain(0x885533), leafy: plain(0x33aa44), glass, box, ball, post, leaf, decalGeometry, decalMaterial: new THREE.ShaderMaterial() };
}

/**
 * A town-like tree: a wrapper per model (position, turn, scale), models of several parts each. `make` builds a model
 * as a holder (parts as data) or as the reference (a group of meshes); both trees have the same wrappers.
 */
function town(k: ReturnType<typeof kit>, holders: boolean): { root: THREE.Group; holdersMade: Holder[] } {
  const root = new THREE.Group();
  root.position.set(4, 0, -3);
  root.rotation.y = 0.2;
  const holdersMade: Holder[] = [];
  const model = (parts: StaticPart[], extra?: THREE.Object3D): THREE.Object3D => {
    if (holders) {
      const h = new Holder(parts);
      if (extra) h.add(extra);
      holdersMade.push(h);
      return h;
    }
    const g = new THREE.Group();
    for (const p of parts) g.add(meshOf(p));
    if (extra) g.add(extra);
    return g;
  };
  // Seven flowers: a post, a leaf blob (instanced, over the budget), three tiny balls (merged, tiny so no shadow).
  for (let i = 0; i < 7; i++) {
    const wrapper = new THREE.Group();
    wrapper.position.set(i * 1.5, 0, (i % 3) * 0.7);
    wrapper.rotation.y = i * 0.4;
    wrapper.scale.setScalar(0.9 + 0.05 * i);
    wrapper.add(model([part(k.post, k.timber, 0, 0.4, 0), part(k.leaf, k.leafy, 0, 0.9, 0, 0.3), part(k.ball, k.chalk, 0.1, 1.1, 0, 0, 0.5), part(k.ball, k.chalk, -0.1, 1.15, 0.05, 1, 0.5), part(k.ball, k.chalk, 0, 1.2, -0.1, 2, 0.5)]));
    root.add(wrapper);
  }
  // A lodge: boxes of two plain materials and a glass pane, with a decal added after the parts (its own attribute).
  const decal = new THREE.Mesh(k.decalGeometry, k.decalMaterial);
  decal.userData.decal = true;
  const lodge = model([part(k.box, k.chalk, 0, 0.1, 0), part(k.box, k.timber, 0, 0.3, 0, 0.5), part(k.box, k.glass, 0, 0.5, 0, 1), part(k.box, k.chalk, 0.4, 0.1, 0, 0, 2, false)], decal);
  lodge.position.set(-2, 0, 1);
  root.add(lodge);
  // A plain mesh beside them, and a live mesh that stays.
  const live = new THREE.Mesh(k.box, k.timber);
  live.userData.live = true;
  live.position.set(5, 1, 5);
  root.add(live);
  const lone = new THREE.Mesh(k.box, k.leafy);
  lone.position.set(-5, 0, -5);
  root.add(lone);
  return { root, holdersMade };
}

const attribute = (g: THREE.BufferGeometry, name: string) => (g.getAttribute(name) as THREE.BufferAttribute | undefined)?.array ?? null;
const sameGeometry = (a: THREE.BufferGeometry, b: THREE.BufferGeometry, label: string) => {
  for (const name of ["position", "normal", "uv", "aSwatch"]) assert.deepEqual(attribute(a, name), attribute(b, name), `${label}: ${name}`);
  assert.deepEqual(a.index?.array ?? null, b.index?.array ?? null, `${label}: index`);
  assert.deepEqual(a.boundingSphere?.center.toArray(), b.boundingSphere?.center.toArray(), `${label}: bounds`);
  assert.equal(a.boundingSphere?.radius, b.boundingSphere?.radius, `${label}: radius`);
};
/** The tree's shape: types, and for a mesh its material's kind (a palette batch's material is a fresh clone each time) and whether it is a palette batch. */
const describe = (o: THREE.Object3D): string => `${o.type}${o instanceof THREE.Mesh ? `:${(o.material as THREE.Material).type}${o.geometry.attributes.aSwatch ? "+palette" : ""}:${o.geometry.attributes.position?.count ?? 0}` : ""}(${o.children.map(describe).join(",")})`;
const meshes = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => void (o instanceof THREE.Mesh && out.push(o)));
  return out;
};

test("staticPieces reads parts as data, in traversal order, with the world matrix a mesh would have, without materialising", () => {
  const k = kit();
  const a = town(k, true), b = town(k, false);
  a.root.updateMatrixWorld(true);
  b.root.updateMatrixWorld(true);
  const pa = staticPieces(a.root, true), pb = staticPieces(b.root, true);
  assert.equal(pa.length, pb.length);
  pa.forEach((p, i) => {
    const q = pb[i]!;
    assert.equal(p.geometry, q.geometry, `piece ${i}: geometry`);
    assert.equal(p.material, q.material, `piece ${i}: material`);
    assert.deepEqual(Float64Array.from(p.matrixWorld.elements), Float64Array.from(q.matrixWorld.elements), `piece ${i}: world matrix, to the bit`);
    assert.equal(p.castShadow, q.castShadow);
    assert.equal(p.mergeable, q.mergeable);
  });
  assert.equal(staticPieces(a.root).length, staticPieces(b.root).length, "the mergeable subset is the same size");
  assert.ok(a.holdersMade.every((h) => h.materialised === 0), "no holder was materialised by the read");
  assert.ok(pa.some((p) => p.part && !p.mergeable) === false && pa.filter((p) => !p.mergeable).length === 2, "the decal and the live mesh are not mergeable, the parts are");
});

test("instanceStatic then mergeStatic over holders gives the reference's instanced meshes and merged batches, to the bit, and the same tree", () => {
  const k = kit();
  const a = town(k, true), b = town(k, false);
  const ia = instanceStatic(a.root, 3, 1000), ib = instanceStatic(b.root, 3, 1000);
  assert.equal(ia.length, ib.length, "the same number of instanced kinds");
  assert.ok(ia.length >= 1, "the leaf blob is instanced");
  ia.forEach((m, i) => {
    const n = ib[i]!;
    assert.equal(m.geometry, n.geometry);
    assert.equal(m.count, n.count);
    assert.deepEqual(m.instanceMatrix.array, n.instanceMatrix.array, `instanced ${i}: matrices, to the bit`);
    assert.equal(m.castShadow, n.castShadow);
    assert.equal(m.receiveShadow, n.receiveShadow);
    assert.equal(m.renderOrder, n.renderOrder);
  });
  // The tiny balls were left for the merge with their shadow flag cleared, on the parts as on the meshes.
  const balls = a.holdersMade.flatMap((h) => h.staticParts.filter((p) => p.geometry === k.ball));
  assert.ok(balls.length === 21 && balls.every((p) => p.castShadow === false), `tiny parts lose their shadow, as data: ${balls.length} balls, ${balls.filter((p) => !p.castShadow).length} without shadow, ${ia.length} instanced kinds of ${ia.map((m) => m.count).join("/")}`);
  assert.ok(a.holdersMade.every((h) => h.materialised === 0), "instancing materialised nothing");
  const ma = mergeStatic(a.root), mb = mergeStatic(b.root);
  assert.equal(ma.length, mb.length, "the same number of merged batches");
  assert.ok(ma.length >= 3, "a palette batch per shadow flag, and glass");
  ma.forEach((g, i) => sameGeometry(g, mb[i]!, `batch ${i}`));
  assert.ok(a.holdersMade.every((h) => h.materialised === 0), "merging materialised nothing");
  assert.ok(a.holdersMade.every((h) => h.staticParts.length === 0), "every part was taken");
  // The trees afterwards: the same shape (the lodge holder stays for its decal, the flower holders are swept).
  assert.equal(describe(a.root), describe(b.root));
  const la = meshes(a.root), lb = meshes(b.root);
  assert.equal(la.length, lb.length);
  la.forEach((m, i) => {
    const n = lb[i]!;
    assert.equal(m.geometry === n.geometry || (m.geometry.attributes.aSwatch !== undefined) === (n.geometry.attributes.aSwatch !== undefined), true);
    assert.equal((m.material as THREE.Material).type, (n.material as THREE.Material).type);
    assert.equal(m.castShadow, n.castShadow, `mesh ${i}: castShadow`);
    assert.deepEqual(Float64Array.from(m.matrixWorld.elements), Float64Array.from(n.matrixWorld.elements), `mesh ${i}: world matrix`);
  });
});

test("a holder whose parts are not all taken still gives its remaining parts as meshes to anyone who looks", () => {
  const k = kit();
  const h = new Holder([part(k.box, k.chalk, 0, 0, 0), part(k.box, k.timber, 1, 0, 0)]);
  const root = new THREE.Group();
  root.add(h);
  root.updateMatrixWorld(true);
  h.takeParts([h.staticParts[0]!]);
  assert.equal(h.staticParts.length, 1);
  const found = meshes(root);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.material, k.timber);
  assert.equal(h.staticParts.length, 0);
});
