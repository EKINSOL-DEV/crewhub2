/* Walk mode's visitor: the person's own figure, walked by hand over the navigation world. It is no actor of the
   simulation (it reserves no cell and no agent waits for it); it reads the same rooms, the same occupancy and the same
   doors. A position is free inside a room (no snapping to cell centres), every step is tested against the room's open
   cells with the figure's radius, and a blocked step slides along the wall. A room is left only through a door: on a
   door cell, pushing towards the door's other side crosses it in a short glide. Pure: no Three.js, no DOM, so it runs
   under `node --test`. */
import type { Location } from "@crewhub/world-engine";
import { BUILDING_CELL } from "./buildingTemplate.ts";
import { isTownRoom, parseRoomId, TOWN_CELL, type NavWorld } from "./navigation.ts";
import type { Bounds } from "./townLayout.ts";

/** World units a second: a stroll, and with Shift held. Agents walk 1.7 inside and 3.4 on the street. */
export const WALK_SPEED = 2.6;
export const HURRY_SPEED = 5.2;
/** The figure's radius on the grid, world units: it keeps this far from closed cells. */
export const VISITOR_RADIUS = 0.17;
/** How squarely a push must point at a door's other side to cross it (cosine). */
const DOOR_AIM = 0.5;

export interface VisitorState {
  room: string;
  x: number;
  z: number;
  /** Facing, as the walkers': atan2(dx, dz). */
  heading: number;
  moving: boolean;
}

interface Crossing {
  to: Location;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  t: number;
  seconds: number;
}

export class Visitor implements VisitorState {
  readonly nav: NavWorld;
  room: string;
  x = 0;
  z = 0;
  heading = 0;
  moving = false;
  #crossing: Crossing | null = null;
  #a = { x: 0, z: 0 };
  #b = { x: 0, z: 0 };

  constructor(nav: NavWorld, at: Location) {
    this.nav = nav;
    this.room = at.room;
    this.place(at);
  }

