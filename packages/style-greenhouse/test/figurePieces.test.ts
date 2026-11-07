/* Round 23: a figure's parts are data on its joints until it is drawn near, drawn on its own or asked for meshes
   (@crewhub/world-cast runtime.ts, world-style's FigurePiece). Every cast, every role and the person, in every state,
   near and far, on a perch, highlighted, animated: the data read as the far crowd reads it (a joint's world matrix
   times the part's) is the old runtime's meshes, matrix for matrix and flag for flag; the meshes made on demand are
   the old runtime's tree, node for node. The old runtime (the round-23 base, verbatim) is the reference. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { applyFigurePatch, CAST_ROLES, createCast, everyState, validateFigure, validatePerson, type Cast, type CastManifest, type CastRole, type FigureHandle, type FigurePatch, type FigureSpec, type FigureState, type WorkPlace } from "@crewhub/world-cast";
import { figurePiecesOf } from "@crewhub/world-style";
import { createCast as createCastBefore } from "../../world-cast/test/fixtures/runtimeBase.ts";
import { figureKit } from "../src/figureKit.ts";
import { Kit, type GreenhouseManifestData } from "../src/kit.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = path.resolve(ROOT, "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as GreenhouseManifestData & { lighting: ConstructorParameters<typeof Kit>[1] };

/** A cast's data read from its files (no cast is imported outside the registration: the cast boundary), checked. */
const json = (id: string, file: string) => JSON.parse(readFileSync(path.join(PACKAGES, `cast-${id}`, `${file}.json`), "utf8")) as unknown;
function resolved(): { manifest: CastManifest; figure: FigureSpec; person: FigureSpec | null }[] {
  const classic = { manifest: json("classic-bots", "cast") as CastManifest, figure: json("classic-bots", "figure") as FigureSpec, person: json("classic-bots", "person") as FigureSpec };
  const overgrown = { manifest: json("overgrown-bots", "cast") as CastManifest, figure: applyFigurePatch(classic.figure, json("overgrown-bots", "figure") as FigurePatch), person: applyFigurePatch(classic.person, json("overgrown-bots", "person") as FigurePatch) };
  const potlings = { manifest: json("potlings", "cast") as CastManifest, figure: json("potlings", "figure") as FigureSpec, person: json("potlings", "person") as FigureSpec };
  const sprouts = { manifest: json("sprouts", "cast") as CastManifest, figure: json("sprouts", "figure") as FigureSpec, person: json("sprouts", "person") as FigureSpec };
  const casts = [classic, overgrown, potlings, sprouts];
  for (const c of casts) {
    assert.equal(validateFigure(c.figure).ok, true, c.manifest.id);
    assert.equal(validatePerson(c.person).ok, true, c.manifest.id);
  }
  // The sprouts' postman drift (code the cast brings) is left out: it moves joints, the same code in either runtime.
  return casts;
}

const desk: WorkPlace = { pose: "desk", scale: 0.62, height: 0.74, edge: 0.35, focus: [-0.2, 0.9, 0.9], screen: [0, -1], spot: (radius) => (radius <= 0.25 ? { x: 0.1, z: 0.6 } : null) };

