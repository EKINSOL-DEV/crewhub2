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
}

export function campusBuildings(plots: Rect[]): Building[] {
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
    // Door: middle of the edge nearest the origin (plots sit on diagonals,
    // so pick the shorter-|coordinate| axis edge toward the center).
    const door =
      Math.abs(rect.x) > Math.abs(rect.z)
        ? { x: rect.x - Math.sign(rect.x) * (rect.w / 2), z: rect.z }
        : { x: rect.x, z: rect.z - Math.sign(rect.z) * (rect.d / 2) };
    return { plotIndex, rect, desks, door };
  });
}
