/**
 * The director's closed intent list and its validation (LOOPS_INTEGRATION_PLAN.md section 7.3). Pure: no model
 * call, no clock, no engine. The app passes a `reachable` callback built from the world engine. Whatever
 * produces intents (tonight a script, later a Haiku lane) goes through `validateIntents` and nothing else.
 *
 * Rules: at most 8 intents per building per plan; never moves a working, blocked, stalled or waiting agent;
 * the room exists and the prop tag is reachable; no speech text, ever (an intent with any field outside its
 * shape is rejected, so there is nowhere to put text that could appear as an agent's speech).
 */
import { roomLabel } from "./rooms.ts";
import type { AgentKey, AgentPlacement, Building, RoomKind, WorldModel } from "./model.ts";

export const MAX_INTENTS_PER_PLAN = 8;
export const MIN_TTL_MS = 5_000;
export const MAX_TTL_MS = 10 * 60_000;

export interface GoToProp {
  kind: "goToProp";
  agent: AgentKey;
  room: RoomKind;
  tag: string;
  ttlMs: number;
}
export interface VisitAgent {
  kind: "visitAgent";
  agent: AgentKey;
  target: AgentKey;
  ttlMs: number;
}
export interface Gather {
  kind: "gather";
  agents: AgentKey[];
  room: "meeting";
  ttlMs: number;
}
export interface Stay {
  kind: "stay";
  agent: AgentKey;
  ttlMs: number;
}
export type Intent = GoToProp | VisitAgent | Gather | Stay;

/** What the host asks the world engine: can this agent reach an approach cell of the thing it wants? */
export type ReachQuery =
  | { kind: "prop"; building: string; agent: AgentKey; room: RoomKind; tag: string }
  | { kind: "agent"; building: string; agent: AgentKey; target: AgentKey }
  | { kind: "room"; building: string; agent: AgentKey; room: RoomKind };
export type Reachable = (query: ReachQuery) => boolean;

export interface RejectedIntent {
  /** The intent as received: it may not even be well formed. */
  intent: unknown;
  reason: string;
}
export interface Validation {
  accepted: Intent[];
  rejected: RejectedIntent[];
}

const SHAPES: Record<Intent["kind"], readonly string[]> = {
  goToProp: ["kind", "agent", "room", "tag", "ttlMs"],
  visitAgent: ["kind", "agent", "target", "ttlMs"],
  gather: ["kind", "agents", "room", "ttlMs"],
  stay: ["kind", "agent", "ttlMs"],
};
const ROOM_KINDS: readonly string[] = [
  "lobby",
  "lead-office",
  "workers",
  "analyst",
  "design",
  "storage",
  "planning",
  "review",
  "dispatch",
  "meeting",
];
const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface Located {
  agent: AgentPlacement;
  building: Building | null;
}

/** The real avatar of an agent, with its building (null in the town hall or the post office). */
export function locate(model: WorldModel, key: AgentKey): Located | null {
  for (const building of model.buildings) {
    const agent = building.agents.find((a) => a.key === key && a.presence === "real");
    if (agent) return { agent, building };
  }
  const outside = [...model.townHall, ...model.postOffice].find((a) => a.key === key);
  return outside ? { agent: outside, building: null } : null;
}

/**
 * Why an agent must not be moved, or null when it is idle. Reads the posture (working, blocked, unknown) and
 * the desk: a stalled ticket or one waiting on a person keeps the agent where it is.
 */
