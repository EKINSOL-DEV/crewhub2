/**
 * The ticket drone (spec addendum "the ticket drone"): a status change, an archive or an unarchive is carried by a
 * small drone inside one building. The model moves the object on the drop, not on the pickup: while a flight is in
 * the air the object keeps its old room and desk and carries `transit`. Cosmetic and deterministic: the flight time
 * comes from the ticket id, in source time, so it scales with the playback speed.
 *
 * A move into Done is a person's act (spec addendum "a person in the world"): the drone does not fly that package. A
 * person carries it from its rack or desk to the Done rack, one person per building at a time; moves that arrive
 * while someone is carrying queue behind them, and past three queued the rest land at once. The carry is a flight with
 * a `person`; the visit lingers as "landed" for a moment after the drop. Under reduced motion the package lands at once.
 */
import type { ReduceContext } from "./agents.ts";
import type { MoveFact } from "./facts.ts";
import type { FlightMemory, LandedMemory, PersonCarry } from "./memory.ts";
import type { BuiltObject } from "./objects.ts";
import type { PersonVisit, RoomKind, TicketStatus, TransitPlace, WorkObject } from "./model.ts";
import { drawnStatus } from "./status.ts";

export const FLIGHT_MIN_MS = 2_000;
export const FLIGHT_MAX_MS = 4_000;
/** An unarchive whose card never comes back is forgotten after this. */
const UNARCHIVE_WAIT_MS = 60_000;
/** A person's carry, front door to Done rack, in source time: the renderer walks it; the model moves the package at its end. */
export const PERSON_CARRY_MS = 12_000;
/** After the drop the visit is still told ("<name> moved <key> to Done"), as long as the celebration. */
export const PERSON_LANDED_MS = 6_000;
/** Moves that may wait behind the carrying person; past that, the rest land at once. */
export const PERSON_QUEUE_MAX = 3;

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

/** Once per reduction, before the buildings: a new snapshot (a seek, a new loop) grounds every drone and every person. */
export function startFlights(ctx: ReduceContext): void {
  const { memory, facts } = ctx;
  memory.landed ??= {};
  if (memory.snapshots === facts.snapshots) return;
  memory.snapshots = facts.snapshots;
  memory.flights = {};
  memory.landed = {};
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
      // Whatever the visit said is history: the package moved again.
      delete memory.landed[id];
      const before = memory.places[id];
      const fromRoom = before?.room ?? STATUS_ROOM[drawnStatus(move.from)];
      const fromDeskOf = before ? before.deskOf : null;
      if (flight?.person) {
        // A new move while a person carries it: the visit ends where the package stood; the drone takes it from there.
        flight = undefined;
      }
      if (flight) {
        // A second move in the air: the drone turns towards the new slot and gets time to bend its arc.
        flight.until = Math.max(flight.until, now) + flightMs(id) / 2;
      } else if (fromRoom !== natural.room || fromDeskOf !== natural.deskOf) {
        const start = { slug, fromRoom, fromDeskOf, fromDeskInferred: before?.deskInferred ?? false };
        flight =
          move.to === "done" && move.actorKind === "user"
            ? personCarry(id, object.key, move, start, ctx)
            : { ...start, startedAt: move.ts, until: move.ts + flightMs(id), card: null, person: null };
      }
    }
    const waited = memory.unarchivePending[id];
    if (waited !== undefined) {
      delete memory.unarchivePending[id];
      if (!flight) {
        const startedAt = Math.max(waited, Math.min(now, waited + UNARCHIVE_WAIT_MS));
        flight = { slug, fromRoom: "truck", fromDeskOf: null, fromDeskInferred: false, startedAt, until: startedAt + flightMs(id), card: null, person: null };
      }
    }
    if (flight && now >= flight.until) {
      if (flight.person) memory.landed[id] = landedFrom(flight, object.key, flight.until);
      flight = undefined;
    }
    if (flight) {
      memory.flights[id] = flight;
      carry(object, flight, natural.room, natural.deskOf);
    } else {
      delete memory.flights[id];
    }
    const landed = memory.landed[id];
    if (landed && landed.slug === slug && landed.until > now && object.status === "done") {
      // The celebration (or the turned-down gesture) follows the landing, not the move.
      if (landed.person.rejected) object.turnedDownUntil = landed.until;
      else object.celebrateUntil = landed.until;
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
      person: null,
    };
    delete memory.landed[a.ticketId];
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

/**
 * A person's carry for a move into Done: behind the people already in this building (one carries, the others wait at
 * the door), or none at all when more than `PERSON_QUEUE_MAX` wait or the viewer prefers reduced motion: the package
 * then lands at once and only the landed visit is told.
 */
