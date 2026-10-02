/* Movement from facts (plan 4.3, 4.4 and 7.1): which walks a change of the world model asks for. Pure: two models
   in, a list of intents out, never per frame. The walk runtime (walks.ts) turns intents into NavSimulation
   destinations. Movement is cosmetic: nothing here adds a fact, and the text view never mentions a walk.

   - Tickets are carried by the ticket drone, not by agents. An agent walks to its desk when a ticket lands on it,
     and to the review pile and back when its ticket flies to review (a short hand-over walk); a person's move to done
     moves nobody.
   - A worker appearing in the snapshot enters through the lobby; one that leaves walks out.
   - A real-location switch walks the town path in the town view and swaps at once otherwise (plan 4.4).
   - Postures are the model's debounced ones (held two snapshots or 45 s), never the raw lane status.
   - Under reduced motion nothing walks: cosmetic errands are dropped and every move is a jump. */
import type { AgentKey, AgentPlacement, Building, Intent, RoomKind, WorkObject, WorldModel } from "@crewhub/world-model";

export type Ambient = "off" | "reduced" | "on";
export const AMBIENT_CHOICES: readonly Ambient[] = ["on", "reduced", "off"];

/**
 * Where a leg ends: the agent's own desk, the approach of a prop with a tag, the street outside, beside another
 * agent's seat (a director visit), or the `index`th place around the meeting table (a director gather).
 */
export type Place =
  | { kind: "desk" }
  | { kind: "spot"; tag: string; room: RoomKind | null }
  | { kind: "outside" }
  | { kind: "beside"; agent: AgentKey }
  | { kind: "gather"; index: number };
export interface Leg {
  place: Place;
  /** How long the agent stays there before the next leg, in simulation ms. */
  dwellMs: number;
}

export type MovementIntent =
  /** First sight or after a snapshot (seek, loop): stand at the desk now. */
  | { type: "spawn"; agent: AgentKey; building: string }
  /** A new agent in the snapshot: in through the lobby to its desk. */
  | { type: "enter"; agent: AgentKey; building: string; walk: boolean }
  /** Gone from the snapshot: out of the front door. */
  | { type: "leave"; agent: AgentKey; building: string; walk: boolean }
  /** The real location moved to another building (plan 4.4). */
  | { type: "switch"; agent: AgentKey; from: string; to: string; walk: boolean }
  /** Back to the desk: a ticket landed on it, or the agent is no longer at rest. */
  | { type: "desk"; agent: AgentKey; building: string }
  /** A cosmetic round trip: the hand-over walk to review, idle variety, or a director intent. */
  | { type: "errand"; agent: AgentKey; building: string; reason: ErrandReason; label: string; legs: Leg[] }
  /** A new delivery: the postman takes a letter to the recipient's building (null: the town hall). */
  | { type: "deliver"; deliveryId: string; recipientId: string; toBuilding: string | null };

export type ErrandReason = "handover" | "idle" | "director";

/**
 * The prop tags an agent may be sent to (idle variety and the director): props with somewhere to stand that are not
 * someone's desk. The words come from the building template's prop definitions.
 */
export const VISIT_TAGS: readonly string[] = ["coffee", "rest", "greenery", "mail", "planning", "review", "storage", "dispatch"];

export interface MovementOptions {
  reducedMotion: boolean;
  /** The building whose interior is shown, or null for the town view. */
  entered: string | null;
}

/** The hand-over: to the review pile, a short pause, back to the desk. */
export const HANDOVER_LEGS: readonly Leg[] = [
  { place: { kind: "spot", tag: "review", room: "review" }, dwellMs: 1500 },
  { place: { kind: "desk" }, dwellMs: 0 },
];

type Real = { slug: string; agent: AgentPlacement };

/** Real avatars by key, in building order (archived buildings have none). */
function realAgents(model: WorldModel): Map<AgentKey, Real> {
  const out = new Map<AgentKey, Real>();
  for (const b of model.buildings) {
    if (b.archived) continue;
    for (const agent of b.agents) if (agent.presence === "real" && !out.has(agent.key)) out.set(agent.key, { slug: b.slug, agent });
  }
  return out;
}

