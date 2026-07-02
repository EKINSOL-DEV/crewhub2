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

export interface ToonifyOptions {
  /**
   * Warm up plant colors: Kenney's foliage palette leans cyan/mint, which
   * under the campus's cool hemisphere light reads teal instead of leafy.
   * Shifts any cyan-range hue toward a lusher green and feeds it a little
   * saturation. Load-time and deterministic — never per-frame.
   */
  foliageHueFix?: boolean;
}

const hsl = { h: 0, s: 0, l: 0 };

function fixFoliageColor(color: THREE.Color): void {
  color.getHSL(hsl);
  // Cyan/mint band (~135°–205°); leave real greens, browns and greys alone.
  if (hsl.h < 0.375 || hsl.h > 0.57) return;
  const t = (hsl.h - 0.375) / (0.57 - 0.375);
  color.setHSL(0.28 + t * 0.06, Math.min(1, hsl.s * 1.15 + 0.05), hsl.l * 0.96);
}

/**
 * Restyle an imported kit model in place: every mesh gets a MeshToonMaterial
 * carrying over the source color/map/vertexColors, plus shadow flags. This is
 * what makes 19 models from 2 different packs read as ONE art style.
 */
export function toonify(root: THREE.Object3D, opts: ToonifyOptions = {}): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const swap = (m: THREE.Material): THREE.Material => {
      const src = m as THREE.MeshStandardMaterial;
      const color = src.color ? src.color.clone() : new THREE.Color("#ffffff");
      if (opts.foliageHueFix) fixFoliageColor(color);
      const toon = new THREE.MeshToonMaterial({
        color,
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
