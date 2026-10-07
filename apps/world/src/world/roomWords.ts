/* The words of a room in the app, in either wording: `classic` is `interiorLayout`'s room names and summaries as they
   were; `three-rooms` names the hall a model room is in (Administration, The floor, Lead's office) and sums the hall
   up the way the text view does (`hallSummary` of the world model). Pure: no React, no Three.js. */
import { HALL_LABELS, hallOf, hallSummary, sameSign, type AgentPlacement, type Building, type RoomKind, type RoomWording } from "@crewhub/world-model";
import { roomName as classicName, roomSummary as classicSummary, shortRoomName as classicShort } from "./interiorLayout.ts";

export type { RoomWording };

/** The sign over the place a model room is: its own name, or its hall's. */
export function roomName(building: Building, kind: RoomKind, rooms: RoomWording = "classic"): string {
  return rooms === "classic" ? classicName(building, kind) : HALL_LABELS[hallOf(kind)];
}

/** One word for the crowded phone layout: "Admin", "Floor", "Lead" in halls. */
const HALL_SHORT = { administration: "Admin", floor: "Floor", office: "Lead" } as const;
export function shortRoomName(kind: RoomKind, rooms: RoomWording = "classic"): string {
  return rooms === "classic" ? classicShort(kind) : HALL_SHORT[hallOf(kind)];
}

/** One line for the polite status line when a room (or a hall) gets the keyboard focus. */
export function roomSummary(building: Building, kind: RoomKind, laneWords: (agent: AgentPlacement) => string, rooms: RoomWording = "classic"): string {
  if (rooms === "classic") return classicSummary(building, kind, laneWords);
  return `${hallSummary(building, hallOf(kind), laneWords)}.`;
}

/** Whether a label in room `a` shows when room `b` is revealed: the same room, or the same hall in three-rooms. */
export const sameRoom = (a: RoomKind, b: RoomKind, rooms: RoomWording = "classic"): boolean => sameSign(a, b, rooms);

/** What an empty role room's dimming means for a sign: a classic sign dims with its room; a hall never dims. */
export function signState(building: Building, kind: RoomKind, rooms: RoomWording = "classic"): { dimmed: boolean; note: string | null } {
  if (rooms !== "classic") return { dimmed: false, note: null };
  const room = building.rooms.find((r) => r.kind === kind);
  return room && !room.present ? { dimmed: true, note: room.emptyLabel } : { dimmed: false, note: null };
}
