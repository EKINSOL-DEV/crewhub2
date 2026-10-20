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

/** A machine loops names (`ComputerOut`, CL-459): `this` is the loops machine, `remote` another. */
export interface ComputerFacts {
  name: string;
  kind: string;
}

/** The lane facts of `AgentDetailOut.lane` (contracts/agents.py `AgentLane` at 4cdcd383), read defensively from the wire. */
export interface AgentLaneFacts {
  kind: string | null;
  /** The herdr session and pane the lane lives in. */
  session: string | null;
  pane: string | null;
  lifecycle: string | null;
  restarting: boolean | null;
  /** The desired lane (the installation's choice). */
  model: string | null;
  effort: string | null;
  account: number | null;
  permissionMode: string | null;
  /** What was last seen running, when anything ever was; `source` says by the probe or from the start. */
  observed: { kind: string | null; model: string | null; effort: string | null; account: number | null; permissionMode: string | null; source: string | null } | null;
  observedAt: string | null;
  /** The observed values that differ from the desired ones, as loops names them; empty when never seen. */
  drift: string[];
}

/** What `GET /api/agents` says about a registered agent (null for a worker, or a lead missing from the list). */
export interface AgentLoopsFacts {
  role: string;
  isCrewhubLead: boolean;
  isCoordinator: boolean;
  isOperator: boolean;
  disabled: boolean;
  /** CL-314: a bot on another machine, with no lane and no pane. */
  external: boolean;
  /** CL-313: an external bot that only reads tickets. */
  reader: boolean;
  /** Deliveries it has not picked up for more than a day. */
  notPickedUp: number;
  /** CL-329: its tool says the login expired; since when. */
  needsLoginSince: string | null;
  /** When loops last saw its key; null: never. */
  lastSeenAt: string | null;
  herdrSession: string | null;
  computer: ComputerFacts | null;
  projects: { lead: ProjectRef[]; member: ProjectRef[] };
}

/** The team snapshot's session the agent's lane sits in, with the machine it names (CL-459). */
export interface AgentTeamSession {
  name: string;
  computer: ComputerFacts | null;
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
  /** Where the figure stands when it is in no building: the town hall or the post office. */
  civic: "town-hall" | "post-office" | null;
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
  /** The session that lane sits in, when `team` is set. */
  teamSession: AgentTeamSession | null;
  loops: AgentLoopsFacts | null;
  lane: AgentLaneFacts | null;
  recent: RecentFact[];
}

export const RECENT_LIMIT = 5;

const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const int = (value: unknown): number | null => (Number.isInteger(value) ? (value as number) : null);
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** Reads a `ComputerOut` without trusting it: a name is required, the kind is whatever string loops sent. */
export function computerFacts(computer: unknown): ComputerFacts | null {
  const c = record(computer);
  const name = c ? str(c.name) : null;
  return name ? { name, kind: str(c?.kind) ?? "unknown" } : null;
}

/** Reads `AgentOut.lane` (`AgentLane` on the wire, typed on the client since 4cdcd383) without trusting any field. */
export function laneFacts(lane: unknown): AgentLaneFacts | null {
  const l = record(lane);
  if (!l) return null;
  const desired = record(l.desired);
  const observed = record(l.observed);
  const drift = Array.isArray(l.drift) ? l.drift.filter((d): d is string => typeof d === "string") : [];
  return {
    kind: str(l.kind),
    session: str(l.session),
    pane: str(l.pane),
    lifecycle: str(l.lifecycle),
    restarting: bool(l.restarting),
    model: str(desired?.model),
    effort: str(desired?.effort),
    account: int(desired?.account),
    permissionMode: str(desired?.permissionMode ?? desired?.permission_mode),
    observed: observed
      ? {
          kind: str(observed.kind),
          model: str(observed.model),
          effort: str(observed.effort),
          account: int(observed.account),
          permissionMode: str(observed.permissionMode ?? observed.permission_mode),
          source: str(observed.source),
        }
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
    disabled: agent.disabled === true,
    external: agent.external === true,
    reader: agent.reader === true,
    notPickedUp: int(agent.notPickedUp) ?? 0,
    needsLoginSince: str(agent.needsLoginSince),
    lastSeenAt: agent.lastSeenAt,
    herdrSession: agent.herdrSession,
    computer: computerFacts(agent.computer),
    projects: { lead: agent.projects?.lead ?? [], member: agent.projects?.member ?? [] },
  };
}

/** The team session that holds the agent's lane (by its name), with its computer. */
function teamSessionOf(facts: Readonly<Facts>, name: string): AgentTeamSession | null {
  for (const session of facts.team?.sessions ?? []) {
    if (session.agents.some((a) => a.name === name)) return { name: session.name, computer: computerFacts(session.computer) };
  }
  return null;
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
    civic: real.building ? null : model.postOffice.some((a) => a.key === key) ? "post-office" : model.townHall.some((a) => a.key === key) ? "town-hall" : null,
    homes,
    work,
    workProject: project ? { slug: project.slug, key: project.key, name: project.name } : null,
    stateWords: agentStateWords(agent),
    progress: last ? { ts: last.line.ts, kind: last.line.kind, ticketKey: last.line.ticketKey, text: last.text } : null,
    team: entity.lane,
    teamSession: entity.lane ? teamSessionOf(facts, entity.name) : null,
    loops: loopsFacts(loops),
    lane: laneFacts(loops?.lane),
    recent: recentFacts(entity, facts),
  };
}
