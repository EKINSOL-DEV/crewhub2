/**
 * The world model: what the reducer produces from crewhub-loops facts and what the
 * renderer and the text view consume. Presentation only; every field is either a loops
 * fact, a labelled inference, or cosmetic, as LOOPS_INTEGRATION_PLAN.md section 4.6 says.
 * The string unions mirror crewhub-loops `docs/integrators/`; they are repeated here so
 * the renderer does not depend on the loops client.
 */

export type TicketStatus = "backlog" | "planned" | "in_progress" | "review" | "done";
export type TicketKind = "task" | "feature" | "bug" | "question";
export type TicketPriority = "urgent" | "high" | "normal" | "low";
export type LaneStatus = "working" | "idle" | "done" | "blocked" | "unknown";
export type ProjectColor = "coral" | "tangerine" | "circle" | "mist" | "ink";
export type ProjectIcon = "home" | "inbox" | "bot" | "spark" | "users" | "star" | "folder";
export type ProgressKind = "start" | "update" | "done" | "question";
export type DeliveryState =
  | "pending"
  | "claimed"
  | "forwarded"
  | "uncertain"
  | "unroutable"
  | "obsolete";

/** Roles are a CrewHub catalogue (plan 4.2), not a loops fact. */
export type RoleId = "lead" | "worker" | "analyst" | "design";
/** Where a role came from: a loops fact (the project lead), a name rule, or a person's override. */
export type RoleSource = "fact" | "name-rule" | "override";

export type RoomKind =
  | "lobby"
  | "lead-office"
  | "workers"
  | "analyst"
  | "design"
  | "storage"
  | "planning"
  | "review"
  | "dispatch"
  | "meeting";

/** Registered agents: the loops principal id. Workers: `${session}/${name}`. */
export type AgentKey = string;

export interface Freshness {
  /** The probe's `ts` of the last team snapshot, or null before the first one. */
  teamTs: string | null;
  /** Seconds between `teamTs` and the source's `now`; null when unknown. */
  ageSeconds: number | null;
  /** True when the snapshot is missing or older than 300 s: every lane shows as unknown. */
  stale: boolean;
}

export interface WorldModel {
  /** The source's clock (demo time for the demo), ms since the epoch. */
  now: number;
  /** "demo" labels every surface as demo; "live" is for the future host. */
  mode: "demo" | "live";
  /** The last applied event seq; for the text view and debugging. */
  cursor: number;
  freshness: Freshness;
  /** Plot order follows the loops project order; archived projects keep a boarded-up plot. */
  buildings: Building[];
  /** Registered agents active in no building (plan 4.1). */
  townHall: AgentPlacement[];
  /** The postman (role `router`) when it is at the post office. */
  postOffice: AgentPlacement[];
  /** Deliveries in flight or parked at a mailbox (plan 4.3). */
  deliveries: DeliveryWalk[];
}

export interface Building {
  slug: string;
  key: string;
  name: string;
  color: ProjectColor | null;
  icon: ProjectIcon | null;
  /** Boarded up while archived; comes back on `project.restored`. */
  archived: boolean;
  /** `ProjectOut.counts`, a fact. */
  counts: Record<TicketStatus, number>;
  lead: { id: string; displayName: string };
  rooms: Room[];
  objects: WorkObject[];
  /** Real avatars and proxies whose home is this building. */
  agents: AgentPlacement[];
  milestones: MilestoneMark[];
  releases: ReleaseMark[];
  /** Amber beacons over the lead's office for `attention` stalls. */
  beacons: Beacon[];
  /** Letters parked in the lobby mailbox (flagged when uncertain or unroutable). */
  mailbox: Letter[];
  /** Tickets archived from Dispatch, kept as a lobby count. */
  archivedCount: number;
}

export interface Room {
  id: string; // `${slug}:${kind}`
  kind: RoomKind;
  label: string;
  /** Role rooms exist once an agent of that role has been present; empty ones stay dimmed. */
  present: boolean;
  /** For an empty role room, e.g. "no design agents active". */
  emptyLabel: string | null;
}

export type ObjectLook = "folder" | "box" | "bug-crate" | "envelope";

/** Where the ticket drone lifts a package from or drops it: a room, or the truck (archive and unarchive). */
export type TransitPlace = RoomKind | "truck";

/**
 * The ticket drone's flight (cosmetic, deterministic): source-time ms. While it is set, `room` and `deskOf` keep the
 * old place; at `until` they become the new place and `transit` is null (the model updates on the drop).
 */
