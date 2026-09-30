/**
 * The ticket drone (spec addendum "the ticket drone"): a status change, an archive or an unarchive is carried by a
 * small drone inside one building. The model moves the object on the drop, not on the pickup: while a flight is in
 * the air the object keeps its old room and desk and carries `transit`. Cosmetic and deterministic: the flight time
 * comes from the ticket id, in source time, so it scales with the playback speed.
 */
import type { ReduceContext } from "./agents.ts";
import type { FlightMemory } from "./memory.ts";
import type { BuiltObject } from "./objects.ts";
import type { RoomKind, TicketStatus, TransitPlace, WorkObject } from "./model.ts";

export const FLIGHT_MIN_MS = 2_000;
export const FLIGHT_MAX_MS = 4_000;
/** An unarchive whose card never comes back is forgotten after this. */
const UNARCHIVE_WAIT_MS = 60_000;

/** 2 to 4 s of source time, the same for the same ticket. */
export function flightMs(ticketId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < ticketId.length; i++) hash = Math.imul(hash ^ ticketId.charCodeAt(i), 16777619);
  return FLIGHT_MIN_MS + ((hash >>> 0) % (FLIGHT_MAX_MS - FLIGHT_MIN_MS + 1));
}

const STATUS_ROOM: Record<TicketStatus, RoomKind> = {
  backlog: "storage",
  planned: "planning",
  in_progress: "lead-office",
  review: "review",
  done: "dispatch",
};

/** Once per reduction, before the buildings: a new snapshot (a seek, a new loop) grounds every drone. */
export function startFlights(ctx: ReduceContext): void {
  const { memory, facts } = ctx;
  if (memory.snapshots === facts.snapshots) return;
  memory.snapshots = facts.snapshots;
  memory.flights = {};
  memory.movesSeen = {};
  memory.unarchivePending = {};
  memory.archiveSeen = Math.max(0, ...facts.archives.map((a) => a.seq));
  memory.unarchiveSeen = Math.max(0, ...facts.unarchives.map((a) => a.seq));
}

/**
 * Applies the flights of one building to its built objects (mutating them) and returns the packages on their way to
 * the truck, which are no longer on the board. `rebuild` turns an archived card back into an object.
 */
export function flyObjects(
  slug: string,
  built: BuiltObject[],
  rebuild: (card: NonNullable<FlightMemory["card"]>) => BuiltObject,
  ctx: ReduceContext,
): BuiltObject[] {
  const { memory, facts, now } = ctx;
  for (const u of facts.unarchives) {
    if (u.seq > memory.unarchiveSeen && (u.slug === slug || u.slug === null)) memory.unarchivePending[u.ticketId] = u.ts;
  }

  for (const { object } of built) {
    const id = object.ticketId;
    const natural = { room: object.room, deskOf: object.deskOf, deskInferred: object.deskInferred };
    let flight = memory.flights[id];
    const move = facts.lastMoves[id];
    if (move && move.from !== move.to && move.seq > (memory.movesSeen[id] ?? 0)) {
      memory.movesSeen[id] = move.seq;
      const before = memory.places[id];
      const fromRoom = before?.room ?? STATUS_ROOM[move.from];
      const fromDeskOf = before ? before.deskOf : null;
      if (flight) {
        // A second move in the air: the drone turns towards the new slot and gets time to bend its arc.
        flight.until = Math.max(flight.until, now) + flightMs(id) / 2;
      } else if (fromRoom !== natural.room || fromDeskOf !== natural.deskOf) {
        flight = {
          slug,
          fromRoom,
          fromDeskOf,
          fromDeskInferred: before?.deskInferred ?? false,
          startedAt: move.ts,
          until: move.ts + flightMs(id),
          card: null,
        };
      }
    }
    const waited = memory.unarchivePending[id];
    if (waited !== undefined) {
      delete memory.unarchivePending[id];
      if (!flight) {
        const startedAt = Math.max(waited, Math.min(now, waited + UNARCHIVE_WAIT_MS));
        flight = { slug, fromRoom: "truck", fromDeskOf: null, fromDeskInferred: false, startedAt, until: startedAt + flightMs(id), card: null };
      }
    }
    if (flight && now >= flight.until) flight = undefined;
    if (flight) {
      memory.flights[id] = flight;
      carry(object, flight, natural.room, natural.deskOf);
    } else {
      delete memory.flights[id];
    }
    memory.places[id] = { room: object.room, deskOf: object.deskOf, deskInferred: object.deskInferred };
  }

  // Archived packages fly from their last place to the truck at Dispatch.
  for (const a of facts.archives) {
    if (a.seq <= memory.archiveSeen || a.slug !== slug || !a.card) continue;
    if (memory.flights[a.ticketId] && memory.flights[a.ticketId]!.card) continue;
    const before = memory.places[a.ticketId];
    const previous = memory.flights[a.ticketId];
    memory.flights[a.ticketId] = {
      slug,
      fromRoom: previous?.fromRoom ?? before?.room ?? "dispatch",
      fromDeskOf: previous?.fromDeskOf ?? before?.deskOf ?? null,
      fromDeskInferred: previous?.fromDeskInferred ?? before?.deskInferred ?? false,
      startedAt: previous?.startedAt ?? a.ts,
      until: previous ? Math.max(previous.until, now) + flightMs(a.ticketId) / 2 : a.ts + flightMs(a.ticketId),
      card: a.card,
    };
  }
  const toTruck: BuiltObject[] = [];
  const onBoard = new Set(built.map((b) => b.object.ticketId));
  for (const [id, flight] of Object.entries(memory.flights)) {
    if (flight.slug !== slug || !flight.card || onBoard.has(id)) continue;
    if (now >= flight.until) {
      delete memory.flights[id];
      delete memory.places[id];
      continue;
    }
    const item = rebuild(flight.card);
    carry(item.object, flight, "truck", null);
    toTruck.push(item);
  }
  // Forget places of tickets that left this building's board without a flight.
  for (const id of Object.keys(memory.places)) {
    if (!onBoard.has(id) && !memory.flights[id] && ownedBy(id, slug, ctx)) delete memory.places[id];
  }
  return toTruck;
}

/** Once per reduction, after the buildings: the archive and unarchive facts seen so far are answered. */
export function finishFlights(ctx: ReduceContext): void {
  const { memory, facts, now } = ctx;
  memory.archiveSeen = Math.max(memory.archiveSeen, ...facts.archives.map((a) => a.seq));
  memory.unarchiveSeen = Math.max(memory.unarchiveSeen, ...facts.unarchives.map((a) => a.seq));
  for (const [id, ts] of Object.entries(memory.unarchivePending)) if (now - ts > UNARCHIVE_WAIT_MS) delete memory.unarchivePending[id];
  // Flights of a building that closed meanwhile end on time as well.
  for (const [id, flight] of Object.entries(memory.flights)) if (now >= flight.until) delete memory.flights[id];
}

function ownedBy(ticketId: string, slug: string, ctx: ReduceContext): boolean {
  const card = ctx.facts.cards[ticketId];
  return !card || card.slug === slug;
}

function carry(object: WorkObject, flight: FlightMemory, toRoom: TransitPlace, toDeskOf: string | null): void {
  object.transit = { fromRoom: flight.fromRoom, toRoom, toDeskOf, startedAt: flight.startedAt, until: flight.until };
  // The package stays where the drone found it until the drop.
  object.room = flight.fromRoom === "truck" ? "dispatch" : flight.fromRoom;
  object.deskOf = flight.fromDeskOf;
  object.deskInferred = flight.fromDeskInferred;
}
