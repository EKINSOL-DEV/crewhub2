// Campus build-mode edit model (M3 T1) — pure, three.js-free. Player edits
// (placed decor + player-built pavilions) live as a small diff on top of the
// seeded CampusLayout/campusBuildings; applyEdits merges the two for render.
import type { ModelId } from "@/game/assets/manifest";
import type { Building, Desk } from "@/game/world/campus/buildings";
import { nearestEdgeDoor } from "@/game/world/campus/buildings";
import {
  CAMPUS,
  insidePlaza,
  insidePlot,
  type CampusLayout,
  type Placement,
  type Rect,
} from "@/game/world/campus/layout";

/** Decor a player can place; every id must back a real glb (checked below). */
export const PLACEABLE_KINDS = [
  "tree-default",
  "tree-oak",
  "tree-pine",
  "bush",
  "flower-red",
  "flower-yellow",
  "rock-large",
  "lantern",
  "bench",
  "hedge",
] as const satisfies readonly ModelId[];

export type PlaceableKind = (typeof PLACEABLE_KINDS)[number];

export interface PlacedItem {
  id: string;
  kind: PlaceableKind;
  x: number;
  z: number;
  rot: number;
}

export interface PlacedBuilding {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  roomId: string | null;
}

export interface CampusEdits {
  items: PlacedItem[];
  buildings: PlacedBuilding[];
  /**
   * Ids of seeded scatter/props/plots the player removed. Carried in the
   * type and persisted, but not yet applied — filtering the base layout is
   * M4 scope; for now applyEdits always returns every default untouched.
   */
  removedDefaults: string[];
}

export const EMPTY_EDITS: CampusEdits = { items: [], buildings: [], removedDefaults: [] };

/** Snap a world coordinate to the 1-unit build grid. */
export function snap(v: number): number {
  return Math.round(v);
}

function tooCloseToItem(edits: CampusEdits, x: number, z: number): boolean {
  return edits.items.some((i) => Math.hypot(i.x - x, i.z - z) < 1);
}

function insidePlacedBuilding(edits: CampusEdits, x: number, z: number, margin: number): boolean {
  return edits.buildings.some(
    (b) => Math.abs(x - b.x) < b.w / 2 + margin && Math.abs(z - b.z) < b.d / 2 + margin,
  );
}

export function canPlaceItem(edits: CampusEdits, layout: CampusLayout, x: number, z: number): boolean {
  const bound = CAMPUS.half - 1;
  if (Math.abs(x) > bound || Math.abs(z) > bound) return false;
  if (insidePlaza(x, z, 1)) return false;
  if (insidePlot(x, z, layout.plots, 1)) return false;
  if (insidePlacedBuilding(edits, x, z, 1)) return false;
  if (tooCloseToItem(edits, x, z)) return false;
  return true;
}

/** Closest point on `rect`'s footprint to (x, z) — for circle/rect overlap. */
function closestPointOnRect(rect: Rect, x: number, z: number): { x: number; z: number } {
  const hw = rect.w / 2;
  const hd = rect.d / 2;
  return {
    x: Math.min(Math.max(x, rect.x - hw), rect.x + hw),
    z: Math.min(Math.max(z, rect.z - hd), rect.z + hd),
  };
}

function overlapsCircle(rect: Rect, cx: number, cz: number, r: number): boolean {
  const p = closestPointOnRect(rect, cx, cz);
  return Math.hypot(p.x - cx, p.z - cz) < r;
}

function rectsOverlap(a: Rect, b: Rect, margin: number): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + margin;
}

export function canPlaceBuilding(edits: CampusEdits, layout: CampusLayout, rect: Rect): boolean {
  if (rect.w < 6 || rect.w > 20 || rect.d < 5 || rect.d > 16) return false;
  const bound = CAMPUS.half - 1;
  if (Math.abs(rect.x) + rect.w / 2 > bound || Math.abs(rect.z) + rect.d / 2 > bound) return false;
  if (overlapsCircle(rect, 0, 0, CAMPUS.plazaRadius + 2)) return false;
  if (layout.plots.some((p) => rectsOverlap(rect, p, 1))) return false;
  if (edits.buildings.some((b) => rectsOverlap(rect, { x: b.x, z: b.z, w: b.w, d: b.d }, 1))) return false;
  return true;
}

const MAX_DESKS = 8;

/**
 * Auto desk grid for a player-built pavilion: floor((w-2)/3.5) columns by
 * floor((d-2)/3) rows, capped at 8 and never fewer than 1. Rows on either
 * side of the center aisle face each other, same convention as campusBuildings.
 */
export function buildingDesks(b: PlacedBuilding): Desk[] {
  const cols = Math.max(1, Math.floor((b.w - 2) / 3.5));
  const rows = Math.max(1, Math.floor((b.d - 2) / 3));
  const usableW = b.w - 2;
  const usableD = b.d - 2;
  const stepX = cols > 1 ? usableW / (cols - 1) : 0;
  const stepZ = rows > 1 ? usableD / (rows - 1) : 0;
  const startX = b.x - (cols > 1 ? usableW / 2 : 0);
  const startZ = b.z - (rows > 1 ? usableD / 2 : 0);

  const desks: Desk[] = [];
  for (let r = 0; r < rows && desks.length < MAX_DESKS; r++) {
    const z = startZ + r * stepZ;
    const rot = z < b.z ? Math.PI : 0;
    for (let c = 0; c < cols && desks.length < MAX_DESKS; c++) {
      const x = startX + c * stepX;
      // No default plotIndex applies to a player-built pavilion.
      desks.push({ id: `${b.id}-desk-${desks.length}`, x, z, rot, plotIndex: -1 });
    }
  }
  return desks;
}

/**
 * Merge edits onto the seeded layout for render: placed decor joins the
 * per-kind scatter/prop placements, placed pavilions join the base
 * buildings. `layout` is threaded through for the removedDefaults filtering
 * that lands in M4; it's unused for now.
 */
export function applyEdits(
  _layout: CampusLayout,
  base: Building[],
  edits: CampusEdits,
): { placements: Partial<Record<PlaceableKind, Placement[]>>; buildings: Building[] } {
  const placements: Partial<Record<PlaceableKind, Placement[]>> = {};
  for (const item of edits.items) {
    const list = placements[item.kind] ?? [];
    // Scale 1.4 matches the seeded lantern/bench/hedge props — feels consistent.
    list.push({ x: item.x, z: item.z, rot: item.rot, scale: 1.4 });
    placements[item.kind] = list;
  }

  const placedBuildings: Building[] = edits.buildings.map((b, i) => {
    const rect: Rect = { x: b.x, z: b.z, w: b.w, d: b.d };
    return { plotIndex: base.length + i, rect, desks: buildingDesks(b), door: nearestEdgeDoor(rect) };
  });

  return { placements, buildings: [...base, ...placedBuildings] };
}
