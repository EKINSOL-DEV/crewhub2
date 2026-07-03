// Campus buildings (M1 T1) — pure layout for the four plot pavilions.
// Open structures (slab + pillars + beams, NO roof) so the fixed-pitch
// camera always sees the robots inside.
import type { Rect } from "./layout";

export interface Desk {
  id: string;
  x: number;
  z: number;
  /** Radians; the robot sits on the -facing side looking at the desk. */
  rot: number;
  plotIndex: number;
}

export interface Building {
  plotIndex: number;
  rect: Rect;
  desks: Desk[];
  /** Walk-in point on the plot edge nearest the campus center — the PRIMARY
   *  door when a building has more than one. */
  door: { x: number; z: number };
  /**
   * Every walk-in point (M6): HQ has one per wall (4); a plain pavilion has
   * just the one. Optional — nav (grid.ts) and render fall back to `[door]`
   * so every pre-M6 Building literal across the app keeps compiling.
   */
  doors?: { x: number; z: number }[];
  /** Building flavor (M6); default "room" — a project pavilion with desks.
   *  "hq" marks the one permanent, deskless headquarters at the origin. */
  kind?: "hq" | "room";
  /**
   * Project this pavilion is linked to (M5); null when unassigned. Optional
   * so the many pre-M5 Building literals across the app (demo world, render
   * components, sim tests) keep compiling untouched — campusBuildings() and
   * applyEdits() (src/game/build/edits.ts) always populate it explicitly.
   */
  projectId?: string | null;
  /**
   * Sim desk-claim eligibility key (M5 T2), annotated at the React boundary
   * from the linked project's folder — see src/game/characters/use-sim.ts.
   * Optional for the same pre-M5-literal reason as projectId; the sim
   * (src/game/sim/sim.ts) treats null/undefined as "unlinked, no claims."
   */
  groupKey?: string | null;
}

/**
 * Door: middle of the edge nearest the origin. Compute both candidate edge
 * midpoints and pick the one with the smaller distance to origin. Shared
 * with player-built pavilions (src/game/build/edits.ts) so the walk-in
 * convention stays identical for every building on campus.
 */
export function nearestEdgeDoor(rect: Rect): { x: number; z: number } {
  const xEdge = { x: rect.x - Math.sign(rect.x) * (rect.w / 2), z: rect.z };
  const zEdge = { x: rect.x, z: rect.z - Math.sign(rect.z) * (rect.d / 2) };
  return Math.hypot(xEdge.x, xEdge.z) <= Math.hypot(zEdge.x, zEdge.z) ? xEdge : zEdge;
}

/**
 * The permanent headquarters footprint (M6) — sits at the campus origin,
 * where only the fountain plaza used to stand. plotIndex -1 and no desks:
 * nobody works in HQ.
 */
export const HQ_RECT: Rect = { x: 0, z: 0, w: 18, d: 14 };

/**
 * HQ, world M6: one door per wall (a plot pavilion only ever gets one). The
 * PRIMARY `door` is the south-edge midpoint (+z) — the face toward the
 * default camera (see rts-camera.ts's DEFAULT_CAMERA: yaw=0.6 puts the lens
 * in the +X/+Z octant looking back at the origin, so +z is the side the
 * player sees first).
 */
export function hqBuilding(): Building {
  const hw = HQ_RECT.w / 2;
  const hd = HQ_RECT.d / 2;
  const south = { x: 0, z: hd };
  const doors = [south, { x: 0, z: -hd }, { x: hw, z: 0 }, { x: -hw, z: 0 }];
  return { plotIndex: -1, rect: HQ_RECT, desks: [], door: south, doors, kind: "hq" };
}

export function campusBuildings(plots: Rect[], plotProjects?: Record<number, string>): Building[] {
  const pavilions = plots.map((rect, plotIndex) => {
    // Two rows of two desks, facing each other across a center aisle.
    const dx = rect.w / 4;
    const dz = rect.d / 4.5;
    const desks: Desk[] = [
      { id: `desk-${plotIndex}-0`, x: rect.x - dx, z: rect.z - dz, rot: Math.PI, plotIndex },
      { id: `desk-${plotIndex}-1`, x: rect.x + dx, z: rect.z - dz, rot: Math.PI, plotIndex },
      { id: `desk-${plotIndex}-2`, x: rect.x - dx, z: rect.z + dz, rot: 0, plotIndex },
      { id: `desk-${plotIndex}-3`, x: rect.x + dx, z: rect.z + dz, rot: 0, plotIndex },
    ];
    const projectId = plotProjects?.[plotIndex] ?? null;
    return { plotIndex, rect, desks, door: nearestEdgeDoor(rect), projectId };
  });
  // HQ is prepended so every consumer (nav, render, sim) sees it — it's not
  // a plot, it's permanent furniture of the campus itself.
  return [hqBuilding(), ...pavilions];
}
