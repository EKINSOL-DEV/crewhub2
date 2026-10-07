/* A building going up: when a new project appears in a town that is already standing, scaffolding rises on its plot,
   the building grows inside it and the scaffolding comes down again. Under reduced motion nothing moves: the
   scaffolding stands round a plain wrap for a moment, then both fade away from the finished building. TownScene starts
   one per new building and ticks it; the pieces are the town style's (`town.scaffolding`). */
import * as THREE from "three";
import type { ResolvedStyle, StyleTheme } from "@crewhub/world-style";
import type { Bounds } from "./townLayout";

/** Seconds: the scaffolding rises, the building grows, both stand, the scaffolding comes down. */
const RISE = 0.9,
  BUILD = 2.6,
  HOLD = 0.9,
  STRIKE = 0.8;
/** Under reduced motion: the wrapped scaffolding stands, then fades. */
const STAND = 1.8,
  FADE = 1.2;
/** How tall the scaffolding stands: a little over a building's walls and roof line. */
const HEIGHT = 2.5;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const unit = (t: number) => Math.min(1, Math.max(0, t));

export class Construction {
  /** The scaffolding (and the wrap); the scene adds it and removes it when `tick` returns false. */
  readonly group = new THREE.Group();
  readonly #building: THREE.Object3D;
  readonly #reduced: boolean;
  /** The fading copies of the scaffolding's materials (reduced motion only), disposed at the end. */
  readonly #fading: THREE.Material[] = [];
  #wrap: THREE.Mesh | null = null;
  #t = 0;
  #done = false;

  /** `footprint`: the building's ground in world units; `y`: the lawn it stands on. */
  constructor(style: ResolvedStyle, building: THREE.Object3D, footprint: Bounds, y: number, theme: StyleTheme, reducedMotion: boolean) {
    this.#building = building;
    this.#reduced = reducedMotion;
    const width = footprint.maxX - footprint.minX,
      depth = footprint.maxZ - footprint.minZ;
    const scaffold = style.model("town.scaffolding", { size: { width, height: HEIGHT, depth } });
    this.group.add(scaffold);
    this.group.position.set((footprint.minX + footprint.maxX) / 2, y, (footprint.minZ + footprint.maxZ) / 2);
    if (reducedMotion) {
      // Shared materials cannot fade for one building, so the scaffolding gets its own copies and a plain wrap hides
      // the plot until the building is shown.
      const copies = new Map<THREE.Material, THREE.Material>();
      scaffold.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
        let copy = copies.get(o.material);
        if (!copy) {
          copy = (o.material as THREE.Material).clone();
          copy.transparent = true;
          copies.set(o.material, copy);
          this.#fading.push(copy);
        }
        o.material = copy;
        o.castShadow = false;
      });
      const wrap = new THREE.MeshStandardMaterial({ color: style.color("cream", theme), roughness: 0.9, transparent: true });
      this.#fading.push(wrap);
      // Lower and narrower than the scaffolding, so the poles and decks stand clear round it.
      this.#wrap = new THREE.Mesh(new THREE.BoxGeometry(width - 1.8, HEIGHT * 0.62, depth - 1.8), wrap);
      this.#wrap.position.y = (HEIGHT * 0.62) / 2;
      this.group.add(this.#wrap);
      building.visible = false;
    } else {
      this.group.scale.y = 0.001;
      building.visible = false;
    }
  }

  /** Advances by `seconds`; false once the building stands on its own and the scaffolding can be removed. */
  tick(seconds: number): boolean {
    if (this.#done) return false;
    this.#t += seconds;
    const t = this.#t;
    if (this.#reduced) {
      if (t < STAND) return true;
      this.#building.visible = true;
      const left = 1 - unit((t - STAND) / FADE);
      for (const material of this.#fading) material.opacity = left;
      if (left > 0) return true;
      return this.finish();
    }
    if (t < RISE) {
      this.group.scale.y = Math.max(0.001, easeOut(t / RISE));
      return true;
    }
    this.group.scale.y = 1;
    this.#building.visible = true;
    const built = unit((t - RISE) / BUILD);
    this.#building.scale.y = Math.max(0.02, easeInOut(built));
    if (t < RISE + BUILD + HOLD) return true;
    const left = 1 - unit((t - RISE - BUILD - HOLD) / STRIKE);
    this.group.scale.y = Math.max(0.001, easeOut(left));
    if (left > 0) return true;
    return this.finish();
  }

  /** Ends at once (the building is entered or removed): the building stands whole, the scaffolding is gone. */
  finish(): false {
    this.#done = true;
    this.#building.visible = true;
    this.#building.scale.y = 1;
    this.group.removeFromParent();
    for (const material of this.#fading) material.dispose();
    this.#wrap?.geometry.dispose();
    return false;
  }
}