export interface Transit {
  fromRoom: TransitPlace;
  toRoom: TransitPlace;
  toDeskOf: AgentKey | null;
  startedAt: number;
  until: number;
}

export interface WorkObject {
  ticketId: string;
  key: string;
  title: string;
  kind: TicketKind;
  look: ObjectLook;
  status: TicketStatus;
  /** The room the object is in; `in_progress` objects are on a desk in a role room. */
  room: RoomKind;
  /** The agent whose desk holds it (in progress), or null for the lead's inbox tray. */
  deskOf: AgentKey | null;
  /** True when `deskOf` is inferred from a status line, not the assignee (plan 4.2). */
  deskInferred: boolean;
  /** Board order within its column. */
  position: number;
  priorityTag: "urgent" | "high" | null;
  blocked: boolean;
  /** `held` milestone tickets in Storage are sealed. */
  sealed: boolean;
  /** The watchdog state; `nudges` counts the nudges loops actually sent (a counter by the quiet clock). */
  stall: { state: "stalled" | "attention"; quietSince: string; quietMinutes: number | null; nudges: number } | null;
  /** Name tag of the person it waits on (`waitingOn` of kind user). */
  nameTag: string | null;
  waitingOnHuman: boolean;
  milestone: { id: string; key: string; title: string } | null;
  labels: string[];
  /** Comment speech mark without text (payloads carry no bodies), with its expiry. */
  speechMarkUntil: number | null;
  /** `ticket.moved` to done by a person just happened: play the small celebration once. */
  celebrateUntil: number | null;
  /** The ticket drone carries it right now (a status change, archive or unarchive). */
  transit: Transit | null;
}

export type Posture = "focused" | "relaxed" | "raised-hand" | "greyed";

export interface AgentPlacement {
  key: AgentKey;
  /** Principal id for registered agents, the herdr name for workers. */
  name: string;
  displayName: string;
  registered: boolean;
  role: RoleId;
  roleSource: RoleSource;
  /** Building slug, or null in the town hall or post office. */
  building: string | null;
  room: RoomKind | null;
  /** "proxy" is the translucent echo in a building the agent belongs to but does not work in now. */
  presence: "real" | "proxy";
  /** For a proxy: the building where the real avatar is ("working in <building>"). */
  workingIn: string | null;
  /** True when the real location is inferred from recent events (plan 4.4); always labelled. */
  locationInferred: boolean;
  /** Lane status from the team snapshot; "unknown" when missing or stale. */
  laneStatus: LaneStatus;
  /** Debounced posture (plan 7.1: held two snapshots or 45 s). */
  posture: Posture;
  /** `ticket.progress` caption: fades after 20 s, a question stays until the next line. */
  caption: { text: string; kind: ProgressKind; ticketKey: string; until: number | null } | null;
  /** The ticket on its desk, when known. */
  deskTicketKey: string | null;
  /** Lit on a proxy or avatar when its own building has a stall or waiting ticket. */
  alerts: string[];
}

export interface Beacon {
  ticketKey: string;
  agent: string;
  /** For example "attention: cl-dev-3 blocked 12 min". */
  text: string;
}

export interface Letter {
  deliveryId: string;
  recipientId: string;
  reason: string;
  state: DeliveryState;
  flagged: boolean;
}

export interface DeliveryWalk {
  deliveryId: string;
  recipientId: string;
  reason: string;
  state: DeliveryState;
  /** Destination building slug; null when the recipient has no building (town hall). */
  toBuilding: string | null;
  /** When the walk started, source time. */
  startedAt: number;
}

export interface MilestoneMark {
  id: string;
  key: string;
  title: string;
  state: "planned" | "active" | "done" | "cancelled";
  targetDate: string | null;
  ticketCount: number;
  /** A person handed its tickets to a lane (`milestone.handoff`). */
  handedOffTo: string | null;
}

export interface ReleaseMark {
  id: string;
  number: number;
  version: string | null;
  state: "draft" | "published";
  /** Lobby banner and a trophy on the lead's desk once published. */
  publishedAt: string | null;
}

/** One line of the hidden text view; every fact the scene shows has one. */
export interface TextLine {
  /** Which part of the world it belongs to, e.g. "Town", "CrewHub product (CR)", "Review room". */
  section: string;
  text: string;
  kind: "fact" | "inference" | "cosmetic" | "demo";
}

/** Playback lives with the source seam; re-exported so the renderer keeps one import. */
export type { PlaybackControls, PlaybackSpeed } from "@crewhub/loops-client";