export function immovableReason(located: Located): string | null {
  const { agent, building } = located;
  if (agent.posture === "focused") return "working";
  if (agent.posture === "raised-hand") return "blocked";
  if (agent.posture === "greyed") return "status unknown";
  const desk = building?.objects.filter((o) => o.deskOf === agent.key || o.key === agent.deskTicketKey) ?? [];
  if (desk.some((o) => o.stall !== null) || agent.alerts.some((a) => /stalled|attention/.test(a))) return "stalled";
  if (desk.some((o) => o.waitingOnHuman) || agent.alerts.some((a) => /waiting/.test(a))) return "waiting on a person";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const isKey = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 120;

/** Shape only: a known kind, exactly its fields, sane values. Returns the typed intent or the reason. */
export function parseIntent(raw: unknown): Intent | string {
  if (!isRecord(raw)) return "not an intent object";
  const kind = raw.kind;
  if (kind !== "goToProp" && kind !== "visitAgent" && kind !== "gather" && kind !== "stay") {
    return `unknown intent kind "${String(kind).slice(0, 30)}": not on the closed list`;
  }
  const extra = Object.keys(raw).filter((k) => !SHAPES[kind].includes(k));
  if (extra.length > 0) return `field "${extra[0]}" is not part of ${kind}: intents carry no text, only ids`;
  const ttl = raw.ttlMs;
  if (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl < MIN_TTL_MS || ttl > MAX_TTL_MS) {
    return `ttlMs must be between ${MIN_TTL_MS} and ${MAX_TTL_MS}`;
  }
  switch (kind) {
    case "goToProp":
      if (!isKey(raw.agent)) return "agent is missing";
      if (typeof raw.room !== "string" || !ROOM_KINDS.includes(raw.room)) return "room is not a room kind";
      if (typeof raw.tag !== "string" || !TAG.test(raw.tag) || raw.tag.length > 24) return "tag is not a kebab-case prop tag";
      return { kind, agent: raw.agent, room: raw.room as RoomKind, tag: raw.tag, ttlMs: ttl };
    case "visitAgent":
      if (!isKey(raw.agent) || !isKey(raw.target)) return "agent or target is missing";
      if (raw.agent === raw.target) return "an agent cannot visit itself";
      return { kind, agent: raw.agent, target: raw.target, ttlMs: ttl };
    case "gather": {
      if (raw.room !== "meeting") return "gather only works in the meeting room";
      const agents = raw.agents;
      if (!Array.isArray(agents) || agents.length < 2 || agents.length > 8 || !agents.every(isKey)) {
        return "gather needs two to eight agents";
      }
      if (new Set(agents).size !== agents.length) return "gather lists an agent twice";
      return { kind, agents: agents as string[], room: "meeting", ttlMs: ttl };
    }
    case "stay":
      if (!isKey(raw.agent)) return "agent is missing";
      return { kind, agent: raw.agent, ttlMs: ttl };
  }
}

/** The agents an intent would move; `visitAgent` moves only `agent`. */
export function movedAgents(intent: Intent): AgentKey[] {
  return intent.kind === "gather" ? intent.agents : [intent.agent];
}

/**
 * Accepts or rejects every intent of one plan. Order matters only for the cap and for one intent per agent:
 * the first intent for an agent wins. The building of an intent is the building of the agent it moves.
 */
export function validateIntents(model: WorldModel, intents: readonly unknown[], reachable: Reachable): Validation {
  const accepted: Intent[] = [];
  const rejected: RejectedIntent[] = [];
  const perBuilding = new Map<string, number>();
  const used = new Set<AgentKey>();
  for (const raw of intents) {
    const reject = (reason: string) => rejected.push({ intent: raw, reason });
    const intent = parseIntent(raw);
    if (typeof intent === "string") {
      reject(intent);
      continue;
    }
    const reason = checkIntent(model, intent, reachable, used);
    if (typeof reason === "string") {
      reject(reason);
      continue;
    }
    const count = perBuilding.get(reason.slug) ?? 0;
    if (count >= MAX_INTENTS_PER_PLAN) {
      reject(`more than ${MAX_INTENTS_PER_PLAN} intents for ${reason.slug} in one plan`);
      continue;
    }
    perBuilding.set(reason.slug, count + 1);
    for (const agent of movedAgents(intent)) used.add(agent);
    accepted.push(intent);
  }
  return { accepted, rejected };
}

/** A rejection reason, or `{ slug }` (the building) when the intent passes every rule. */
function checkIntent(model: WorldModel, intent: Intent, reachable: Reachable, used: ReadonlySet<AgentKey>): string | { slug: string } {
  let slug: string | null = null;
  for (const key of movedAgents(intent)) {
    const located = locate(model, key);
    if (!located) return `${key} is not a known agent`;
    if (located.agent.presence === "proxy") return `${key} is a proxy; only a real avatar can move`;
    if (!located.building) return `${key} is in the town hall or post office, not in a building`;
    if (located.building.archived) return `${located.building.name} is archived`;
    if (slug !== null && slug !== located.building.slug) return "gathered agents are in different buildings";
    slug = located.building.slug;
    const locked = immovableReason(located);
    if (locked) return `${key} is ${locked}; the director never moves it`;
    if (used.has(key)) return `${key} already has an intent in this plan`;
  }
  const building = model.buildings.find((b) => b.slug === slug);
  if (!building || slug === null) return "no building";
  const hasRoom = (kind: RoomKind) => building.rooms.some((r) => r.kind === kind);
  switch (intent.kind) {
    case "stay":
      break;
    case "goToProp":
      if (!hasRoom(intent.room)) return `${building.name} has no ${roomLabel(intent.room).toLowerCase()}`;
      if (!reachable({ kind: "prop", building: slug, agent: intent.agent, room: intent.room, tag: intent.tag })) {
        return `no reachable prop tagged "${intent.tag}" in the ${roomLabel(intent.room).toLowerCase()}`;
      }
      break;
    case "visitAgent": {
      const target = locate(model, intent.target);
      if (!target || target.agent.presence !== "real" || target.building?.slug !== slug) {
        return `${intent.target} is not a real avatar in ${building.name}`;
      }
      if (!reachable({ kind: "agent", building: slug, agent: intent.agent, target: intent.target })) {
        return `${intent.target} cannot be reached`;
      }
      break;
    }
    case "gather":
      if (!hasRoom("meeting")) return `${building.name} has no meeting room right now`;
      for (const agent of intent.agents) {
        if (!reachable({ kind: "room", building: slug, agent, room: "meeting" })) return `the meeting room is not reachable for ${agent}`;
      }
      break;
  }
  return { slug };
}

/** The thing a prop tag of the building template stands for, in words; other tags read as themselves. */
const TAG_WORDS: Readonly<Record<string, string>> = {
  coffee: "coffee machine",
  rest: "bench",
  greenery: "plant",
  mail: "mailbox",
  planning: "planning table",
  review: "review pile",
  storage: "storage racks",
  dispatch: "dispatch pallets",
  gather: "meeting table",
};

/** One sentence for the text view, e.g. "cr-dev-1 goes to the coffee machine in the lobby". No speech. */
export function describeIntent(model: WorldModel, intent: Intent): string {
  const name = (key: AgentKey) => locate(model, key)?.agent.displayName ?? key;
  const words = (tag: string) => TAG_WORDS[tag] ?? tag.replace(/-/g, " ");
  switch (intent.kind) {
    case "goToProp":
      return `${name(intent.agent)} goes to the ${words(intent.tag)} in the ${roomLabel(intent.room).toLowerCase()}`;
    case "visitAgent":
      return `${name(intent.agent)} visits ${name(intent.target)}`;
    case "gather":
      return `${intent.agents.map(name).join(", ")} gather in the meeting room`;
    case "stay":
      return `${name(intent.agent)} stays where it is`;
  }
}

/** Tokens are estimated as characters / 4 everywhere (plan 7.3 "Measuring cost"). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface PlanInput {
  /** The building slug. */
  building: string;
  /** Zone labels with the tags of the props an agent could go to there. */
  zones: { room: RoomKind; label: string; props: string[] }[];
  /** Per agent: id, role, state in words, place. Never a title, a body or a message. */
  agents: { id: AgentKey; role: string; state: string; place: string }[];
}

