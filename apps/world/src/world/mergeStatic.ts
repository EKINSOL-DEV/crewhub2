/* Static batching: a building's shell and furniture never move, so their meshes are baked into one merged mesh per
   material. Style-agnostic: it works on whatever the style returned. Meshes that must stay pickable (room floors
   carry `userData.room`), moving parts (`userData.live`), instanced meshes and meshes with attributes of their own (a style's decals) are kept as
   they are. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const MERGED = ["position", "normal", "uv"];

/** Replaces the static meshes under `root` with merged meshes; returns the geometries it created (to dispose). */
export function mergeStatic(root: THREE.Group): THREE.BufferGeometry[] {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMaterial = new Map<THREE.Material, { geometries: THREE.BufferGeometry[]; shadow: boolean }>();
  const merged: THREE.Mesh[] = [];
  root.traverse((o) => {
    // Live meshes (a style's moving parts, `userData.live`) keep their own transforms.
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material) || o.userData.room || o.userData.live) return;
    if (Object.keys(o.geometry.attributes).some((name) => !MERGED.includes(name))) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld);
    const source = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!source.attributes.uv) source.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(source.attributes.position!.count * 2), 2));
    if (!source.attributes.normal) source.computeVertexNormals();
    source.applyMatrix4(matrix);
    const entry = byMaterial.get(o.material) ?? { geometries: [], shadow: false };
    entry.geometries.push(source);
    entry.shadow ||= o.castShadow;
    byMaterial.set(o.material, entry);
    merged.push(o);
  });
  removeBaked(root, merged);
  const created: THREE.BufferGeometry[] = [];
  for (const [material, { geometries, shadow }] of byMaterial) {
    const geometry = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    root.add(mesh);
    created.push(geometry);
  }
  return created;
}

/**
 * Takes baked meshes out of the tree, then the groups they leave empty (a style model's wrappers): the renderer walks
 * and updates every node each frame, and the town has thousands of them. Groups with an animation hook stay.
 */
export function removeBaked(root: THREE.Object3D, meshes: readonly THREE.Object3D[]) {
  const parents = new Set<THREE.Object3D>();
  for (const mesh of meshes) {
    if (mesh.parent) parents.add(mesh.parent);
    mesh.removeFromParent();
  }
  for (let node of parents) {
    while (node !== root && node.children.length === 0 && (node.type === "Group" || node.type === "Object3D") && !node.userData.animate && node.parent) {
      const parent: THREE.Object3D = node.parent;
      node.removeFromParent();
      node = parent;
    }
  }
}
