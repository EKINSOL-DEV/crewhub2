/**
 * The facts the projection keeps from a `WorldSource`: the loaded snapshot patched by events,
 * plus the short event history the reducer needs (progress lines, comment marks, moves).
 * Timestamps from events are kept as ms since the epoch (`Date.parse` of the envelope `ts`).
 */
import type {
  AgentOut,
  DeliveryState,
  MilestoneSummary,
  PrincipalKind,
  PrincipalOut,
  ProgressKind,
  ProjectOut,
  ReleaseSummary,
  TeamSnapshot,
  TicketCard,
  TicketStatus,
  WatchdogResponse,
} from "@crewhub/loops-client";

export interface CardFact {
  /** The project slug the card belongs to. */
  slug: string;
  card: TicketCard;
}

export interface StallFact {
  ticketKey: string;
  state: "stalled" | "attention";
  quietSince: string;
  /** From the watchdog or the event; `quietMinutes` is computed by loops at that moment. */
  quietMinutes: number | null;
  /** The lead lane the watchdog judged (`payload.agent`), when known. */
  agent: string | null;
  /** The first member reported `blocked`, for the attention beacon. */
  blockedMember: string | null;
  nudges: number;
}

export interface ProgressFact {
  seq: number;
  ts: number;
  slug: string | null;
  ticketKey: string;
  /** The lead lane that wrote it (a worker line has its lead here). */
  agent: string;
  kind: ProgressKind;
  /** Raw text; a worker line reads `"<worker>: <line>"`. */
  text: string;
}

export interface CommentFact {
  seq: number;
  ts: number;
  slug: string | null;
  ticketId: string;
  ticketKey: string;
  actorId: string;
  actorKind: PrincipalKind;
}

export interface MoveFact {
  seq: number;
  ts: number;
  slug: string | null;
  ticketKey: string;
  actorId: string;
  actorKind: PrincipalKind;
  from: TicketStatus;
  to: TicketStatus;
  reason: string | null;
}

export interface DeliveryFact {
  deliveryId: string;
  /** From `delivery.created`; null when only a `delivery.updated` was seen. */
  recipientId: string | null;
  reason: string | null;
  /** Kept as the wire string: new states are tolerated (stability.md). */
  state: DeliveryState | string;
  slug: string | null;
  ticketKey: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Facts {
  /** False until the first snapshot. */
  loaded: boolean;
  cursor: number;
  /** Increments on every change; use it to memoise reductions. */
  version: number;
  /** Every project by slug, archived ones included. */
  projects: Record<string, ProjectOut>;
  /** Active project slugs in sidebar order. */
  order: string[];
  /** Archived project slugs in the order they were archived or loaded. */
  archivedOrder: string[];
  /** Open cards by ticket id. */
  cards: Record<string, CardFact>;
  team: TeamSnapshot | null;
  /** The source clock when the current team snapshot arrived. */
  teamReceivedAt: number | null;
  /** Counts team snapshots received; the debounce counts consecutive snapshots with it. */
  teamRevision: number;
  agents: AgentOut[];
  principals: PrincipalOut[];
  watchdog: WatchdogResponse | null;
  /** Open stalls by ticket key. */
  stalls: Record<string, StallFact>;
  milestones: Record<string, MilestoneSummary[]>;
  releases: Record<string, ReleaseSummary[]>;
  /** Milestone id to the lane its tickets were handed to. */
  handoffs: Record<string, string>;
  /** Tickets archived since the snapshot, per project slug. */
  archivedTickets: Record<string, number>;
  /** Recent lines, oldest first, capped. */
  progress: ProgressFact[];
  comments: CommentFact[];
  /** The last `ticket.moved` per ticket id. */
  lastMoves: Record<string, MoveFact>;
  deliveries: Record<string, DeliveryFact>;
  /** Envelopes that failed validation. */
  invalidEvents: number;
  /** Valid envelopes of a type the world does not handle. */
  skippedEvents: number;
}

export function emptyFacts(): Facts {
  return {
    loaded: false,
    cursor: 0,
    version: 0,
    projects: {},
    order: [],
    archivedOrder: [],
    cards: {},
    team: null,
    teamReceivedAt: null,
    teamRevision: 0,
    agents: [],
    principals: [],
    watchdog: null,
    stalls: {},
    milestones: {},
    releases: {},
    handoffs: {},
    archivedTickets: {},
    progress: [],
    comments: [],
    lastMoves: {},
    deliveries: {},
    invalidEvents: 0,
    skippedEvents: 0,
  };
}

/** Parses an ISO timestamp to ms; NaN-safe (falls back to `fallback`). */
export function parseTs(ts: string | null | undefined, fallback: number): number {
  if (!ts) return fallback;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? fallback : ms;
}
