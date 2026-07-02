// Toon shading core (M0 T4). Same 3-step gradient trick as the old world
// (src/panels/world/lib/toon.ts) — new copy because src/game must not import
// from src/panels (it gets deleted in M4).
import * as THREE from "three";

let cached: THREE.DataTexture | null = null;

/** The shared 3-step toon gradient (shadow / mid / lit). */
export function toonGradientMap(): THREE.DataTexture {
  if (cached) return cached;
  const steps = [110, 190, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}

/**
 * Restyle an imported kit model in place: every mesh gets a MeshToonMaterial
 * carrying over the source color/map/vertexColors, plus shadow flags. This is
 * what makes 19 models from 2 different packs read as ONE art style.
 */
export function toonify(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const swap = (m: THREE.Material): THREE.Material => {
      const src = m as THREE.MeshStandardMaterial;
      const toon = new THREE.MeshToonMaterial({
        color: src.color ? src.color.clone() : new THREE.Color("#ffffff"),
        map: src.map ?? null,
        vertexColors: src.vertexColors ?? false,
        gradientMap: toonGradientMap(),
      });
      toon.name = m.name;
      return toon;
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(swap) : swap(obj.material);
  });
}