function personCarry(
  id: string,
  ticketKey: string,
  move: MoveFact,
  start: Pick<FlightMemory, "slug" | "fromRoom" | "fromDeskOf" | "fromDeskInferred">,
  ctx: ReduceContext,
): FlightMemory | undefined {
  const { memory } = ctx;
  const person: PersonCarry = { id: move.actorId, movedAt: move.ts, rejected: move.resolution === "rejected" };
  const carrying = Object.values(memory.flights).filter((f) => f.person && f.slug === start.slug);
  if (ctx.reducedMotion || carrying.length > PERSON_QUEUE_MAX) {
    memory.landed[id] = { slug: start.slug, ticketKey, person, fromRoom: roomOf(start.fromRoom), fromDeskOf: start.fromDeskOf, startedAt: move.ts, landedAt: move.ts, until: move.ts + PERSON_LANDED_MS };
    return undefined;
  }
  const startedAt = Math.max(move.ts, ...carrying.map((f) => f.until));
  return { ...start, startedAt, until: startedAt + PERSON_CARRY_MS, card: null, person };
}

function landedFrom(flight: FlightMemory, ticketKey: string, landedAt: number): LandedMemory {
  return {
    slug: flight.slug,
    ticketKey,
    person: flight.person!,
    fromRoom: roomOf(flight.fromRoom),
    fromDeskOf: flight.fromDeskOf,
    startedAt: flight.startedAt,
    landedAt,
    until: landedAt + PERSON_LANDED_MS,
  };
}

/** A person never fetches from the truck; a place that reads "truck" is the Done rack. */
function roomOf(place: TransitPlace): RoomKind {
  return place === "truck" ? "dispatch" : place;
}

/** The visits of one building, in carrying order: the carries in memory (queued or carrying) and the landed ones. */
export function visitsOf(slug: string, ctx: ReduceContext): PersonVisit[] {
  const { memory, facts, now } = ctx;
  const nameOf = (id: string) => facts.principals.find((p) => p.id === id)?.displayName ?? id;
  const keyOf = (id: string) => facts.cards[id]?.card.key ?? facts.lastMoves[id]?.ticketKey ?? id;
  const visits: PersonVisit[] = [];
  for (const [ticketId, flight] of Object.entries(memory.flights)) {
    const person = flight.person;
    if (!person || flight.slug !== slug) continue;
    visits.push({
      id: `${ticketId}:${person.movedAt}`,
      personId: person.id,
      displayName: nameOf(person.id),
      ticketId,
      ticketKey: keyOf(ticketId),
      movedAt: person.movedAt,
      startedAt: flight.startedAt,
      until: flight.until,
      from: { room: roomOf(flight.fromRoom), deskOf: flight.fromDeskOf },
      rejected: person.rejected,
      phase: flight.startedAt > now ? "queued" : "carrying",
    });
  }
  for (const [ticketId, landed] of Object.entries(memory.landed)) {
    if (landed.slug !== slug || landed.until <= now) continue;
    visits.push({
      id: `${ticketId}:${landed.person.movedAt}`,
      personId: landed.person.id,
      displayName: nameOf(landed.person.id),
      ticketId,
      ticketKey: landed.ticketKey,
      movedAt: landed.person.movedAt,
      startedAt: landed.startedAt,
      until: landed.landedAt,
      from: { room: landed.fromRoom, deskOf: landed.fromDeskOf },
      rejected: landed.person.rejected,
      phase: "landed",
    });
  }
  return visits.sort((a, b) => a.startedAt - b.startedAt || a.movedAt - b.movedAt || a.ticketKey.localeCompare(b.ticketKey));
}

/** Once per reduction, after the buildings: the archive and unarchive facts seen so far are answered. */
export function finishFlights(ctx: ReduceContext): void {
  const { memory, facts, now } = ctx;
  memory.archiveSeen = Math.max(memory.archiveSeen, ...facts.archives.map((a) => a.seq));
  memory.unarchiveSeen = Math.max(memory.unarchiveSeen, ...facts.unarchives.map((a) => a.seq));
  for (const [id, ts] of Object.entries(memory.unarchivePending)) if (now - ts > UNARCHIVE_WAIT_MS) delete memory.unarchivePending[id];
  // Flights of a building that closed meanwhile end on time as well.
  for (const [id, flight] of Object.entries(memory.flights)) if (now >= flight.until) delete memory.flights[id];
  for (const [id, landed] of Object.entries(memory.landed)) if (now >= landed.until) delete memory.landed[id];
}

function ownedBy(ticketId: string, slug: string, ctx: ReduceContext): boolean {
  const card = ctx.facts.cards[ticketId];
  return !card || card.slug === slug;
}

function carry(object: WorkObject, flight: FlightMemory, toRoom: TransitPlace, toDeskOf: string | null): void {
  object.transit = { fromRoom: flight.fromRoom, toRoom, toDeskOf, startedAt: flight.startedAt, until: flight.until };
  if (flight.person) {
    object.transit.carrier = "person";
    // Nothing is celebrated or set aside until the person has put it down.
    object.celebrateUntil = null;
    object.turnedDownUntil = null;
  }
  // The package stays where the drone found it until the drop.
  object.room = flight.fromRoom === "truck" ? "dispatch" : flight.fromRoom;
  object.deskOf = flight.fromDeskOf;
  object.deskInferred = flight.fromDeskInferred;
}
