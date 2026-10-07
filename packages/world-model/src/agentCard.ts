/**
 * What the agent card knows about one agent: gathered from the world model (what the reducer placed) and the facts
 * behind it (the loops snapshot, the team snapshot, the recent event history). Pure and defensive: a fact that is
 * absent is null or an empty list, never guessed. The card's sections (apps/world) decide what to show from this.
 */
import type { AgentOut, ProjectRef, TeamAgent } from "@crewhub/loops-client";
import { linesOf, listAgents, projectByTicketKey, type AgentEntity } from "./agents.ts";
import { agentStateWords } from "./describe.ts";
import type { Facts } from "./facts.ts";
import type { AgentPlacement, Building, ProgressKind, WorkObject, WorldModel } from "./model.ts";

/** The latest progress line the agent wrote (a worker's line without its "<worker>: " prefix). */
export interface AgentProgress {
  ts: number;
  kind: ProgressKind;
  ticketKey: string;
  text: string;
}

/** One thing the facts say the agent did or received lately, newest first in `recent`. */
export interface RecentFact {
  ts: number;
  kind: "progress" | "move" | "comment" | "delivery";
  /** The ticket it concerns, when one does. */
  ticketKey: string | null;
  text: string;
}

/** The lane facts of `AgentDetailOut.lane` (contracts/agents.py `AgentLane`), read defensively from the wire. */
export interface AgentLaneFacts {
  kind: string | null;
  lifecycle: string | null;
  restarting: boolean | null;
  /** The desired lane (the installation's choice). */
  model: string | null;
  effort: string | null;
  permissionMode: string | null;
  /** What the probe last saw, when it ever did. */
  observed: { kind: string | null; model: string | null; effort: string | null; permissionMode: string | null } | null;
  observedAt: string | null;
  /** The observed values that differ from the desired ones, as loops names them. */
  drift: string[];
}

/** What `GET /api/agents` says about a registered agent (null for a worker, or a lead missing from the list). */
export interface AgentLoopsFacts {
  role: string;
  isCrewhubLead: boolean;
  isCoordinator: boolean;
  isOperator: boolean;
  lastSeenAt: string | null;
  herdrSession: string | null;
  projects: { lead: ProjectRef[]; member: ProjectRef[] };
}

export interface AgentCardFacts {
  key: string;
  name: string;
  displayName: string;
  registered: boolean;
  /** The real placement when the agent is in a building, else the proxy (or town hall) placement. */
  agent: AgentPlacement;
  /** The building the real figure is in, or null (the town hall, the post office). */
  building: Building | null;
  /** The buildings the agent belongs to, in project order. */
  homes: { slug: string; name: string; key: string }[];
  /** The ticket on its desk, else the in-progress ticket assigned to it. */
  work: WorkObject | null;
  /** The project of `work`, for the loops link. */
  workProject: { slug: string; key: string; name: string } | null;
  /** The sentence of the text view: lane status and posture, in words. */
  stateWords: string;
  progress: AgentProgress | null;
  /** The team snapshot's lane for this agent, when the probe saw one. */
  team: TeamAgent | null;
  loops: AgentLoopsFacts | null;
  lane: AgentLaneFacts | null;
  recent: RecentFact[];
}

export const RECENT_LIMIT = 5;

const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** Reads `AgentOut.lane` (unknown on the client, `AgentLane` on the wire) without trusting any field. */
export function laneFacts(lane: unknown): AgentLaneFacts | null {
  const l = record(lane);
  if (!l) return null;
  const desired = record(l.desired);
  const observed = record(l.observed);
  const drift = Array.isArray(l.drift) ? l.drift.filter((d): d is string => typeof d === "string") : [];
  return {
    kind: str(l.kind),
    lifecycle: str(l.lifecycle),
    restarting: bool(l.restarting),
    model: str(desired?.model),
    effort: str(desired?.effort),
    permissionMode: str(desired?.permissionMode ?? desired?.permission_mode),
    observed: observed
      ? { kind: str(observed.kind), model: str(observed.model), effort: str(observed.effort), permissionMode: str(observed.permissionMode ?? observed.permission_mode) }
      : null,
    observedAt: str(l.observedAt ?? l.observed_at),
    drift,
  };
}

function loopsFacts(agent: AgentOut | undefined): AgentLoopsFacts | null {
  if (!agent) return null;
  return {
    role: agent.role,
    isCrewhubLead: agent.isCrewhubLead === true,
    isCoordinator: agent.isCoordinator === true,
    isOperator: agent.isOperator === true,
    lastSeenAt: agent.lastSeenAt,
    herdrSession: agent.herdrSession,
    projects: { lead: agent.projects?.lead ?? [], member: agent.projects?.member ?? [] },
  };
}

