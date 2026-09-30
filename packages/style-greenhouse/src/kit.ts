/* The Greenhouse kit: shared geometry and materials by swatch name, re-coloured in place on a theme change so every
   model built from them follows the lamplight variant. Colours live only in `style.json`. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { PaletteName, StyleTheme } from "@crewhub/world-style";

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
}

export class Kit {
  readonly data: GreenhouseManifestData;
  theme: StyleTheme = "day";
  readonly geometries = new Map<string, THREE.BufferGeometry>();
  readonly #materials = new Map<string, Entry>();

  constructor(data: GreenhouseManifestData) {
    this.data = data;
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
      if (glow) {
        material.emissive.set(this.hex(glow));
        material.emissiveIntensity = typeof options.glow === "number" ? options.glow : 0.35;
      }
      if (options.transparent !== undefined) {
        material.transparent = true;
        material.opacity = options.transparent;
        material.depthWrite = false;
      }
      entry = { material, color: name, emissive: glow };
      this.#materials.set(key, entry);
    }
    return entry.material;
  }

  setTheme(theme: StyleTheme) {
    this.theme = theme;
    for (const entry of this.#materials.values()) {
      entry.material.color.set(this.hex(entry.color));
      if (entry.emissive) entry.material.emissive.set(this.hex(entry.emissive));
    }
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
    return this.mesh(
      this.geometry(`box:${w},${h},${d},${radius}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3))),
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
    this.geometries.clear();
    this.#materials.clear();
  }
}

export function put<T extends THREE.Object3D>(parent: THREE.Object3D, object: T, x: number, y: number, z: number): T {
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}
