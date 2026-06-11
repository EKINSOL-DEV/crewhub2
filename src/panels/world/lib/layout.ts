// World layout math (EKI-62): rooms on a square-ish grid plus a lobby strip
// for unassigned sessions. Pure and deterministic — no three.js in here.
import type { Room } from "@/ipc/bindings";

/** Pseudo-room id for sessions without a room binding. */
export const LOBBY_ID = "__lobby__";

export const ROOM_SIZE = 10;
export const ROOM_GAP = 3;
export const LOBBY_DEPTH = 6;

export interface WorldZone {
  id: string;
  name: string;
  color: string | null;
  isHq: boolean;
  /** Floor center, [x, z]. */
  center: [number, number];
  /** Square footprint edge length (lobby uses width via `width`). */
  size: number;
  /** Footprint width along x (== size for rooms, wider for the lobby). */
  width: number;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WorldLayout {
  /** All zones, lobby included (always last). */
  rooms: WorldZone[];
  bounds: WorldBounds;
}

function roomOrder(a: Room, b: Room): number {
  if (a.is_hq !== b.is_hq) return a.is_hq ? -1 : 1;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name);
}

/**
 * Arrange rooms on a `cols × rows` grid centered on the origin, with a lobby
 * strip south of the grid. Returns zones + overall bounds (used for camera
 * framing and first-person clamping).
 */
export function layoutWorld(rooms: Room[]): WorldLayout {
  const sorted = [...rooms].sort(roomOrder);
  const n = sorted.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = n === 0 ? 0 : Math.ceil(n / cols);
  const pitch = ROOM_SIZE + ROOM_GAP;

  const gridW = n === 0 ? ROOM_SIZE + LOBBY_DEPTH : cols * pitch - ROOM_GAP;
  const gridD = rows === 0 ? 0 : rows * pitch - ROOM_GAP;
  const originX = -gridW / 2 + ROOM_SIZE / 2;
  const originZ = -gridD / 2 + ROOM_SIZE / 2;

  const zones: WorldZone[] = sorted.map((room, i) => ({
    id: room.id,
    name: room.name,
    color: room.color,
    isHq: room.is_hq,
    center: [originX + (i % cols) * pitch, originZ + Math.floor(i / cols) * pitch],
    size: ROOM_SIZE,
    width: ROOM_SIZE,
  }));

  const lobbyZ = gridD / 2 + ROOM_GAP + LOBBY_DEPTH / 2;
  zones.push({
    id: LOBBY_ID,
    name: "Lobby",
    color: null,
    isHq: false,
    center: [0, lobbyZ],
    size: LOBBY_DEPTH,
    width: gridW,
  });

  const margin = ROOM_GAP;
  return {
    rooms: zones,
    bounds: {
      minX: -gridW / 2 - margin,
      maxX: gridW / 2 + margin,
      minZ: -gridD / 2 - margin,
      maxZ: lobbyZ + LOBBY_DEPTH / 2 + margin,
    },
  };
}
