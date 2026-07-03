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
  /** Walk-in point on the plot edge nearest the campus center. */
  door: { x: number; z: number };
  /**
   * Project this pavilion is linked to (M5); null when unassigned. Optional
   * so the many pre-M5 Building literals across the app (demo world, render
   * components, sim tests) keep compiling untouched — campusBuildings() and
   * applyEdits() (src/game/build/edits.ts) always populate it explicitly.
   */
  projectId?: string | null;
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

export function campusBuildings(plots: Rect[], plotProjects?: Record<number, string>): Building[] {
  return plots.map((rect, plotIndex) => {
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
}
