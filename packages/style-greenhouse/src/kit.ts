/* The Greenhouse kit: shared geometry and materials by swatch name, re-coloured in place on a theme change so every
   model built from them follows the lamplight variant. Colours live only in `style.json`. */
import * as THREE from "three";
import type { GraphicsQuality, LightingPreset, PaletteName, StyleTheme } from "@crewhub/world-style";
import { roundedBoxGeometry } from "./roundedBox.ts";
import { cloudShadows, decalMaterial, edgeShadeMaterial } from "./shaders.ts";

/** The contact shade along a room's walls, as a share of the blob contact shadows' opacity. */
const EDGE = 1.1;

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
  /** A second swatch multiplied into the colour. */
  tint?: Swatch;
}

/** Ground decals: blob contact shadows (every quality) and warm lamp pools (lamplight, pretty only). */
type Decal = "shadow" | "pool" | "screen";

/** What of the light the shared materials follow: lamp glow, pools, contact shadows and the evening. */
export type KitLight = Pick<LightingPreset, "glow" | "pools" | "shadowOpacity" | "evening">;

export class Kit {
  readonly data: GreenhouseManifestData;
  theme: StyleTheme = "day";
  readonly geometries = new Map<string, THREE.BufferGeometry>();
  readonly #materials = new Map<string, Entry>();
  readonly #decals: Record<Decal, THREE.ShaderMaterial>;
  /** The contact shade along a room's walls (`edgeShade`). */
  readonly #edge: THREE.ShaderMaterial;
  /** The floor shader's sun shafts: shown by day, faded out in the evening and under lamplight. */
  readonly shafts = { value: 1 };
  #lighting: Record<StyleTheme, LightingPreset>;
  /** The light the shared materials show now: the theme's, or the day-night drift's. */
  #light: KitLight;
  #quality: GraphicsQuality = "pretty";
  /** Colours of the casts drawn with this kit, by `cast:<id>:<name>` (figureKit.ts): a cast's own, per theme. */
  readonly #castColors = new Map<string, { day: string; lamplight: string }>();