interface Drawn {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  matrix: number[];
}
/** The meshes of a figure as a traverse gives them (the old runtime's parts are meshes), their world matrices current. */
function meshesOf(root: THREE.Object3D): Drawn[] {
  root.updateMatrixWorld(true);
  const out: Drawn[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) out.push({ geometry: o.geometry, material: o.material as THREE.Material, visible: shown(o, root), castShadow: o.castShadow, receiveShadow: o.receiveShadow, matrix: [...o.matrixWorld.elements] });
  });
  return out;
}
/** The pieces of a figure as the far crowd gathers them: a node's meshes, its children in order, then the parts a joint holds as data. */
function piecesOf(root: THREE.Object3D): Drawn[] {
  root.updateMatrixWorld(true);
  const out: Drawn[] = [];
  const m = new THREE.Matrix4();
  const visit = (o: THREE.Object3D) => {
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) out.push({ geometry: o.geometry, material: o.material as THREE.Material, visible: shown(o, root), castShadow: o.castShadow, receiveShadow: o.receiveShadow, matrix: [...o.matrixWorld.elements] });
    const holder = figurePiecesOf(o);
    for (const child of o.children) if (!holder || !holder.figurePieces.some((p) => p.mesh === child)) visit(child);
    if (holder) for (const p of holder.figurePieces) out.push({ geometry: p.geometry, material: p.material, visible: p.visible && shown(o, root), castShadow: p.castShadow, receiveShadow: p.receiveShadow, matrix: [...m.multiplyMatrices(o.matrixWorld, p.matrix).elements] });
  };
  visit(root);
  return out;
}
function shown(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = o; at; at = at.parent) {
    if (!at.visible) return false;
    if (at === root) break;
  }
  return true;
}
/** Two materials drawn alike: the same shared one, or two copies of one (a faded figure's own) with the same look. */
function sameMaterial(a: THREE.Material, b: THREE.Material, what: string) {
  if (a === b) return;
  assert.equal(a.type, b.type, what);
  if (!(a instanceof THREE.MeshStandardMaterial)) {
    // The kit's own per figure (the shadow blob's decal, the halo's shader): the same kind, the same uniforms.
    const uniforms = (m: THREE.Material) => JSON.stringify(Object.fromEntries(Object.entries((m as THREE.ShaderMaterial).uniforms ?? {}).map(([k, u]) => [k, (u.value as { toArray?: () => number[] })?.toArray?.() ?? u.value])));
    assert.equal(uniforms(a), uniforms(b), `${what} uniforms`);
    assert.equal(a.transparent, b.transparent, `${what} transparent`);
    assert.equal(a.opacity, b.opacity, `${what} opacity`);
    return;
  }
  const x = a as THREE.MeshStandardMaterial, y = b as THREE.MeshStandardMaterial;
  assert.equal(x.color.getHex(), y.color.getHex(), `${what} colour`);
  assert.equal(x.transparent, y.transparent, `${what} transparent`);
  assert.equal(x.opacity, y.opacity, `${what} opacity`);
  assert.equal(x.depthWrite, y.depthWrite, `${what} depthWrite`);
  assert.equal(x.emissive.getHex(), y.emissive.getHex(), `${what} emissive`);
  assert.equal(x.emissiveIntensity, y.emissiveIntensity, `${what} emissiveIntensity`);
  assert.equal(x.roughness, y.roughness, `${what} roughness`);
}
function sameDrawn(a: Drawn[], b: Drawn[], what: string) {
  assert.equal(a.length, b.length, `${what}: pieces`);
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!;
    assert.equal(x.geometry, y.geometry, `${what} piece ${i} geometry`);
    sameMaterial(x.material, y.material, `${what} piece ${i} material`);
    assert.equal(x.visible, y.visible, `${what} piece ${i} visible`);
    assert.equal(x.castShadow, y.castShadow, `${what} piece ${i} castShadow`);
    assert.equal(x.receiveShadow, y.receiveShadow, `${what} piece ${i} receiveShadow`);
    for (let k = 0; k < 16; k++) if (!Object.is(x.matrix[k], y.matrix[k])) assert.fail(`${what} piece ${i} matrix[${k}]: ${x.matrix[k]} vs ${y.matrix[k]}`);
  }
}
/** The same shared geometry, or (a perch's step, merged once per cast instance) one with the same vertices and index. */
function sameGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry, what: string) {
  if (a === b) return;
  assert.deepEqual(Object.keys(a.attributes), Object.keys(b.attributes), `${what} attributes`);
  for (const name of Object.keys(a.attributes)) assert.deepEqual([...(a.attributes[name]!.array as Float32Array)], [...(b.attributes[name]!.array as Float32Array)], `${what} ${name}`);
  assert.deepEqual(a.index ? [...a.index.array] : null, b.index ? [...b.index.array] : null, `${what} index`);
}
/** Two trees node for node: type, transform, flags, userData, and for meshes geometry and material. */
function sameTree(a: THREE.Object3D, b: THREE.Object3D, what: string) {
  assert.equal(a.type, b.type, `${what} type`);
  assert.equal(a.visible, b.visible, `${what} visible`);
  assert.equal(a.castShadow, b.castShadow, `${what} castShadow`);
  assert.equal(a.receiveShadow, b.receiveShadow, `${what} receiveShadow`);
  assert.deepEqual(a.position.toArray(), b.position.toArray(), `${what} position`);
  assert.deepEqual([...a.rotation.toArray()], [...b.rotation.toArray()], `${what} rotation`);
  assert.deepEqual(a.scale.toArray(), b.scale.toArray(), `${what} scale`);
  assert.deepEqual(a.matrix.elements, b.matrix.elements, `${what} matrix`);
  assert.deepEqual(a.userData, b.userData, `${what} userData`);
  if (a instanceof THREE.Mesh) {
    assert.ok(b instanceof THREE.Mesh);
    sameGeometry(a.geometry, b.geometry, `${what} geometry`);
    sameMaterial(a.material as THREE.Material, b.material as THREE.Material, `${what} material`);
  }
  assert.equal(a.children.length, b.children.length, `${what} children`);
  for (let i = 0; i < a.children.length; i++) sameTree(a.children[i]!, b.children[i]!, `${what}/${i}`);
}
const objects = (root: THREE.Object3D) => {
  let n = 0;
  root.traverse(() => n++);
  return n;
};
const tag = (handle: FigureHandle, key: string) =>
  handle.object.traverse((o) => {
    o.userData.agentId = key;
  });