  /** Stands the visitor on a cell's centre. */
  place(at: Location): void {
    const p = this.nav.toWorld(at, this.#a);
    this.room = at.room;
    this.x = p.x;
    this.z = p.z;
    this.moving = false;
    this.#crossing = null;
  }

  /** The building the visitor is in, or null in the town. */
  get building(): string | null {
    return isTownRoom(this.room) ? null : (parseRoomId(this.room)?.slug ?? null);
  }
  /** True while it glides through a door. */
  get crossing(): boolean {
    return this.#crossing !== null;
  }
  /** The cell it stands on. */
  get location(): Location {
    return { room: this.room, cell: this.#cellAt(this.room, this.x, this.z) };
  }
  /** False when its room left the graph (its building was rebuilt or archived): place it again. */
  get valid(): boolean {
    if (!this.nav.graph.room(this.room)) return false;
    // In a door it stands between two rooms' cells: the room it steps into must still be there.
    const c = this.#crossing;
    return c ? this.nav.graph.room(c.to.room) !== undefined : this.#open(this.room, this.x, this.z, 0);
  }

  /**
   * One step: `dx`, `dz` is the wanted direction in world space (any length up to 1; longer is clamped), `seconds`
   * the frame's time. Returns true when the visitor moved.
   */
  step(dx: number, dz: number, seconds: number, hurry = false): boolean {
    const speed = hurry ? HURRY_SPEED : WALK_SPEED;
    const c = this.#crossing;
    if (c) {
      c.t = Math.min(1, c.t + seconds / c.seconds);
      this.x = c.x0 + (c.x1 - c.x0) * c.t;
      this.z = c.z0 + (c.z1 - c.z0) * c.t;
      this.moving = true;
      if (c.t >= 1) {
        this.room = c.to.room;
        this.#crossing = null;
      }
      return true;
    }
    const length = Math.hypot(dx, dz);
    if (length < 0.05 || seconds <= 0) {
      this.moving = false;
      return false;
    }
    const scale = Math.min(1, length) / length;
    dx *= scale;
    dz *= scale;
    this.heading = Math.atan2(dx, dz);
    const reach = speed * seconds;
    // Never further than a radius in one go: a long frame cannot jump a thin wall.
    let left = reach,
      moved = false;
    while (left > 1e-6) {
      const part = Math.min(left, VISITOR_RADIUS);
      left -= part;
      const sx = dx * part,
        sz = dz * part;
      if (this.#open(this.room, this.x + sx, this.z + sz)) {
        this.x += sx;
        this.z += sz;
        moved = true;
        continue;
      }
      if (this.#cross(dx, dz, speed)) {
        moved = true;
        break;
      }
      // Slide: the part of the step along the wall.
      if (sx && this.#open(this.room, this.x + sx, this.z)) {
        this.x += sx;
        moved = true;
      } else if (sz && this.#open(this.room, this.x, this.z + sz)) {
        this.z += sz;
        moved = true;
      } else break;
    }
    this.moving = moved;
    return moved;
  }

  /** On a door cell, pushing towards the other side: start the glide through it. */
  #cross(dx: number, dz: number, speed: number): boolean {
    const here = this.#cellAt(this.room, this.x, this.z);
    const length = Math.hypot(dx, dz) || 1;
    for (const door of this.nav.graph.doors()) {
      const from = door.a.room === this.room && door.a.cell.x === here.x && door.a.cell.z === here.z ? door.a : door.b.room === this.room && door.b.cell.x === here.x && door.b.cell.z === here.z ? door.b : null;
      if (!from) continue;
      const to = from === door.a ? door.b : door.a;
      const a = this.nav.toWorld(from, this.#a),
        b = this.nav.toWorld(to, this.#b);
      const gap = Math.hypot(b.x - a.x, b.z - a.z);
      if (gap < 1e-6 || ((b.x - a.x) * dx + (b.z - a.z) * dz) / (gap * length) < DOOR_AIM) continue;
      const distance = Math.hypot(b.x - this.x, b.z - this.z);
      this.#crossing = { to: { room: to.room, cell: { ...to.cell } }, x0: this.x, z0: this.z, x1: b.x, z1: b.z, t: 0, seconds: Math.max(0.05, distance / speed) };
      this.heading = Math.atan2(b.x - this.x, b.z - this.z);
      return true;
    }
    return false;
  }

  #size(room: string): number {
    return isTownRoom(room) ? TOWN_CELL : BUILDING_CELL;
  }
  #cellAt(room: string, x: number, z: number): { x: number; z: number } {
    const size = this.#size(room);
    const o = this.nav.toWorld({ room, cell: ZERO }, this.#a);
    return { x: Math.floor((x - o.x) / size + 0.5), z: Math.floor((z - o.z) / size + 0.5) };
  }
  /** True when a disc of `radius` at a world position lies on open cells of the room. */
  #open(room: string, x: number, z: number, radius = VISITOR_RADIUS): boolean {
    const state = this.nav.graph.room(room);
    if (!state) return false;
    const size = this.#size(room);
    const { width, depth } = state.layout.grid;
    const o = this.nav.toWorld({ room, cell: ZERO }, this.#a);
    const ox = o.x,
      oz = o.z;
    for (let i = 0; i < (radius ? 4 : 1); i++) {
      const cx = Math.floor((x + (i & 1 ? radius : -radius) - ox) / size + 0.5),
        cz = Math.floor((z + (i & 2 ? radius : -radius) - oz) / size + 0.5);
      if (cx < 0 || cz < 0 || cx >= width || cz >= depth || state.blocked[cz * width + cx] !== -1) return false;
    }
    return true;
  }
}
const ZERO = { x: 0, z: 0 };

/** The keys and the stick as one wanted direction on screen: x to the right, y forward (away from the camera). */
export interface WalkInput {
  x: number;
  y: number;
  hurry: boolean;
}

/** A screen direction as a world direction, for a camera that stands at `yaw` around the visitor (atan2(x, z) of camera minus target). */
export function worldDirection(input: { x: number; y: number }, yaw: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const sin = Math.sin(yaw),
    cos = Math.cos(yaw);
  // Forward is away from the camera: (-sin, -cos); right is (cos, -sin).
  out.x = -sin * input.y + cos * input.x;
  out.z = -cos * input.y - sin * input.x;
  return out;
}

/** Which of the held keys push where: W A S D and the arrow keys. */
export function keysDirection(held: ReadonlySet<string>): { x: number; y: number } {
  const on = (...keys: string[]) => (keys.some((k) => held.has(k)) ? 1 : 0);
  return { x: on("d", "arrowright") - on("a", "arrowleft"), y: on("w", "arrowup") - on("s", "arrowdown") };
}

/* ── The follow camera's framing ───────────────────────────────────────── */

/** The camera's tilt from straight down (radians): the usual one, then steeper ones it pulls in to when something stands in the way. */
export const WALK_TILTS: readonly number[] = [0.98, 0.72, 0.46, 0.27];

/**
 * True when nothing of `height` stands between a point (`y` above the ground) and a camera that looks at it from
 * `yaw` at `tilt`: the sight line climbs out over the obstacles before it reaches one.
 */
export function sightClear(x: number, y: number, z: number, yaw: number, tilt: number, obstacles: readonly Bounds[], height: number): boolean {
  if (y >= height) return true;
  // The ground run of the sight line until it is above `height`.
  const run = (height - y) * Math.tan(tilt);
  const ex = x + Math.sin(yaw) * run,
    ez = z + Math.cos(yaw) * run;
  for (const r of obstacles) if (segmentHits(x, z, ex, ez, r)) return false;
  return true;
}

/** The first of `WALK_TILTS` with a clear sight line (the steepest when none is). */
export function walkTilt(x: number, y: number, z: number, yaw: number, obstacles: readonly Bounds[], height: number): number {
  for (const tilt of WALK_TILTS) if (sightClear(x, y, z, yaw, tilt, obstacles, height)) return tilt;
  return WALK_TILTS[WALK_TILTS.length - 1]!;
}

/** A segment against a rectangle on the ground (slab test). */
function segmentHits(x0: number, z0: number, x1: number, z1: number, r: Bounds): boolean {
  let t0 = 0,
    t1 = 1;
  const dx = x1 - x0,
    dz = z1 - z0;
  for (const [p, d, min, max] of [
    [x0, dx, r.minX, r.maxX],
    [z0, dz, r.minZ, r.maxZ],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (p < min || p > max) return false;
      continue;
    }
    const a = (min - p) / d,
      b = (max - p) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    if (t0 > t1) return false;
  }
  return true;
}