function placementsOf(model: WorldModel, key: string): { agent: AgentPlacement; building: Building | null }[] {
  const found: { agent: AgentPlacement; building: Building | null }[] = [];
  for (const building of model.buildings) for (const agent of building.agents) if (agent.key === key) found.push({ agent, building });
  for (const agent of [...model.townHall, ...model.postOffice]) if (agent.key === key) found.push({ agent, building: null });
  return found;
}

/** The recent facts that name the agent, newest first, at most `RECENT_LIMIT`. */
export function recentFacts(entity: AgentEntity, facts: Readonly<Facts>): RecentFact[] {
  const out: RecentFact[] = [];
  for (const { line, text } of linesOf(entity, facts)) out.push({ ts: line.ts, kind: "progress", ticketKey: line.ticketKey, text: `${line.kind} on ${line.ticketKey}: ${text}` });
  // Moves and comments carry the loops actor; a worker never acts in loops under its own name.
  if (entity.registered) {
    for (const move of Object.values(facts.lastMoves))
      if (move.actorId === entity.key) out.push({ ts: move.ts, kind: "move", ticketKey: move.ticketKey, text: `moved ${move.ticketKey} from ${move.from.replace("_", " ")} to ${move.to.replace("_", " ")}` });
    for (const comment of facts.comments) if (comment.actorId === entity.key) out.push({ ts: comment.ts, kind: "comment", ticketKey: comment.ticketKey, text: `commented on ${comment.ticketKey}` });
    for (const delivery of Object.values(facts.deliveries))
      if (delivery.recipientId === entity.key)
        out.push({ ts: delivery.updatedAt, kind: "delivery", ticketKey: delivery.ticketKey, text: `a ${(delivery.reason ?? "delivery").replace(/_/g, " ")} for it, ${delivery.state}${delivery.ticketKey ? ` (${delivery.ticketKey})` : ""}` });
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, RECENT_LIMIT);
}

/**
 * Everything the card can say about `key`, or null when the model has no such agent. The agent's own placement
 * decides where it is and what it does; the facts add what loops and the probe know.
 */
export function agentCardFacts(model: WorldModel, facts: Readonly<Facts>, key: string): AgentCardFacts | null {
  const placements = placementsOf(model, key);
  if (!placements.length) return null;
  const real = placements.find((p) => p.agent.presence === "real") ?? placements[0]!;
  const agent = real.agent;
  const entity = listAgents(facts).find((e) => e.key === key) ?? {
    key,
    name: agent.name,
    displayName: agent.displayName,
    registered: agent.registered,
    loopsRole: null,
    lead: null,
    lane: null,
    homes: [],
  };
  const homes = placements.flatMap((p) => (p.building ? [{ slug: p.building.slug, name: p.building.name, key: p.building.key }] : []));
  for (const slug of entity.homes) {
    const b = model.buildings.find((x) => x.slug === slug);
    if (b && !homes.some((h) => h.slug === slug)) homes.push({ slug: b.slug, name: b.name, key: b.key });
  }
  // The ticket on its desk, else the in-progress ticket loops assigned to it (anywhere in the world).
  let work: WorkObject | null = null;
  if (real.building && agent.deskTicketKey) work = real.building.objects.find((o) => o.key === agent.deskTicketKey) ?? null;
  if (!work)
    for (const b of model.buildings) {
      work = b.objects.find((o) => o.deskOf === key && !o.deskInferred) ?? null;
      if (work) break;
    }
  const project = work ? projectByTicketKey(facts, work.key) : undefined;
  const lines = linesOf(entity, facts);
  const last = lines[lines.length - 1];
  const loops = facts.agents.find((a) => a.id === key);
  return {
    key,
    name: entity.name,
    displayName: agent.displayName,
    registered: entity.registered,
    agent,
    building: real.building,
    homes,
    work,
    workProject: project ? { slug: project.slug, key: project.key, name: project.name } : null,
    stateWords: agentStateWords(agent),
    progress: last ? { ts: last.line.ts, kind: last.line.kind, ticketKey: last.line.ticketKey, text: last.text } : null,
    team: entity.lane,
    loops: loopsFacts(loops),
    lane: laneFacts(loops?.lane),
    recent: recentFacts(entity, facts),
  };
}
