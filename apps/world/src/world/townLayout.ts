/* The town's plot grid and the words the town labels use. Pure: no Three.js, no DOM, so it runs under `node --test`.
   World units: x east, z south (towards the home camera); the civic row (post office, square, town hall) sits behind
   the building rows. Streets run between the plots; a green belt rings the town (townDressing.ts dresses both). */
import type { Freshness, LaneStatus, TicketStatus } from "@crewhub/world-model";

export const TOWN_COLUMNS = 4;
export const TOWN_ROWS = 3;
/** Room for 12 buildings; plots past this are not drawn (the text view still lists every building). */
export const TOWN_CAPACITY = TOWN_COLUMNS * TOWN_ROWS;
/** Side of a square plot and the street between plots, in world units. */
export const PLOT_SIZE = 24;
export const STREET = 6;
export const PITCH = PLOT_SIZE + STREET;

export interface PlotSpot {
  x: number;
  z: number;
}

/** Centre of the plot at grid `index` (row-major, in `model.buildings` order). */
export function plotCenter(index: number): PlotSpot {
  const column = index % TOWN_COLUMNS,
    row = Math.floor(index / TOWN_COLUMNS);
  return {
    x: (column - (TOWN_COLUMNS - 1) / 2) * PITCH,
    z: (row - (TOWN_ROWS - 1) / 2) * PITCH + PITCH / 2,
  };
}

/** The civic pieces in the row behind the buildings. */
export type CivicPlace = "post-office" | "town-hall" | "square" | "cafe" | "bus-stop";

/**
 * The civic row behind the building rows: the post office on the left, the town hall on the right, the square with
 * its fountain between them at the head of the main street, the café west of the square and the bus stop east of it,
 * by the street. Each spot is the centre of the piece's footprint.
 */
export function civicCenter(place: CivicPlace): PlotSpot {
  const z = plotCenter(0).z - PITCH;
  switch (place) {
    case "post-office":
      return { x: -PITCH, z };
    case "town-hall":
      return { x: PITCH, z };
    case "square":
      return { x: 0, z: z + 1 };
    case "cafe":
      return { x: -13, z: z + 3 };
    case "bus-stop":
      return { x: 13.5, z: z + 11.4 };
  }
}

/** Footprint sizes of the civic pieces that have no lot of their own (x by z, world units). */
export const CIVIC_SIZE: Record<"square" | "cafe" | "bus-stop", { width: number; depth: number }> = {
  square: { width: 10, depth: 10 },
  cafe: { width: 5, depth: 4 },
  "bus-stop": { width: 3, depth: 1.5 },
};

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Width of the green belt of trees around the town, outside the outer streets. */
export const GREEN_BELT = 6;

/** The whole town ground: every plot, the civic row, a street around it and the green belt. */
export function townBounds(): Bounds {
  const half = PLOT_SIZE / 2 + STREET + GREEN_BELT;
  const first = plotCenter(0),
    last = plotCenter(TOWN_CAPACITY - 1);
  return { minX: first.x - half, maxX: last.x + half, minZ: civicCenter("town-hall").z - half, maxZ: last.z + half };
}

/** Side of the post office's and the town hall's lawns. */
export const CIVIC_LOT = 12;

/**
 * What the home camera frames: the plots in use (at least one), the two civic lots and the square, each with `margin`
 * around it.
 * Empty plots are left out, so a small town fills the screen; the camera fits the projected corners of these rects.
 * `compact` (a portrait phone) frames tighter: each plot's building area and the civic buildings without their lawns,
 * so hedges, meadows and the tree belt may run off the screen's edges.
 */
export function homeRects(buildingCount: number, margin = 1.5, compact = false): Bounds[] {
  const square = (c: PlotSpot, half: number): Bounds => ({ minX: c.x - half, maxX: c.x + half, minZ: c.z - half, maxZ: c.z + half });
  const rects: Bounds[] = [];
  const used = Math.max(1, Math.min(TOWN_CAPACITY, buildingCount));
  const plotHalf = compact ? PLOT_SIZE / 2 - 2 : PLOT_SIZE / 2,
    civicHalf = compact ? CIVIC_LOT / 2 - 2 : CIVIC_LOT / 2,
    squareHalf = compact ? CIVIC_SIZE.square.width / 2 - 1 : CIVIC_SIZE.square.width / 2;
  for (let i = 0; i < used; i++) rects.push(square(plotCenter(i), plotHalf + margin));
  for (const place of ["post-office", "town-hall"] as const) rects.push(square(civicCenter(place), civicHalf + margin));
  rects.push(square(civicCenter("square"), squareHalf + margin));
  return rects;
}

/**
 * Keyboard focus between plots in grid order. Left and right step through the order (wrapping to the next row);
 * up and down move a whole row and stay put at an edge. Returns the current index for any other key.
 */
export function moveFocus(index: number, key: string, count: number): number {
  if (count <= 0) return 0;
  const current = Math.min(Math.max(index, 0), count - 1);
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, current - 1);
    case "ArrowRight":
      return Math.min(count - 1, current + 1);
    case "ArrowUp":
      return current - TOWN_COLUMNS >= 0 ? current - TOWN_COLUMNS : current;
    case "ArrowDown":
      return current + TOWN_COLUMNS < count ? current + TOWN_COLUMNS : current;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return current;
  }
}

const STATUS_ORDER: readonly TicketStatus[] = ["backlog", "planned", "in_progress", "review", "done"];
const STATUS_WORD: Record<TicketStatus, string> = {
  backlog: "backlog",
  planned: "planned",
  in_progress: "in progress",
  review: "review",
  done: "done",
};

/** "3 backlog, 2 planned, 4 in progress, 5 review, 12 done", in board order, zeros included. */
export function countsLine(counts: Record<TicketStatus, number>): string {
  return STATUS_ORDER.map((s) => `${counts[s]} ${STATUS_WORD[s]}`).join(", ");
}

/** "HH:MM" in the viewer's local time, or null for a missing or unreadable timestamp. */
export function clockTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The words for an agent's lane status. A stale snapshot overrides every lane: it reads "stale since HH:MM", or
 * "status unknown" before the first snapshot (agents-and-states.md: older than 5 minutes is unknown).
 */
export function laneWords(status: LaneStatus, freshness: Freshness): string {
  if (freshness.stale) {
    const since = clockTime(freshness.teamTs);
    return since ? `stale since ${since}` : "status unknown";
  }
  return status === "unknown" ? "status unknown" : status;
}

/** "mm:ss" for the playback bar; minutes are not capped at 59. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
