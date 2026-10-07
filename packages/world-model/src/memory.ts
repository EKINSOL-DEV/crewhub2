/**
 * Presentation memory: the little state the reducer carries between reductions that is not a loops
 * fact. It is plain JSON so the app may keep it across reloads.
 */
import type { AgentKey, LaneStatus, RoleId, RoomKind, TransitPlace } from "./model.ts";
import type { TicketCard } from "@crewhub/loops-client";

/** A ticket drone in the air (source-time ms). */
export interface FlightMemory {
  slug: string;
  fromRoom: TransitPlace;
  fromDeskOf: AgentKey | null;
  fromDeskInferred: boolean;
  startedAt: number;
  until: number;
  /** For a flight to the truck: the card as it was archived (it is no longer on the board). */
  card: TicketCard | null;
}

/** Where a ticket's object was last shown. */
export interface PlaceMemory {
  room: RoomKind;
  deskOf: AgentKey | null;
  deskInferred: boolean;
}

export interface LaneMemory {
  /** The status the posture currently shows. */
  shown: LaneStatus;
  /** A different status waiting to hold long enough (plan 7.1). */
  pending: LaneStatus | null;
  pendingSince: number;
  /** Consecutive team snapshots that carried `pending`. */
  pendingSnapshots: number;
  /** The team revision last counted for `pending`. */
  teamRevision: number;
}

export interface PresentationMemory {
  lanes: Record<AgentKey, LaneMemory>;
  /** Per building slug: when a role room first had an agent (source ms). */
  roleRooms: Record<string, Partial<Record<RoleId, number>>>;
  /** The last real building per agent, kept after 30 quiet minutes. */
  locations: Record<AgentKey, string>;
  /** Ticket drones in the air, by ticket id. */
  flights: Record<string, FlightMemory>;
  /** The place each object was last shown, by ticket id. */
  places: Record<string, PlaceMemory>;
  /** The last `ticket.moved` seq each ticket's drone already answered. */
  movesSeen: Record<string, number>;
  /** The newest archive and unarchive seq already answered. */
  archiveSeen: number;
  unarchiveSeen: number;
  /** Unarchived tickets waiting for their card to come back (ticket id to the event's source ms). */
  unarchivePending: Record<string, number>;
  /** `Facts.snapshots` when the flights were last judged: a new snapshot ends every flight. */
  snapshots: number;
}

export function emptyMemory(): PresentationMemory {
  return {
    lanes: {},
    roleRooms: {},
    locations: {},
    flights: {},
    places: {},
    movesSeen: {},
    archiveSeen: 0,
    unarchiveSeen: 0,
    unarchivePending: {},
    snapshots: 0,
  };
}
