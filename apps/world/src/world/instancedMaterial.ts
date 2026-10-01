/* The material an instanced mesh draws with: a twin of the style's shared material, not the material itself.

   Three keeps one program choice per material. When a material is drawn by plain meshes and by instanced meshes (or by
   instanced meshes with and without instance colours) in the same frame, every switch between them makes three look
   the program up again (getParameters, the program cache key), and draws of one material sit next to each other in
   the render list, sorted by depth, so the switches come by the dozen each frame. A twin per source and mode keeps each
   material on one program.

   The twin is a live view of its source: it shares the colour objects and the shader uniforms, and reads the numbers
   that themes and the day-night drift change (emissive strength, opacity, visibility, version) from the source, so the
   style's theme changes reach it with no per-frame work. Programs are shared with the source's (the same shader and
   cache key), so twins compile nothing new. */
import * as THREE from "three";

const twins = new WeakMap<THREE.Material, Map<string, THREE.Material>>();

/** Numbers a style changes in place on its shared materials; the twin reads them from the source. */
const LIVE = ["emissiveIntensity", "opacity", "visible", "version", "alphaTest"] as const;

/** The twin of `source` for instanced meshes, with (`colours`) or without instance colours. */
export function instancedMaterial(source: THREE.Material, colours: boolean): THREE.Material {
  let byMode = twins.get(source);
  if (!byMode) {
    byMode = new Map();
    twins.set(source, byMode);
  }
  const mode = colours ? "colours" : "plain";
  let twin = byMode.get(mode);
  if (!twin) {
    twin = twinOf(source);
    byMode.set(mode, twin);
  }
  return twin;
}

function twinOf(source: THREE.Material): THREE.Material {
  const twin = source.clone();
  // Material.copy leaves out a material's own shader hooks; the twin compiles the same shader as its source.
  twin.onBeforeCompile = source.onBeforeCompile;
  twin.customProgramCacheKey = source.customProgramCacheKey;
  const shared = source as THREE.Material & Partial<Record<"color" | "emissive", THREE.Color>> & { uniforms?: Record<string, THREE.IUniform> };
  const target = twin as typeof shared;
  if (shared.color) target.color = shared.color;
  if (shared.emissive) target.emissive = shared.emissive;
  if (shared.uniforms) target.uniforms = shared.uniforms;
  for (const key of LIVE) {
    if (!(key in source)) continue;
    Object.defineProperty(twin, key, {
      get: () => (source as unknown as Record<string, unknown>)[key],
      // Writes go to the source: a style re-colouring "its" material through an instanced mesh still reaches both.
      set: (value: unknown) => ((source as unknown as Record<string, unknown>)[key] = value),
      configurable: true,
    });
  }
  return twin;
}