function objectsById(model: WorldModel): Map<string, WorkObject> {
  const out = new Map<string, WorkObject>();
  for (const b of model.buildings) for (const o of b.objects) out.set(o.ticketId, o);
  return out;
}

/** The walks the change from `prev` to `next` asks for. `prev` null (first model) or a new snapshot places everyone. */
export function planMovement(prev: WorldModel | null, next: WorldModel, options: MovementOptions): MovementIntent[] {
  const intents: MovementIntent[] = [];
  const nextReal = realAgents(next);
  if (!prev || prev.snapshots !== next.snapshots) {
    for (const [agent, { slug }] of nextReal) intents.push({ type: "spawn", agent, building: slug });
    return intents;
  }
  const walk = !options.reducedMotion;
  const prevReal = realAgents(prev);
  const placed = new Set<AgentKey>();

  for (const [key, now] of nextReal) {
    const before = prevReal.get(key);
    if (!before) {
      intents.push({ type: "enter", agent: key, building: now.slug, walk });
      placed.add(key);
    } else if (before.slug !== now.slug) {
      // The town path is visible only in the town view; inside a building the other one is offscreen.
      intents.push({ type: "switch", agent: key, from: before.slug, to: now.slug, walk: walk && options.entered === null });
      placed.add(key);
    } else if (before.agent.room !== now.agent.room || (before.agent.posture === "relaxed" && now.agent.posture !== "relaxed")) {
      // A new home room (a role override), or no longer at rest: back to the desk, whatever the errand.
      intents.push({ type: "desk", agent: key, building: now.slug });
      placed.add(key);
    }
  }
  for (const [key, before] of prevReal) if (!nextReal.has(key)) intents.push({ type: "leave", agent: key, building: before.slug, walk });

  const before = objectsById(prev);
  for (const b of next.buildings) {
    if (b.archived) continue;
    for (const o of b.objects) {
      const q = before.get(o.ticketId);
      const holder = o.deskOf ? nextReal.get(o.deskOf) : undefined;
      if (!holder || holder.slug !== b.slug || placed.has(holder.agent.key)) continue;
      const newFlight = o.transit && (!q?.transit || q.transit.startedAt !== o.transit.startedAt || q.transit.toRoom !== o.transit.toRoom);
      if (newFlight && o.transit?.toRoom === "review") {
        // While the drone flies, `deskOf` is still the old place: the agent whose desk it left hands it over.
        if (walk) intents.push({ type: "errand", agent: holder.agent.key, building: b.slug, reason: "handover", label: `hands ${o.key} over to review`, legs: HANDOVER_LEGS.map((l) => ({ ...l })) });
        placed.add(holder.agent.key);
      } else if (!o.transit && (!q || q.deskOf !== o.deskOf || q.transit)) {
        intents.push({ type: "desk", agent: holder.agent.key, building: b.slug });
        placed.add(holder.agent.key);
      }
    }
  }

  const known = new Set(prev.deliveries.map((d) => d.deliveryId));
  for (const d of next.deliveries)
    if (!known.has(d.deliveryId)) intents.push({ type: "deliver", deliveryId: d.deliveryId, recipientId: d.recipientId, toBuilding: d.toBuilding });
  return intents;
}

/* ── Idle variety (plan 7.1) ─────────────────────────────────────────────── */

/** One idle choice per agent per bucket of source time; a reload in the same bucket makes the same choice. */
export const IDLE_BUCKET_MS = 90_000;
export const IDLE_ACTIONS = [
  { label: "looks at the board", tag: "planning", room: "planning" },
  { label: "waters a plant", tag: "greenery", room: null },
  { label: "gets a coffee", tag: "coffee", room: "lobby" },
] as const satisfies readonly { label: string; tag: string; room: RoomKind | null }[];
const IDLE_CHANCE: Record<Ambient, number> = { on: 0.5, reduced: 0.2, off: 0 };

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

export interface IdleChoice {
  /** `${agent}|${bucket}`: an errand runs at most once per choice. */
  id: string;
  /** Source time (ms) when the errand starts. */
  at: number;
  label: string;
  tag: string;
  room: RoomKind | null;
  dwellMs: number;
}

