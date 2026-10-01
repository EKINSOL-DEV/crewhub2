/* A style's shared material drawn by both plain and instanced meshes makes three look its program up again every time
   it switches between the two (the program differs by instancing): hundreds of lookups a frame in the town, a third
   of a phone's frame. Instanced meshes draw with a twin instead: one per source material, its own program, linked to
   the source so it follows every theme change and the day-night drift. The twin shares the source's colour objects
   and shader uniforms, and reads its visibility, opacity, glow and version from the source. */
import * as THREE from "three";

const twins = new WeakMap<THREE.Material, THREE.Material>();
/** Read through to the source on every access (numbers and flags a theme or the drift changes in place). */
const LIVE = ["visible", "opacity", "emissiveIntensity", "version"] as const;
/** Colour objects the twin shares with the source. */
const SHARED = ["color", "emissive"] as const;

/** The twin of `source` for instanced meshes. */
export function instancedMaterial<T extends THREE.Material>(source: T): T {
  const known = twins.get(source);
  if (known) return known as T;
  const twin = source.clone() as T;
  const from = source as unknown as Record<string, unknown>,
    to = twin as unknown as Record<string, unknown>;
  for (const key of SHARED) if ((from[key] as THREE.Color | undefined)?.isColor) to[key] = from[key];
  if (from.uniforms) to.uniforms = from.uniforms;
  // Material.copy leaves a style's shader changes out.
  twin.onBeforeCompile = source.onBeforeCompile;
  twin.customProgramCacheKey = source.customProgramCacheKey;
  for (const key of LIVE) if (key in source) Object.defineProperty(twin, key, { get: () => from[key], set: () => {}, configurable: true });
  source.addEventListener("dispose", () => twin.dispose());
  twins.set(source, twin);
  return twin;
}
