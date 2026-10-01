/* Static instancing: the town dressing repeats the same few parts hundreds of times (a lantern's post, a tree's leaf
   blob, a fence post), and the style builds them from shared geometry and materials. Meshes under `root` that share
   both become one InstancedMesh, so each kind of part is one draw call however many trees the town has.
   Style-agnostic, like mergeStatic: it works on whatever the style returned. Run mergeStatic afterwards for the
   one-off pieces it leaves (paving and lawns of one size each). */
import * as THREE from "three";
import { instancedMaterial } from "./instancedMaterial";
import { removeBaked } from "./mergeStatic";

/** World radius under which an instanced part casts no shadow. */
const TINY = 0.09;

/** Replaces repeated static meshes under `root` with instanced meshes; returns them (to dispose). */
export function instanceStatic(root: THREE.Group, minimum = 3): THREE.InstancedMesh[] {
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
    const instanced = new THREE.InstancedMesh(first.geometry, instancedMaterial(first.material as THREE.Material, false), meshes.length);
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
    root.add(instanced);
    created.push(instanced);
  }
  return created;
}
