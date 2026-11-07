/* The top of a piece of work furniture in a style: what its manifest says (`workSurfaces`), else the model's own box as
   a plain table, so a style that says nothing still gives figures a place to work. */
import * as THREE from "three";
import type { ModelKey, ResolvedStyle, WorkSurface } from "@crewhub/world-style";

const known = new WeakMap<ResolvedStyle, Map<ModelKey, WorkSurface>>();

export function workSurfaceOf(style: ResolvedStyle, key: ModelKey): WorkSurface {
  let surfaces = known.get(style);
  if (!surfaces) known.set(style, (surfaces = new Map()));
  let surface = surfaces.get(key) ?? style.manifest.workSurfaces?.[key];
  if (!surface) {
    const object = style.model(key);
    const box = new THREE.Box3().setFromObject(object);
    surface = { height: typeof object.userData.surface === "number" ? object.userData.surface : box.max.y, half: [(box.max.x - box.min.x) / 2, (box.max.z - box.min.z) / 2] };
  }
  surfaces.set(key, surface);
  return surface;
}