/** The seeded idle choice of an agent for the bucket that holds `now`, or null for none. */
export function idleChoice(agent: AgentKey, now: number, ambient: Ambient): IdleChoice | null {
  const bucket = Math.floor(now / IDLE_BUCKET_MS);
  const h = hash(`${agent}|${bucket}`);
  if ((h % 1000) / 1000 >= IDLE_CHANCE[ambient]) return null;
  const action = IDLE_ACTIONS[(h >>> 10) % IDLE_ACTIONS.length]!;
  return {
    id: `${agent}|${bucket}`,
    at: bucket * IDLE_BUCKET_MS + Math.floor((((h >>> 14) % 1000) / 1000) * IDLE_BUCKET_MS * 0.7),
    label: action.label,
    tag: action.tag,
    room: action.room,
    dwellMs: 2500 + ((h >>> 22) % 4) * 500,
  };
}

/**
 * At rest: a real avatar whose debounced posture is relaxed, with no alert and no stalled or waiting ticket on its
 * desk. Working, blocked, stalled and waiting agents never wander.
 */
export function isResting(agent: AgentPlacement, building: Building): boolean {
  if (agent.presence !== "real" || agent.posture !== "relaxed" || agent.alerts.length) return false;
  return !building.objects.some((o) => o.deskOf === agent.key && (o.stall !== null || o.waitingOnHuman || o.blocked));
}

export interface IdleOptions extends MovementOptions {
  ambient: Ambient;
}

/**
 * Idle errands due at `now` in the entered building (the only one with cosmetic routing), skipping choices in
 * `done`. None under reduced motion, with ambient off, or in the town view.
 */
export function planIdle(model: WorldModel, now: number, options: IdleOptions, done: ReadonlySet<string>): (MovementIntent & { type: "errand" } & { id: string })[] {
  if (options.reducedMotion || options.ambient === "off" || !options.entered) return [];
  const b = model.buildings.find((x) => x.slug === options.entered);
  if (!b || b.archived) return [];
  const out: (MovementIntent & { type: "errand" } & { id: string })[] = [];
  for (const agent of b.agents) {
    if (!isResting(agent, b)) continue;
    const choice = idleChoice(agent.key, now, options.ambient);
    if (!choice || choice.at > now || done.has(choice.id)) continue;
    out.push({
      type: "errand",
      id: choice.id,
      agent: agent.key,
      building: b.slug,
      reason: "idle",
      label: choice.label,
      legs: [
        { place: { kind: "spot", tag: choice.tag, room: choice.room }, dwellMs: choice.dwellMs },
        { place: { kind: "desk" }, dwellMs: 0 },
      ],
    });
  }
  return out;
}

/* ── Director intents (plan 7.3) ─────────────────────────────────────────── */

/** A director walk dwells for the intent's time-to-live, but never longer than this (source time). */
export const DIRECTOR_DWELL_MAX_MS = 20_000;

/**
 * The round trips an accepted director intent asks for in `building`: to a prop's approach cell, beside another
 * agent's seat, or around the meeting table, a dwell, and back to the desk. `stay` asks for none. Whether they run
 * (entered building only, never under reduced motion) is the walk runtime's call.
 */
export function directorErrands(intent: Intent, building: string): (MovementIntent & { type: "errand" })[] {
  const dwellMs = Math.min(intent.ttlMs, DIRECTOR_DWELL_MAX_MS);
  const back: Leg = { place: { kind: "desk" }, dwellMs: 0 };
  const errand = (agent: AgentKey, label: string, place: Place): MovementIntent & { type: "errand" } => ({
    type: "errand",
    agent,
    building,
    reason: "director",
    label,
    legs: [{ place, dwellMs }, back],
  });
  switch (intent.kind) {
    case "stay":
      return [];
    case "goToProp":
      return [errand(intent.agent, `goes to the ${intent.tag} props in the ${intent.room}`, { kind: "spot", tag: intent.tag, room: intent.room })];
    case "visitAgent":
      return [errand(intent.agent, `visits ${intent.target}`, { kind: "beside", agent: intent.target })];
    case "gather":
      return intent.agents.map((agent, index) => errand(agent, "gathers in the meeting room", { kind: "gather", index }));
  }
}
