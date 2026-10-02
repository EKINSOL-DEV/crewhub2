/* Materials for instanced meshes. three compiles a material once with instancing and once without, and keeps one
   current program per material: a material drawn by plain meshes and by instanced ones (a style material that the town
   dressing instances in one place and draws whole in another) has its program parameters worked out again at every
   switch, a few dozen times per frame. The same goes for the shadow pass, whose one depth material switches on
   nearly every caster. So an instanced mesh gets its own twin of the style's material, and its own depth material.

   A twin follows its source: the same colour objects and uniforms, and its numbers (opacity, emissive strength, ...)
   read through to the source, so a theme change on the style's material shows on the instances too. Style-agnostic. */
import * as THREE from "three";

const twins = new WeakMap<THREE.Material, THREE.Material>();
/** Properties a style changes in place on its materials (the theme): the twin reads them from the source. */
const NUMBERS = ["opacity", "emissiveIntensity", "roughness", "metalness", "visible", "version"] as const;
const COLOURS = ["color", "emissive"] as const;

/** The twin of `source` for instanced meshes (one per source; freed with it). */
export function instancedMaterial<T extends THREE.Material>(source: T): T {
  let twin = twins.get(source);
  if (!twin) {
    const made = source.clone();
    made.onBeforeCompile = source.onBeforeCompile;
    made.customProgramCacheKey = source.customProgramCacheKey;
    made.userData = source.userData;
    const from = source as unknown as Record<string, unknown>,
      to = made as unknown as Record<string, unknown>;
    for (const key of COLOURS) if (from[key] instanceof THREE.Color) to[key] = from[key];
    if (from.uniforms) to.uniforms = from.uniforms;
    for (const key of NUMBERS)
      if (key in source) Object.defineProperty(made, key, { get: () => from[key], set: () => {}, configurable: true });
    source.addEventListener("dispose", () => {
      made.dispose();
      twins.delete(source);
    });
    twins.set(source, (twin = made));
  }
  return twin as T;
}

/** The shadow pass's depth material for instanced casters (three's own one then only ever sees plain meshes). */
export const INSTANCED_DEPTH = new THREE.MeshDepthMaterial();

/** Gives an instanced mesh the twin of its material and the instanced depth material. */
export function useInstancedMaterials(mesh: THREE.InstancedMesh) {
  if (!Array.isArray(mesh.material)) mesh.material = instancedMaterial(mesh.material);
  mesh.customDepthMaterial = INSTANCED_DEPTH;
}
