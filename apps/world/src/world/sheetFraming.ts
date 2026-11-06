/* Framing beside the open build sheet (round 65 w6-15, round 66 w6-13): the numbers and the decisions, without the
   camera. TownScene keeps the calls, the controls and the tween; this module has no Vite, DOM or three.js in it, so a
   node test reaches every line (round 71, seam 4 of round 70's table). */
import type { Bounds } from "./townLayout.ts";

/** The HTML chrome over the canvas, in CSS pixels: framing keeps its subject in the free area between the edges. */
export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/* The build sheet's right edge and a gap (world.css `.build-sheet`: 1rem from the left, 20rem wide). Up to 600 px it lies
   along the bottom instead and frames nothing. Round 65, w6-15. */
export const SHEET_RIGHT = 348;
export const SHEET_BESIDE_MIN_WIDTH = 600;
/* Signs and district cards are centred on their anchors, so they hang past the town's edge towards the sheet. The room
   kept for them grows with the window: a narrow one has none to give and spends it on the town. */
export const SHEET_SIGN_ROOM = 60;
/* A person's zoom-out limit, and a frame's beside the open sheet, which may need less: the whole town in a narrow free area. */
export const MIN_ZOOM = 0.6;
export const SHEET_MIN_ZOOM = 0.25;

/** As three's MathUtils.clamp: `min` wins over `max`, so a floor above the ceiling gives the floor. */
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** A portrait frame lets the town run under the side controls; the open sheet beside it is no side control and stays. */
export const portraitInsets = (insets: Insets): Insets => ({ ...insets, left: insets.left >= SHEET_RIGHT ? insets.left : 0, right: 0 });

/** The left inset: beside the open sheet (from 601 px wide) its edge and some room for the signs, else the chrome's. */
export function sheetLeftInset(width: number, sheetOpen: boolean | undefined, chromeLeft: number): number {
  const beside = sheetOpen && width > SHEET_BESIDE_MIN_WIDTH;
  return beside ? SHEET_RIGHT + Math.min(SHEET_SIGN_ROOM, (width - SHEET_BESIDE_MIN_WIDTH) / 5) : chromeLeft;
}

/**
 * A frame's zoom. Beside the open sheet it may go below a person's limit, and they may then zoom out as far as the
 * frame: `limit` is what the controls may let a person zoom out to.
 */
export function framedZoom(zoom: number, sheetOpen: boolean | undefined, maxZoom: number): { zoom: number; limit: number } {
  const framed = clamp(zoom, sheetOpen ? SHEET_MIN_ZOOM : MIN_ZOOM, maxZoom);
  return { zoom: framed, limit: Math.min(MIN_ZOOM, framed) };
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The sheet closed on a camera a person moved: past a person's limits (a target off the ground, a zoom under their
 * limit) it eases back inside them, and stays otherwise (null: nothing to move).
 */
export function insideLimits(from: Point3, zoom: number, ground: Bounds): { target: Point3; zoom: number } | null {
  const target = { x: clamp(from.x, ground.minX, ground.maxX), y: from.y, z: clamp(from.z, ground.minZ, ground.maxZ) };
  const inside = Math.max(MIN_ZOOM, zoom);
  if (target.x === from.x && target.y === from.y && target.z === from.z && inside === zoom) return null;
  return { target, zoom: inside };
}

/** How far past the ground the pan clamp lets the target lie beside the sheet: what the sheet shifts the frame's centre by, in world units. */
export function sheetOverhang(span: number, zoom: number, height: number): number {
  return ((span / zoom) * SHEET_RIGHT) / 2 / Math.max(1, height);
}

/** What a sheet change or a resize asks of the camera; null is nothing. */
export type FrameAction = "intoLimits" | "frameBuilding" | "frameOutside" | null;

/**
 * The sheet opened or closed. A camera a person or a jump placed is left alone when it opens and eased back inside a
 * person's limits when it closes; a camera on a frame is framed again, beside the sheet or without it.
 */
export function sheetChange(previousOpen: boolean | undefined, open: boolean | undefined, placed: boolean, entered: string | null): FrameAction {
  if (!previousOpen === !open) return null;
  if (placed) return open ? null : "intoLimits";
  return entered ? "frameBuilding" : "frameOutside";
}

/** The canvas changed size. Beside an open sheet the frame is the free area's, so it is framed again, unless the camera is placed, walking or following. */
export function resizeAction(sheetOpen: boolean | undefined, placed: boolean, walking: boolean, following: boolean, entered: string | null): FrameAction {
  if (!sheetOpen || placed || walking || following) return null;
  return entered ? "frameBuilding" : "frameOutside";
}
