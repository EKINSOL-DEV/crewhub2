/* The Greenhouse kit: shared geometry and materials by swatch name, re-coloured in place on a theme change so every
   model built from them follows the lamplight variant. Colours live only in `style.json`. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GraphicsQuality, LightingPreset, PaletteName, StyleTheme } from "@crewhub/world-style";
import { decalMaterial } from "./shaders.ts";

export interface GreenhouseManifestData {
  palette: Record<PaletteName, string>;
  /** Style-internal colours (walls, lawn, robot parts); not part of the plugin palette. */
  swatches: Record<string, string>;
  /** Swatches that change under the lamplight theme. */
  lamplightSwatches: Record<string, string>;
}

/** A swatch or palette name. */
export type Swatch = string;

interface Entry {
  material: THREE.MeshStandardMaterial;
  color: Swatch;
  emissive: Swatch | null;
  /** The emissive strength the model asked for; the theme's `glow` scales it. */
  glow: number;
}

/** Ground decals: blob contact shadows (every quality) and warm lamp pools (lamplight, pretty only). */
type Decal = "shadow" | "pool";

export class Kit {
  readonly data: GreenhouseManifestData;
  theme: StyleTheme = "day";
  readonly geometries = new Map<string, THREE.BufferGeometry>();
  readonly #materials = new Map<string, Entry>();
  readonly #decals: Record<Decal, THREE.ShaderMaterial>;
  #lighting: Record<StyleTheme, LightingPreset>;
  #quality: GraphicsQuality = "pretty";

  constructor(data: GreenhouseManifestData, lighting: Record<StyleTheme, LightingPreset>) {
    this.data = data;
    this.#lighting = lighting;
    this.#decals = {
      shadow: decalMaterial(this.hex("contact-shadow"), lighting.day.shadowOpacity, false),
      pool: decalMaterial(this.hex("lamp-pool"), lighting.day.pools, true),
    };
    this.#applyDecals();
  }

  /** The colour string of a swatch or palette name in the current theme. */
  hex(name: Swatch, theme: StyleTheme = this.theme): string {
    if (theme === "lamplight" && name in this.data.lamplightSwatches) return this.data.lamplightSwatches[name]!;
    return this.data.swatches[name] ?? (this.data.palette as Record<string, string>)[name] ?? this.data.swatches["no-project"]!;
  }

  /** The shared toon-ish material of a swatch; `glow` makes it emissive (lamps, screens). */
  material(name: Swatch, options: { glow?: Swatch | number; transparent?: number } = {}): THREE.MeshStandardMaterial {
    const glow = options.glow === undefined ? null : typeof options.glow === "number" ? name : options.glow;
    const key = `${name}|${glow ?? ""}|${typeof options.glow === "number" ? options.glow : ""}|${options.transparent ?? ""}`;
    let entry = this.#materials.get(key);
    if (!entry) {
      const material = new THREE.MeshStandardMaterial({ color: this.hex(name), roughness: glow ? 1 : 0.7, metalness: 0 });
      const strength = typeof options.glow === "number" ? options.glow : 0.35;
      if (glow) {
        material.emissive.set(this.hex(glow));
        material.emissiveIntensity = strength * this.#lighting[this.theme].glow;
      }
      if (options.transparent !== undefined) {
        material.transparent = true;
        material.opacity = options.transparent;
        material.depthWrite = false;
      }
      entry = { material, color: name, emissive: glow, glow: strength };
      this.#materials.set(key, entry);
    }
    return entry.material;
  }

  setTheme(theme: StyleTheme) {
    this.theme = theme;
    const glow = this.#lighting[theme].glow;
    for (const entry of this.#materials.values()) {
      entry.material.color.set(this.hex(entry.color));
      if (entry.emissive) {
        entry.material.emissive.set(this.hex(entry.emissive));
        entry.material.emissiveIntensity = entry.glow * glow;
      }
    }
    this.#applyDecals();
  }

  setQuality(quality: GraphicsQuality) {
    this.#quality = quality;
    this.#applyDecals();
  }

  #applyDecals() {
    const preset = this.#lighting[this.theme];
    const { shadow, pool } = this.#decals;
    shadow.uniforms.uColor!.value.set(this.hex("contact-shadow"));
    shadow.uniforms.uOpacity!.value = preset.shadowOpacity;
    pool.uniforms.uColor!.value.set(this.hex("lamp-pool"));
    pool.uniforms.uOpacity!.value = preset.pools;
    // A hidden material skips its draw calls entirely: no pools by day or on Fast.
    pool.visible = preset.pools > 0 && this.#quality === "pretty";
  }

  /**
   * A soft ground decal: a rounded rectangle of half-size `halfX` × `halfZ` whose edge fades over `soft` world units,
   * lying flat at the origin. "shadow" is a blob contact shadow, "pool" a warm pool of lamp light.
   */
  decal(kind: Decal, halfX: number, halfZ: number, soft: number): THREE.Mesh {
    const key = `decal:${halfX.toFixed(2)},${halfZ.toFixed(2)},${soft.toFixed(2)}`;
    const geo = this.geometry(key, () => {
      const plane = new THREE.PlaneGeometry(2 * (halfX + soft), 2 * (halfZ + soft)).rotateX(-Math.PI / 2);
      const shape = new Float32Array(plane.attributes.position!.count * 3);
      for (let i = 0; i < shape.length; i += 3) shape.set([halfX, halfZ, soft], i);
      plane.setAttribute("aShape", new THREE.BufferAttribute(shape, 3));
      return plane;
    });
    const mesh = new THREE.Mesh(geo, this.#decals[kind]);
    mesh.renderOrder = kind === "shadow" ? 1 : 2;
    mesh.userData.decal = true;
    return mesh;
  }

  isShared(material: THREE.Material): boolean {
    for (const entry of this.#materials.values()) if (entry.material === material) return true;
    return false;
  }

  geometry(key: string, create: () => THREE.BufferGeometry) {
    let geo = this.geometries.get(key);
    if (!geo) {
      geo = create();
      this.geometries.set(key, geo);
    }
    return geo;
  }
  mesh(geo: THREE.BufferGeometry, material: THREE.Material) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  box(w: number, h: number, d: number, color: Swatch, radius = 0.04) {
    // A bevel of 3 cm or less reads the same with one segment; walls and trims are mostly that, at a third the triangles.
    const segments = radius <= 0.03 ? 1 : 2;
    return this.mesh(
      this.geometry(`box:${w},${h},${d},${radius}`, () => new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, w / 3, h / 3, d / 3))),
      this.material(color),
    );
  }
  sphere(r: number, color: Swatch) {
    return this.mesh(
      this.geometry(`sphere:${r}`, () => new THREE.SphereGeometry(r, 12, 10)),
      this.material(color),
    );
  }
  cylinder(top: number, bottom: number, h: number, color: Swatch) {
    return this.mesh(
      this.geometry(`cylinder:${top},${bottom},${h}`, () => new THREE.CylinderGeometry(top, bottom, h, 20)),
      this.material(color),
    );
  }
  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.#materials.forEach((e) => e.material.dispose());
    this.#decals.shadow.dispose();
    this.#decals.pool.dispose();
    this.geometries.clear();
    this.#materials.clear();
  }
}

export function put<T extends THREE.Object3D>(parent: THREE.Object3D, object: T, x: number, y: number, z: number): T {
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}
