// Toon shading core (M0 T4). Same 3-step gradient trick as the old world
// (src/panels/world/lib/toon.ts) — new copy because src/game must not import
// from src/panels (it gets deleted in M4).
import * as THREE from "three";

let cached: THREE.DataTexture | null = null;

/** The shared 3-step toon gradient (shadow / mid / lit). */
export function toonGradientMap(): THREE.DataTexture {
  if (cached) return cached;
  // Gentle dark band — Two Point trees are cheerful even on their shady side.
  const steps = [132, 196, 255];
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
  // Kenney models occasionally ship a primitive with NO material assigned
  // (glTF default → white). Rendered, it's a pale ghost shell around the
  // real geometry ("boxes around the trees"). Drop those outright.
  const ghosts: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (mats.every((m) => m.name === "_defaultMat" || m.name === "__DefaultMaterial")) {
      ghosts.push(obj);
      return;
    }
    obj.castShadow = true;
    obj.receiveShadow = true;
    // The kits export UNLIT materials (KHR_materials_unlit) — their normals
    // were never rendered and several meshes ship inverted/garbage ones,
    // which a lit toon material exposes as all-shadow "dark box" canopies.
    // Recompute flat normals from scratch (idempotent on shared geometry).
    const geometry = obj.geometry as THREE.BufferGeometry;
    if (!geometry.userData.toonNormals) {
      geometry.deleteAttribute("normal");
      geometry.computeVertexNormals();
      geometry.userData.toonNormals = true;
    }
    const swap = (m: THREE.Material): THREE.Material => {
      const src = m as THREE.MeshStandardMaterial;
      const color = src.color ? src.color.clone() : new THREE.Color("#ffffff");
      if (opts.foliageHueFix) fixFoliageColor(color);
      const toon = new THREE.MeshToonMaterial({
        color,
        map: src.map ?? null,
        vertexColors: src.vertexColors ?? false,
        gradientMap: toonGradientMap(),
        // The kits were authored for unlit rendering; several meshes have
        // inverted winding (canopies rendered as dark interiors). DoubleSide
        // + three's backface normal flip lights them correctly.
        side: THREE.DoubleSide,
        // …but keep shadow casting single-faced, or everything self-shadows
        // into stripes (shadow acne).
        shadowSide: THREE.BackSide,
      });
      toon.name = m.name;
      return toon;
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(swap) : swap(obj.material);
  });
  for (const ghost of ghosts) ghost.removeFromParent();
}
