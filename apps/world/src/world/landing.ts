/* A jump's landing on a town figure (round 65, w4-11), the pure part: the ground box a jump frames and, each frame
   after a landing on a portrait phone, how far the figure moved so the camera can go with it. Plain values only: no
   Three.js, no DOM, so a node test can hold it (round 71, seam 5). `TownScene` keeps the calls: it chooses when a jump
   is centred, holds the landing, and applies the delta to its camera, its target and its tween. */
import type { Bounds } from "./townLayout.ts";

/** After a jump to a figure on a portrait phone the camera keeps it where it landed for this long. */
export const JUMP_TRACK_MS = 6000;

/** A point on the ground (y plays no part). */
export interface GroundPoint {
  x: number;
  z: number;
}

/** A jump's landing on a figure: its label anchor, where it last stood, and until when the camera goes with it. */
export interface Landing {
  id: string;
  last: GroundPoint;
  until: number;
}

/**
 * The ground box a jump frames around a label's anchor. Plain, the box reaches further away from the camera than towards
 * it, so a building behind its anchor is in the frame; centred (a figure on a portrait phone), it is square on the anchor.
 */
export function jumpBox(anchor: GroundPoint, reach: number, centred: boolean): Bounds {
  return centred
    ? { minX: anchor.x - reach, maxX: anchor.x + reach, minZ: anchor.z - reach, maxZ: anchor.z + reach }
    : { minX: anchor.x - reach, maxX: anchor.x + reach, minZ: anchor.z - reach * 1.4, maxZ: anchor.z + reach * 0.6 };
}

/**
 * One frame of a landing: how far the figure moved on the ground since the frame before (the landing's `last` is moved
 * to where it stands now), or null when the landing ends: the anchor is gone, something blocks it (a walk, a follow,
 * going inside), or its time is over.
 */
export function landingStep(landing: Landing, anchor: GroundPoint | undefined, now: number, blocked: boolean): GroundPoint | null {
  if (!anchor || blocked || now > landing.until) return null;
  const delta = { x: anchor.x - landing.last.x, z: anchor.z - landing.last.z };
  landing.last = { x: anchor.x, z: anchor.z };
  return delta;
}