  constructor(data: GreenhouseManifestData, lighting: Record<StyleTheme, LightingPreset>) {
    this.data = data;
    this.#lighting = lighting;
    this.#light = { ...lighting.day };
    this.#decals = {
      shadow: decalMaterial(this.hex("contact-shadow"), lighting.day.shadowOpacity, false),
      pool: decalMaterial(this.hex("lamp-pool"), lighting.day.pools, true),
      screen: decalMaterial(this.hex("screen-glow"), 0, true),
    };
    this.#edge = edgeShadeMaterial(this.hex("contact-shadow"), lighting.day.shadowOpacity * EDGE);
    this.#applyDecals();
  }

  /**
   * The colour string of a swatch or palette name in the current theme. `soft:<name>` is that colour half-way to
   * cream: a project colour as a soft, Greenhouse-friendly tint (a lead robot's shell).
   */
  hex(name: Swatch, theme: StyleTheme = this.theme): string {
    // An unknown or missing name falls back to the neutral swatch below, never throws.
    if (name?.startsWith("soft:")) {
      const color = new THREE.Color(this.hex(name.slice("soft:".length), theme)).lerp(new THREE.Color(this.hex("cream", theme)), 0.45);
      return `#${color.getHexString()}`;
    }
    const cast = this.#castColors.get(name);
    if (cast) return cast[theme];
    if (theme === "lamplight" && name in this.data.lamplightSwatches) return this.data.lamplightSwatches[name]!;
    return this.data.swatches[name] ?? (this.data.palette as Record<string, string>)[name] ?? this.data.swatches["no-project"]!;
  }

  /**
   * The shared toon-ish material of a swatch; `glow` makes it emissive (lamps, screens). `instanced` gives the copy
   * that instanced meshes draw with: one material drawn both plain and instanced makes three look its program up
   * again at every switch.
   */
  /** A shared material per swatch; `tint` multiplies a second swatch in (an instance colour, made a material). */
  material(name: Swatch, options: { glow?: Swatch | number; transparent?: number; instanced?: boolean; tint?: Swatch } = {}): THREE.MeshStandardMaterial {
    const glow = options.glow === undefined ? null : typeof options.glow === "number" ? name : options.glow;
    const key = `${name}|${glow ?? ""}|${typeof options.glow === "number" ? options.glow : ""}|${options.transparent ?? ""}${options.instanced ? "|instanced" : ""}${options.tint ? `|tint:${options.tint}` : ""}`;
    let entry = this.#materials.get(key);
    if (!entry) {
      const material = new THREE.MeshStandardMaterial({ color: this.hex(name), roughness: glow ? 1 : 0.7, metalness: 0 });
      if (options.tint) material.color.multiply(new THREE.Color(this.hex(options.tint)));
      // Passing clouds dim the key light on it (a pattern shader that replaces this hook adds them again). The hook
      // only changes the lighting, so it is named in `userData.lightHook`: a renderer may batch the material and give
      // its copy the same hook (apps/world robotCrowd.ts).
      material.onBeforeCompile = cloudShadows;
      material.userData.lightHook = cloudShadows;
      const strength = typeof options.glow === "number" ? options.glow : 0.35;
      if (glow) {
        material.emissive.set(this.hex(glow));
        material.emissiveIntensity = strength * this.#light.glow;
      }
      if (options.transparent !== undefined) {
        material.transparent = true;
        material.opacity = options.transparent;
        material.depthWrite = false;
      }
      entry = { material, color: name, emissive: glow, glow: strength, ...(options.tint ? { tint: options.tint } : {}) };
      this.#materials.set(key, entry);
    }
    return entry.material;
  }

  /** A cast's own colours (cast.json), under names no swatch has; its materials follow the theme like any other. */
  castColors(prefix: string, colors: Record<string, { day: string; lamplight: string }>) {
    for (const [name, color] of Object.entries(colors)) this.#castColors.set(`${prefix}${name}`, color);
  }

  /** Swatch colours follow the theme; the light starts at the theme's own (the drift then shades it, `setLight`). */
  setTheme(theme: StyleTheme) {
    this.theme = theme;
    for (const entry of this.#materials.values()) {
      entry.material.color.set(this.hex(entry.color));
      if (entry.tint) entry.material.color.multiply(new THREE.Color(this.hex(entry.tint)));
      if (entry.emissive) entry.material.emissive.set(this.hex(entry.emissive));
    }
    this.setLight(this.#lighting[theme]);
  }

  /** How far into the evening the light is (0 by day, 1 with every lamp lit). */
  get evening(): number {
    return this.#light.evening;
  }

  /** Lamp glow, light pools, contact shadows and the floor's sun shafts follow the light of the time of day. */
  setLight(light: KitLight) {
    this.#light.glow = light.glow;
    this.#light.pools = light.pools;
    this.#light.shadowOpacity = light.shadowOpacity;
    this.#light.evening = light.evening;
    this.shafts.value = 1 - THREE.MathUtils.clamp(light.evening, 0, 1);
    for (const entry of this.#materials.values()) if (entry.emissive) entry.material.emissiveIntensity = entry.glow * light.glow;
    this.#applyDecals();
  }

  setQuality(quality: GraphicsQuality) {
    this.#quality = quality;
    this.#applyDecals();
  }

  #applyDecals() {
    const preset = this.#light;
    const { shadow, pool, screen } = this.#decals;
    shadow.uniforms.uColor!.value.set(this.hex("contact-shadow"));
    shadow.uniforms.uOpacity!.value = preset.shadowOpacity;
    pool.uniforms.uColor!.value.set(this.hex("lamp-pool"));
    pool.uniforms.uOpacity!.value = preset.pools;
    this.#edge.uniforms.uColor!.value.set(this.hex("contact-shadow"));
    this.#edge.uniforms.uOpacity!.value = preset.shadowOpacity * EDGE;
    // A hidden material skips its draw calls entirely: no pools by day or on Fast.
    pool.visible = preset.pools > 0.01 && this.#quality === "pretty";
    // Screens light their desks as the rooms dim: a cool glow that follows the evening, gentler than a lamp's.
    screen.uniforms.uColor!.value.set(this.hex("screen-glow"));
    screen.uniforms.uOpacity!.value = preset.pools * 1.3;
    screen.visible = pool.visible;
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

  /**
   * The soft contact shade where walls meet a floor of `width` x `depth`: a frame strip `reach` wide inside the floor's
   * edge, darkest at the wall line. Lies flat at the origin, centred on the floor.
   */
  edgeShade(width: number, depth: number, reach = 0.5): THREE.Mesh {
    const geo = this.geometry(`edge-shade:${width.toFixed(2)},${depth.toFixed(2)},${reach}`, () => {
      const w = width / 2,
        d = depth / 2,
        r = Math.min(reach, w * 0.8, d * 0.8);
      // Outer ring (uv.y 0) and inner ring (uv.y 1), four corners each, joined by four strips.
      const outer = [[-w, -d], [w, -d], [w, d], [-w, d]];
      const inner = [[-w + r, -d + r], [w - r, -d + r], [w - r, d - r], [-w + r, d - r]];
      const position: number[] = [],
        uv: number[] = [];
      for (const [x, z] of outer) position.push(x!, 0, z!), uv.push(0, 0);
      for (const [x, z] of inner) position.push(x!, 0, z!), uv.push(0, 1);
      const index: number[] = [];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        index.push(i, 4 + i, j, j, 4 + i, 4 + j);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(24).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(index);
      return g;
    });
    const mesh = new THREE.Mesh(geo, this.#edge);
    mesh.renderOrder = 1;
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
    // The bevel a thin box gets is a third of its thinnest side, whatever it asks for (a desk top, a shelf board).
    const bevel = Math.min(radius, w / 3, h / 3, d / 3);
    const segments = bevel <= 0.03 ? 1 : 2;
    return this.mesh(
      this.geometry(`box:${w},${h},${d},${radius}`, () => roundedBoxGeometry(w, h, d, segments, bevel)),
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
    this.#decals.screen.dispose();
    this.#edge.dispose();
    this.geometries.clear();
    this.#materials.clear();
  }
}

export function put<T extends THREE.Object3D>(parent: THREE.Object3D, object: T, x: number, y: number, z: number): T {
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}