/**
 * The compact input a director sees for one building (plan 7.3 "Input"), cut to `budget` tokens by dropping
 * agents from the end. `propTags` says which tags exist in which room; the app takes it from the engine.
 */
export function planInput(
  model: WorldModel,
  buildingSlug: string,
  propTags: (room: RoomKind) => readonly string[],
  budget = 1500,
): { input: PlanInput; json: string; tokens: number; truncated: boolean } | null {
  const building = model.buildings.find((b) => b.slug === buildingSlug);
  if (!building || building.archived) return null;
  const zones = building.rooms
    .filter((r) => r.present)
    .map((r) => ({ room: r.kind, label: r.label, props: [...propTags(r.kind)] }));
  const agents = building.agents
    .filter((a) => a.presence === "real")
    .map((a) => ({
      id: a.key,
      role: a.role,
      state: immovableReason({ agent: a, building }) ?? "idle",
      place: a.room ?? "none",
    }));
  const input: PlanInput = { building: building.slug, zones, agents };
  let json = JSON.stringify(input);
  let truncated = false;
  while (estimateTokens(json) > budget && input.agents.length > 0) {
    input.agents.pop();
    truncated = true;
    json = JSON.stringify(input);
  }
  return { input, json, tokens: estimateTokens(json), truncated };
}
