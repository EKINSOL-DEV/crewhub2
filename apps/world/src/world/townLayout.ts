/* The town's plot grid and the words the town labels use. Pure: no Three.js, no DOM, so it runs under `node --test`.
   World units: x east, z south (towards the home camera); the civic row (post office, town hall) sits behind the
   building rows. */
import type { Freshness, LaneStatus, TicketStatus } from "@crewhub/world-model";

export const TOWN_COLUMNS = 4;
export const TOWN_ROWS = 3;
/** Room for 12 buildings; plots past this are not drawn (the text view still lists every building). */
export const TOWN_CAPACITY = TOWN_COLUMNS * TOWN_ROWS;
/** Side of a square plot and the street between plots, in world units. */
export const PLOT_SIZE = 15;
export const STREET = 2.5;
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

/** The civic row behind the building rows: post office on the left, town hall on the right. */
export function civicCenter(place: "post-office" | "town-hall"): PlotSpot {
  const z = plotCenter(0).z - PITCH;
  return { x: place === "post-office" ? -PITCH : PITCH, z };
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The whole town ground: every plot, the civic row and a street around it. */
export function townBounds(): Bounds {
  const half = PLOT_SIZE / 2 + STREET;
  const first = plotCenter(0),
    last = plotCenter(TOWN_CAPACITY - 1);
  return { minX: first.x - half, maxX: last.x + half, minZ: civicCenter("town-hall").z - half, maxZ: last.z + half };
}

/** What the home camera frames: the civic row and the building rows that are in use (at least one). */
export function usedBounds(buildingCount: number): Bounds {
  const rows = Math.max(1, Math.min(TOWN_ROWS, Math.ceil(buildingCount / TOWN_COLUMNS)));
  const half = PLOT_SIZE / 2 + STREET / 2;
  const all = townBounds();
  return { minX: all.minX + STREET / 2, maxX: all.maxX - STREET / 2, minZ: civicCenter("town-hall").z - half, maxZ: plotCenter((rows - 1) * TOWN_COLUMNS).z + half };
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
