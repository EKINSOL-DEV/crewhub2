// Shared toon shading (EKI-112): v1's cel-shaded look came from
// meshToonMaterial with one 3-step gradient map. One cached DataTexture for
// the whole world — materials share it, three.js uploads it once.
import * as THREE from "three";

let cached: THREE.DataTexture | null = null;

/** The 3-step toon gradient (shadow / mid / lit) every toon material shares. */
export function toonGradientMap(): THREE.DataTexture {
  if (cached) return cached;
  const steps = [90, 170, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
