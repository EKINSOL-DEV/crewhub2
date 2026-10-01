/* Static instancing: the town dressing repeats the same few parts hundreds of times (a lantern's post, a tree's leaf
   blob, a fence post), and the style builds them from shared geometry and materials. Meshes under `root` that share
   both become one InstancedMesh, so each kind of part is one draw call however many trees the town has; kinds with
   few triangles in all are left for mergeStatic, which bakes them into their material's one merged mesh.
   Style-agnostic, like mergeStatic: it works on whatever the style returned. Run mergeStatic afterwards for the
   one-off pieces it leaves (paving and lawns of one size each). */
import * as THREE from "three";
import { removeBaked } from "./mergeStatic.ts";
import { useInstancedMaterials } from "./instancedMaterial.ts";

/** World radius under which an instanced part casts no shadow. */
const TINY = 0.09;

const triangles = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position!.count) / 3;
/** What mergeStatic can bake: plain geometry (no attributes of a style's own, such as decals'), not live. */
const mergeable = (mesh: THREE.Mesh) => !mesh.userData.live && !mesh.userData.room && Object.keys(mesh.geometry.attributes).every((name) => name === "position" || name === "normal" || name === "uv");

/** Replaces repeated static meshes under `root` with instanced meshes; returns them (to dispose). */
export function instanceStatic(root: THREE.Group, minimum = 3, budget = 2000): THREE.InstancedMesh[] {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material)) return;
    const key = `${o.geometry.uuid}|${o.material.uuid}`;
    const list = groups.get(key);
    if (list) list.push(o);
    else groups.set(key, [o]);
  });
  const created: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4();
  for (const meshes of groups.values()) {
    if (meshes.length < minimum) continue;
    const first = meshes[0]!;
    // A kind with few triangles in all (a handful of signposts, a row of fence posts) costs a draw call of its own as an
    // instanced mesh; left as meshes, mergeStatic folds it into its material's merged mesh instead.
    if (meshes.length * triangles(first.geometry) < budget && mergeable(first)) {
      if (!first.geometry.boundingSphere) first.geometry.computeBoundingSphere();
      for (const mesh of meshes) if ((first.geometry.boundingSphere?.radius ?? 1) * mesh.matrixWorld.getMaxScaleOnAxis() < TINY) mesh.castShadow = false;
      continue;
    }
    const instanced = new THREE.InstancedMesh(first.geometry, first.material as THREE.Material, meshes.length);
    meshes.forEach((mesh, i) => instanced.setMatrixAt(i, matrix.multiplyMatrices(inverse, mesh.matrixWorld)));
    removeBaked(root, meshes);
    instanced.instanceMatrix.needsUpdate = true;
    // Tiny parts (flower heads, berries, pebbles) cast no shadow: the shadow pass skips them.
    if (!first.geometry.boundingSphere) first.geometry.computeBoundingSphere();
    const scale = Math.max(...meshes.map((m) => m.matrixWorld.getMaxScaleOnAxis()));
    instanced.castShadow = first.castShadow && (first.geometry.boundingSphere?.radius ?? 1) * scale >= TINY;
    instanced.receiveShadow = first.receiveShadow;
    instanced.renderOrder = first.renderOrder;
    instanced.computeBoundingSphere();
    // Its own twin of the material, so the material is never drawn both instanced and not (instancedMaterial.ts).
    useInstancedMaterials(instanced);
    root.add(instanced);
    created.push(instanced);
  }
  return created;
}

/**
 * Culls instanced dressing by area: the instances are sorted into square cells on the ground, and when the view
 * changes only the instances in cells the camera can see are drawn (each mesh's instance list is compacted, so a
 * close camera draws a corner of the town, not all of it). Cell boxes are padded so pieces just off screen still cast
 * their shadows into view. Works on world-space instanced meshes under an unmoving root.
 */
export class InstanceCuller {
  readonly #meshes: { mesh: THREE.InstancedMesh; all: Float32Array; byCell: Map<number, number[]> }[] = [];
  readonly #cells = new Map<number, THREE.Box3>();
  readonly #frustum = new THREE.Frustum();
  readonly #view = new THREE.Matrix4();
  readonly #last = new THREE.Matrix4();
  #visible = new Set<number>();

  constructor(meshes: readonly THREE.InstancedMesh[], cell = 12, pad = 4) {
    const matrix = new THREE.Matrix4(),
      sphere = new THREE.Sphere(),
      box = new THREE.Box3();
    for (const mesh of meshes) {
      mesh.updateMatrixWorld(true);
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const byCell = new Map<number, number[]>();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(matrix.premultiply(mesh.matrixWorld));
        const key = Math.floor(sphere.center.x / cell) * 4096 + Math.floor(sphere.center.z / cell);
        const list = byCell.get(key);
        if (list) list.push(i);
        else byCell.set(key, [i]);
        sphere.getBoundingBox(box).expandByScalar(pad);
        const bounds = this.#cells.get(key);
        if (bounds) bounds.union(box);
        else this.#cells.set(key, box.clone());
      }
      this.#meshes.push({ mesh, all: (mesh.instanceMatrix.array as Float32Array).slice(), byCell });
    }
    this.#visible = new Set(this.#cells.keys());
  }

  /** Re-culls when the camera moved; true when the drawn set changed (the shadow map then needs a redraw). */
  update(camera: THREE.Camera): boolean {
    this.#view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (this.#view.equals(this.#last)) return false;
    this.#last.copy(this.#view);
    this.#frustum.setFromProjectionMatrix(this.#view);
    const visible = new Set<number>();
    for (const [key, box] of this.#cells) if (this.#frustum.intersectsBox(box)) visible.add(key);
    if (visible.size === this.#visible.size && [...visible].every((key) => this.#visible.has(key))) return false;
    this.#visible = visible;
    for (const { mesh, all, byCell } of this.#meshes) {
      const array = mesh.instanceMatrix.array as Float32Array;
      let n = 0;
      for (const [key, list] of byCell) {
        if (!visible.has(key)) continue;
        for (const i of list) array.set(all.subarray(i * 16, i * 16 + 16), n++ * 16);
      }
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    return true;
  }
}
