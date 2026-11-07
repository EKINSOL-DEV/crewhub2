/* The scene's side of wayfinding: where each district's ground lies (the union of its buildings' plots), the anchor
   its card hangs from and the anchors of the pins over buildings that need a person. The card hangs from the corner
   of the district that is highest on the screen, so it sits above the district however the camera is turned and
   never covers a building. */
import * as THREE from "three";
import type { Bounds } from "./townLayout";

/** A district as the scene needs it: its id and the buildings that stand in it. */
export interface DistrictView {
  id: string;
  slugs: readonly string[];
}

/** Ground around a building's footprint that still reads as its plot. */
const PLOT_MARGIN = 5;
/** A pin floats a little above the roof. */
const PIN_HEIGHT = 5.2;

export class DistrictFrames {
  readonly bounds = new Map<string, Bounds>();
  #v = new THREE.Vector3();

  /** Takes the districts and each building's footprint; sets the pin anchors (`n:<slug>`) and reserves the cards' (`d:<id>`). */
  update(districts: readonly DistrictView[], footprint: (slug: string) => Bounds | null, anchors: Map<string, THREE.Vector3>) {
    this.bounds.clear();
    for (const district of districts) {
      let bounds: Bounds | null = null;
      for (const slug of district.slugs) {
        const b = footprint(slug);
        if (!b) continue;
        anchors.set(`n:${slug}`, new THREE.Vector3((b.minX + b.maxX) / 2, PIN_HEIGHT, (b.minZ + b.maxZ) / 2));
        bounds = bounds
          ? { minX: Math.min(bounds.minX, b.minX - PLOT_MARGIN), maxX: Math.max(bounds.maxX, b.maxX + PLOT_MARGIN), minZ: Math.min(bounds.minZ, b.minZ - PLOT_MARGIN), maxZ: Math.max(bounds.maxZ, b.maxZ + PLOT_MARGIN) }
          : { minX: b.minX - PLOT_MARGIN, maxX: b.maxX + PLOT_MARGIN, minZ: b.minZ - PLOT_MARGIN, maxZ: b.maxZ + PLOT_MARGIN };
      }
      if (!bounds) continue;
      this.bounds.set(district.id, bounds);
      anchors.set(`d:${district.id}`, new THREE.Vector3(bounds.minX, 0.2, bounds.minZ));
    }
  }

  /** Moves each card's anchor to the corner of its district that is highest on the screen right now. */
  place(anchors: Map<string, THREE.Vector3>, camera: THREE.Camera) {
    for (const [id, b] of this.bounds) {
      const anchor = anchors.get(`d:${id}`);
      if (!anchor) continue;
      let best = -Infinity;
      for (const x of [b.minX, b.maxX])
        for (const z of [b.minZ, b.maxZ]) {
          const y = this.#v.set(x, 0.2, z).project(camera).y;
          if (y > best) {
            best = y;
            anchor.set(x, 0.2, z);
          }
        }
    }
  }
}
