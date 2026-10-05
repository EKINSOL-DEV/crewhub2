/**
 * Agents: who exists (registered principals and workers from the team snapshot), their roles
 * (plan 4.2), which buildings they belong to, their one real location (plan 4.4), their lane status
 * with freshness, the debounced posture (plan 7.1) and their progress caption.
 */
import { LANE_STATUSES } from "@crewhub/loops-client";
import type { ProjectOut, TeamAgent } from "@crewhub/loops-client";
import type { Facts, ProgressFact } from "./facts.ts";
import type { PresentationMemory } from "./memory.ts";
import type { AgentKey, AgentPlacement, LaneStatus, Posture, RoleId, RoleSource, RoomKind } from "./model.ts";

export const CAPTION_MS = 20_000;
export const QUIET_LOCATION_MS = 30 * 60_000;
export const DEBOUNCE_MS = 45_000;
export const DEBOUNCE_SNAPSHOTS = 2;

const TICKET_KEY = /\b([A-Z][A-Z0-9]{1,7})-([1-9][0-9]{0,8})\b/g;

export interface AgentEntity {
  key: AgentKey;
  name: string;
  displayName: string;
  registered: boolean;
  /** The loops agent role (`lead`, `router`, `probe`) of a registered agent. */
  loopsRole: string | null;
  /** A worker's lead (from the team snapshot). */
  lead: string | null;
  lane: TeamAgent | null;
  /** Active building slugs the agent belongs to, in project order. */
  homes: string[];
}

export interface ReduceContext {
  facts: Readonly<Facts>;
  memory: PresentationMemory;
  now: number;
  stale: boolean;
  roleOverrides: Record<AgentKey, RoleId>;
}

/** Ticket keys named in a line of text, in order. */
export function ticketKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...text.matchAll(TICKET_KEY)].map((match) => match[0]);
}

export function projectByTicketKey(facts: Readonly<Facts>, ticketKey: string): ProjectOut | undefined {
  const prefix = ticketKey.slice(0, ticketKey.lastIndexOf("-"));
  return Object.values(facts.projects).find((p) => p.key === prefix);
}