assert.deepEqual(resolved().map((c) => c.manifest.id).sort(), ["classic-bots", "overgrown-bots", "potlings", "sprouts"]);
for (const { manifest: cast, figure, person } of resolved()) {
  const id = cast.id;
  const kit = figureKit(new Kit(manifest, manifest.lighting), cast);
  const before: Cast = createCastBefore(cast, figure, kit, undefined, person);
  const after: Cast = createCast(cast, figure, kit, undefined, person);
  const pairs: { at: string; make: (c: Cast) => FigureHandle }[] = CAST_ROLES.map((role: CastRole) => ({ at: `${id} ${role}`, make: (c) => c.figure({ key: `r23:${role}`, role, accent: role === "unknown" ? null : "coral" }) }));
  pairs.push({ at: `${id} person`, make: (c) => c.person({ key: "r23:person" }) });

  test(`${id}: far, the parts as data are the old runtime's meshes, every role and state, matrix for matrix; near and faded, the meshes are its tree`, () => {
    let states = 0;
    for (const { at, make } of pairs) {
      const o = make(before), n = make(after);
      tag(o, at);
      tag(n, at);
      o.object.scale.setScalar(0.62);
      n.object.scale.setScalar(0.62);
      o.object.position.set(1.5, 0.02, -2.25);
      n.object.position.set(1.5, 0.02, -2.25);
      o.object.rotation.y = 0.7;
      n.object.rotation.y = 0.7;
      // Fewer objects before it is drawn near: only the parts are missing (and every piece is one of them).
      const pieces = piecesOf(n.object).filter((p) => !(p instanceof THREE.Mesh));
      assert.equal(objects(o.object) - objects(n.object), pieces.length - meshesOf(n.object).length, `${at}: the parts, and only the parts, are not objects yet`);
      assert.ok(objects(o.object) > objects(n.object), `${at}: fewer objects as data`);
      // Far, every state: the data is the meshes.
      o.setDetail("far");
      n.setDetail("far");
      for (const state of everyState()) {
        o.setState(state);
        n.setState(state);
        for (const h of [o, n]) h.update(0.3);
        sameDrawn(meshesOf(o.object), piecesOf(n.object), `${at} far ${JSON.stringify(state)}`);
        states++;
      }
      // Highlights, far.
      for (const highlight of ["hover", "selected", "none"] as const) {
        o.setHighlight(highlight);
        n.setHighlight(highlight);
        sameDrawn(meshesOf(o.object), piecesOf(n.object), `${at} far ${highlight}`);
      }
      // Near: the meshes, made now, are the old tree; every state again, and the same through the crowd's eyes.
      const idle: FigureState = { activity: "idle", waiting: false, alert: false, proxy: false, carrying: false };
      o.setState(idle);
      n.setState(idle);
      o.setDetail("near");
      n.setDetail("near");
      sameTree(o.object, n.object, `${at} near`);
      for (const state of everyState()) {
        o.setState(state);
        n.setState(state);
        for (const h of [o, n]) h.update(0.3);
        sameTree(o.object, n.object, `${at} near ${JSON.stringify(state)}`);
        sameDrawn(meshesOf(o.object), piecesOf(n.object), `${at} near, as the crowd reads it ${JSON.stringify(state)}`);
      }
      // On a perch (its step a mesh in both), and off it again.
      if (at.endsWith("lead") || at.endsWith("worker")) {
        o.setPerch(desk, true);
        n.setPerch(desk, true);
        sameTree(o.object, n.object, `${at} perched`);
        o.setPerch(null, true);
        n.setPerch(null, true);
        sameTree(o.object, n.object, `${at} off the perch`);
      }
      o.setCastShadow?.(false);
      n.setCastShadow(false);
      o.dispose();
      n.dispose();
    }
    assert.ok(states >= 80 * 8, `${states} states`);
  });

  test(`${id}: a proxy or a stale figure far makes its meshes (it draws on its own); told near once, a figure keeps them; the figure never told is near`, () => {
    const faded = after.figure({ key: "r23:faded", role: "worker", accent: "coral" });
    faded.setDetail("far");
    assert.equal(meshesOf(faded.object).length, 2, "a far figure: its shadow blob and halo only");
    faded.setState({ activity: "idle", waiting: false, alert: false, proxy: true, carrying: false });
    assert.ok(meshesOf(faded.object).length > 2, "a proxy draws its own see-through parts: meshes");
    const never = after.figure({ key: "r23:never", role: "worker", accent: "coral" });
    assert.equal(meshesOf(never.object).length, 2);
    never.update(0.1);
    assert.ok(meshesOf(never.object).length > 2, "never told its detail, it is near: its first update makes the meshes");
    const once = after.figure({ key: "r23:once", role: "worker", accent: "coral" });
    once.setDetail("near");
    const n = meshesOf(once.object).length;
    once.setDetail("far");
    assert.equal(meshesOf(once.object).length, n, "the meshes stay once made (hidden by their flags far, as before)");
    for (const h of [faded, never, once]) h.dispose();
  });
}
