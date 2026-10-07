/**
 * The three halls of a building (the spec addendum "three rooms per building"): Administration, the floor and the
 * lead's office. The model keeps its ten `RoomKind`s; this file is the mapping, as data, from a model room to the hall
 * that hosts it, and the words each wording uses for a place. `classic` is the old building's words (one room per
 * kind); `three-rooms` speaks in halls, racks and desks. Pure data and string functions.
 */
import { roomLabel } from "./rooms.ts";
import type { RoleId, RoomKind, TransitPlace } from "./model.ts";

export type Hall = "administration" | "floor" | "office";

/** How the text view, the agent card and the room summaries name places. The classic wording is the default. */
export type RoomWording = "three-rooms" | "classic";

export interface WordingOptions {
  rooms?: RoomWording;
}

/** The halls in building order: the way in first. */
export const HALLS: readonly Hall[] = ["administration", "floor", "office"];

/** The hall that hosts each model room. */
export const HALL_OF: Record<RoomKind, Hall> = {
  storage: "administration",
  planning: "administration",
  review: "administration",
  dispatch: "administration",
  lobby: "administration",
  workers: "floor",
  analyst: "floor",
  design: "floor",
  meeting: "floor",
  "lead-office": "office",
};

export function hallOf(kind: RoomKind): Hall {
  return HALL_OF[kind];
}

/** The hall's sign. */
export const HALL_LABELS: Record<Hall, string> = {
  administration: "Administration",
  floor: "The floor",
  office: "Lead's office",
};

/** The hall's own model kind: the template room that stands for the hall carries this kind. */
export const HALL_KINDS: Record<Hall, RoomKind> = { administration: "lobby", floor: "workers", office: "lead-office" };

/** The hall as a place in a sentence: "in Administration", "on the floor", "in the lead's office". */
export const HALL_PLACES: Record<Hall, string> = {
  administration: "in Administration",
  floor: "on the floor",
  office: "in the lead's office",
};

export type RackKind = "storage" | "planning" | "review" | "dispatch";
export const RACK_KINDS: readonly RackKind[] = ["storage", "planning", "review", "dispatch"];

/** The racks on Administration's north wall, by the status room each one replaces. */
export const RACK_NAMES: Record<RackKind, string> = {
  storage: "Backlog",
  planning: "Planning",
  review: "Review",
  dispatch: "Done",
};

export const isRackKind = (kind: RoomKind): kind is RackKind => kind in RACK_NAMES;

/** "the Review rack", or null for a room that is not a rack. */
export function rackWords(kind: RoomKind): string | null {
  return isRackKind(kind) ? `the ${RACK_NAMES[kind]} rack` : null;
}

/** The desk a role sits at on the floor: the desk shows the role, not a room. */
export const DESK_WORDS: Record<RoleId, string> = {
  lead: "the lead's desk",
  worker: "a worker desk",
  analyst: "an analyst desk",
  design: "a design desk",
};

/** The role room's desks, for an empty role room: "the analyst desk empty". */
export const ROLE_DESK_WORDS: Record<"workers" | "analyst" | "design", string> = {
  workers: "the worker desk",
  analyst: "the analyst desk",
  design: "the design desk",
};

/**
 * A place in a sentence, after "to" or "from": classic says "the planning room", "the lobby", "Storage"; three-rooms
 * says "the Planning rack", "Administration", "the floor", "the huddle table", "the lead's office". The truck is the
 * truck in both.
 */
export function placeWords(place: TransitPlace, rooms: RoomWording = "classic"): string {
  if (place === "truck") return "the truck";
  if (rooms === "classic") {
    const label = roomLabel(place);
    // "the planning room", "the lead's office"; Storage, Dispatch and the Lobby are names.
    if (!/room$|office$/.test(label)) return place === "lobby" ? "the lobby" : label;
    return `the ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  }
  const rack = rackWords(place);
  if (rack) return rack;
  if (place === "meeting") return "the huddle table";
  if (place === "lobby") return "Administration";
  return place === "lead-office" ? "the lead's office" : "the floor";
}

/**
 * Where a model room is, as "in the …" words: classic "in the workers room"; three-rooms "on the floor", "in
 * Administration", "in the lead's office".
 */
export function roomPlaceWords(kind: RoomKind, rooms: RoomWording = "classic"): string {
  if (rooms === "classic") return `in the ${roomLabel(kind).toLowerCase()}`;
  return HALL_PLACES[hallOf(kind)];
}

/** The sign over a model room's place: classic its label; three-rooms its hall's. */
export function roomSign(kind: RoomKind, rooms: RoomWording = "classic"): string {
  return rooms === "classic" ? roomLabel(kind) : HALL_LABELS[hallOf(kind)];
}

/** Two model rooms share a sign when they are the same room (classic) or in the same hall (three-rooms). */
export function sameSign(a: RoomKind, b: RoomKind, rooms: RoomWording = "classic"): boolean {
  return rooms === "classic" ? a === b : hallOf(a) === hallOf(b);
}