/** Registered agents and workers, with the buildings each belongs to. */
export function listAgents(facts: Readonly<Facts>): AgentEntity[] {
  const byKey = new Map<AgentKey, AgentEntity>();
  const lanesByName = new Map<string, TeamAgent>();
  for (const session of facts.team?.sessions ?? []) {
    for (const agent of session.agents) if (!lanesByName.has(agent.name)) lanesByName.set(agent.name, agent);
  }
  for (const agent of facts.agents) {
    if (agent.disabled || agent.role === "probe") continue;
    byKey.set(agent.id, {
      key: agent.id,
      name: agent.id,
      displayName: agent.displayName,
      registered: true,
      loopsRole: agent.role,
      lead: null,
      lane: lanesByName.get(agent.id) ?? null,
      homes: [],
    });
  }
  // A lead missing from GET /api/agents is still a registered principal (ProjectOut.lead).
  for (const slug of facts.order) {
    const lead = facts.projects[slug]?.lead;
    if (lead && !byKey.has(lead.id)) {
      byKey.set(lead.id, {
        key: lead.id,
        name: lead.id,
        displayName: lead.displayName,
        registered: true,
        loopsRole: "lead",
        lead: null,
        lane: lanesByName.get(lead.id) ?? null,
        homes: [],
      });
    }
  }
  const registered = new Set(byKey.keys());
  for (const session of facts.team?.sessions ?? []) {
    for (const agent of session.agents) {
      // A worker is an unregistered herdr agent tied to a registered lead; other panes are not placed.
      if (registered.has(agent.name) || !agent.lead) continue;
      const key = `${session.name}/${agent.name}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        key,
        name: agent.name,
        displayName: agent.name,
        registered: false,
        loopsRole: null,
        lead: agent.lead,
        lane: agent,
        homes: [],
      });
    }
  }

  // The projects an agent leads or is a member of (`AgentOut.projects`), as slugs.
  const projectsOf = new Map(
    facts.agents.map((a) => [a.id, new Set([...a.projects.lead, ...a.projects.member].map((p) => p.slug))]),
  );
  for (const slug of facts.order) {
    const project = facts.projects[slug];
    if (!project) continue;
    const holders = new Set<string>();
    for (const fact of Object.values(facts.cards)) {
      const assignee = fact.card.assignee;
      if (fact.slug === slug && fact.card.status === "in_progress" && assignee?.kind === "agent") holders.add(assignee.id);
    }
    for (const entity of byKey.values()) {
      if (entity.loopsRole === "router") continue;
      const belongs = entity.registered
        ? project.lead.id === entity.key ||
          holders.has(entity.key) ||
          projectsOf.get(entity.key)?.has(slug) === true
        : entity.lead === project.lead.id;
      if (belongs) entity.homes.push(slug);
    }
  }
  return [...byKey.values()];
}

/** The worker a progress line speaks for: `"<worker>: <line>"` with the lead as `agent`. */
export function lineWorker(line: ProgressFact, facts: Readonly<Facts>): { worker: string; text: string } | null {
  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*): ([\s\S]*)$/.exec(line.text);
  if (!match) return null;
  const [, prefix = "", rest = ""] = match;
  const stem = line.agent.endsWith("-lead") ? line.agent.slice(0, -"-lead".length) : null;
  const knownWorker = (facts.team?.sessions ?? []).some((s) =>
    s.agents.some((a) => a.name === prefix && a.lead === line.agent),
  );
  if (knownWorker || (stem !== null && prefix.startsWith(`${stem}-`))) return { worker: prefix, text: rest };
  return null;
}

/** Progress lines that belong to an agent, oldest first. */
export function linesOf(entity: AgentEntity, facts: Readonly<Facts>): { line: ProgressFact; text: string }[] {
  const out: { line: ProgressFact; text: string }[] = [];
  for (const line of facts.progress) {
    const worker = lineWorker(line, facts);
    if (entity.registered) {
      if (line.agent === entity.key && worker === null) out.push({ line, text: line.text });
    } else if (worker && line.agent === entity.lead && worker.worker === entity.name) {
      out.push({ line, text: worker.text });
    }
  }
  return out;
}

/** Plan 4.2, in order: override, the project lead (fact), then the name rules. */
export function roleOf(
  entity: AgentEntity,
  building: ProjectOut | null,
  overrides: Record<AgentKey, RoleId>,
): { role: RoleId; source: RoleSource } {
  const override = overrides[entity.key];
  if (override) return { role: override, source: "override" };
  if (building && building.lead.id === entity.key) return { role: "lead", source: "fact" };
  if (/^.+-design-\d+$/.test(entity.name)) return { role: "design", source: "name-rule" };
  if ((entity.registered && entity.name === "analyst") || /^.+-analyst-\d+$/.test(entity.name)) {
    return { role: "analyst", source: "name-rule" };
  }
  return { role: "worker", source: "name-rule" };
}

export function roomOfRole(role: RoleId): RoomKind {
  switch (role) {
    case "lead":
      return "lead-office";
    case "worker":
      return "workers";
    case "analyst":
      return "analyst";
    case "design":
      return "design";
  }
}

/** Plan 4.4: the project of the most recent active-work fact; after 30 quiet minutes it stays. */
export function realLocation(entity: AgentEntity, ctx: ReduceContext): string | null {
  const { facts, memory, now } = ctx;
  if (entity.homes.length === 0) return null;
  if (entity.homes.length === 1) return entity.homes[0] ?? null;
  let best: { slug: string; ts: number } | null = null;
  const consider = (slug: string | null | undefined, ts: number) => {
    if (slug && entity.homes.includes(slug) && (!best || ts > best.ts)) best = { slug, ts };
  };
  for (const { line } of linesOf(entity, facts)) {
    consider(line.slug ?? projectByTicketKey(facts, line.ticketKey)?.slug, line.ts);
  }
  for (const [ticketId, move] of Object.entries(facts.lastMoves)) {
    if (move.to !== "in_progress") continue;
    const assignee = facts.cards[ticketId]?.card.assignee;
    const holder = entity.registered ? entity.key : null;
    if (holder && assignee?.id === holder) consider(move.slug, move.ts);
  }
  if (!ctx.stale && entity.lane?.status === "working" && facts.teamReceivedAt !== null) {
    for (const key of ticketKeys(entity.lane.contextLine)) {
      const project = projectByTicketKey(facts, key);
      if (project) {
        consider(project.slug, facts.teamReceivedAt);
        break;
      }
    }
  }
  const found = best as { slug: string; ts: number } | null;
  const remembered = memory.locations[entity.key];
  let slug: string;
  if (found && now - found.ts <= QUIET_LOCATION_MS) slug = found.slug;
  else if (remembered && entity.homes.includes(remembered)) slug = remembered;
  else slug = found?.slug ?? entity.homes[0]!;
  memory.locations[entity.key] = slug;
  return slug;
}

export function laneStatusOf(entity: AgentEntity, stale: boolean): LaneStatus {
  if (stale || !entity.lane) return "unknown";
  const status = entity.lane.status;
  return (LANE_STATUSES as readonly string[]).includes(status) ? (status as LaneStatus) : "unknown";
}

export function postureOf(status: LaneStatus): Posture {
  switch (status) {
    case "working":
      return "focused";
    case "idle":
    case "done":
      return "relaxed";
    case "blocked":
      return "raised-hand";
    case "unknown":
      return "greyed";
  }
}

/**
 * Plan 7.1: a new lane status becomes the posture only after it held for two consecutive team
 * snapshots or 45 s. A stale or missing snapshot greys the agent at once: that is freshness, not flicker.
 */
export function debouncedStatus(key: AgentKey, status: LaneStatus, ctx: ReduceContext): LaneStatus {
  const { memory, now, facts } = ctx;
  const revision = facts.teamRevision;
  const lane = memory.lanes[key];
  if (!lane || ctx.stale) {
    memory.lanes[key] = { shown: status, pending: null, pendingSince: now, pendingSnapshots: 0, teamRevision: revision };
    return status;
  }
  if (status === lane.shown) {
    lane.pending = null;
    lane.pendingSnapshots = 0;
  } else if (status !== lane.pending) {
    lane.pending = status;
    lane.pendingSince = now;
    lane.pendingSnapshots = 1;
    lane.teamRevision = revision;
  } else {
    if (revision !== lane.teamRevision) {
      lane.pendingSnapshots += 1;
      lane.teamRevision = revision;
    }
    if (lane.pendingSnapshots >= DEBOUNCE_SNAPSHOTS || now - lane.pendingSince >= DEBOUNCE_MS) {
      lane.shown = status;
      lane.pending = null;
      lane.pendingSnapshots = 0;
    }
  }
  return lane.shown;
}

/** The latest progress line as a caption: fades after 20 s; a question stays until the next line. */
export function captionOf(entity: AgentEntity, ctx: ReduceContext): AgentPlacement["caption"] {
  const lines = linesOf(entity, ctx.facts);
  const last = lines[lines.length - 1];
  if (!last) return null;
  const until = last.line.kind === "question" ? null : last.line.ts + CAPTION_MS;
  if (until !== null && until <= ctx.now) return null;
  return { text: last.text.slice(0, 200), kind: last.line.kind, ticketKey: last.line.ticketKey, until };
}
