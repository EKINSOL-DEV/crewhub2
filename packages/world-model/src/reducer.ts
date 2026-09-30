/**
 * The world reducer: `Facts` and a small presentation memory in, a complete `WorldModel` out.
 * Pure: the input memory is not changed; the returned memory replaces it.
 */
import type { ProjectOut } from "@crewhub/loops-client";
import {
  captionOf,
  debouncedStatus,
  laneStatusOf,
  listAgents,
  postureOf,
  realLocation,
  roleOf,
  roomOfRole,
} from "./agents.ts";
import type { AgentEntity, ReduceContext } from "./agents.ts";
import type { Facts } from "./facts.ts";
import type { PresentationMemory } from "./memory.ts";
import type {
  AgentKey,
  AgentPlacement,
  Beacon,
  Building,
  DeliveryState,
  DeliveryWalk,
  Freshness,
  LaneStatus,
  Letter,
  MilestoneMark,
  ReleaseMark,
  RoleId,
  WorldModel,
} from "./model.ts";
import { finishFlights, flyObjects, startFlights } from "./flights.ts";
import { buildObjects } from "./objects.ts";
import type { BuiltObject, DeskHolder } from "./objects.ts";
import { buildRooms, meetingKey } from "./rooms.ts";

export const STALE_AFTER_S = 300;

export interface ReduceOptions {
  /** The source's clock, ms since the epoch. */
  now: number;
  mode: "demo" | "live";
  /** A person's role choice per agent (plan 4.2), stored by the app. */
  roleOverrides: Record<AgentKey, RoleId>;
}

export interface ReduceResult {
  model: WorldModel;
  memory: PresentationMemory;
}

interface AgentState {
  entity: AgentEntity;
  real: string | null;
  laneStatus: LaneStatus;
  posture: AgentPlacement["posture"];
  caption: AgentPlacement["caption"];
}

export function freshnessOf(facts: Readonly<Facts>, now: number): Freshness {
  const ts = facts.team?.ts ? facts.team.ts : null;
  const parsed = ts ? Date.parse(ts) : Number.NaN;
  if (ts === null || Number.isNaN(parsed)) return { teamTs: ts, ageSeconds: null, stale: true };
  // loops judges freshness by its own receive time, which GET /api/team does not expose; the probe's
  // `ts` against the source clock is the closest a client can get (team-and-projects.md).
  const ageSeconds = Math.max(0, Math.round((now - parsed) / 1000));
  return { teamTs: ts, ageSeconds, stale: ageSeconds > STALE_AFTER_S };
}

export function reduceWorld(facts: Readonly<Facts>, memory: PresentationMemory, options: ReduceOptions): ReduceResult {
  const { now } = options;
  const freshness = freshnessOf(facts, now);
  const ctx: ReduceContext = {
    facts,
    memory: structuredClone(memory),
    now,
    stale: freshness.stale,
    roleOverrides: options.roleOverrides,
  };

  startFlights(ctx);
  const entities = listAgents(facts);
  const states = new Map<AgentKey, AgentState>();
  for (const entity of entities) {
    const laneStatus = laneStatusOf(entity, ctx.stale);
    states.set(entity.key, {
      entity,
      real: realLocation(entity, ctx),
      laneStatus,
      posture: postureOf(debouncedStatus(entity.key, laneStatus, ctx)),
      caption: captionOf(entity, ctx),
    });
  }

  const buildings: Building[] = [];
  for (const slug of facts.order) {
    const project = facts.projects[slug];
    if (project) buildings.push(activeBuilding(project, states, entities, ctx));
  }
  for (const slug of facts.archivedOrder) {
    const project = facts.projects[slug];
    if (project) buildings.push(archivedBuilding(project, ctx));
  }

  finishFlights(ctx);

  const townHall: AgentPlacement[] = [];
  const postOffice: AgentPlacement[] = [];
  for (const state of states.values()) {
    const { entity } = state;
    if (entity.loopsRole === "router") postOffice.push(placement(state, null, ctx));
    else if (entity.registered && entity.homes.length === 0) townHall.push(placement(state, null, ctx));
  }

  const { walks, letters } = deliveries(facts, states);
  for (const building of buildings) building.mailbox = letters.get(building.slug) ?? [];

  const model: WorldModel = {
    now,
    mode: options.mode,
    cursor: facts.cursor,
    freshness,
    buildings,
    townHall: sortPlacements(townHall),
    postOffice: sortPlacements(postOffice),
    deliveries: walks,
  };
  return { model, memory: ctx.memory };
}

function placement(state: AgentState, project: ProjectOut | null, ctx: ReduceContext): AgentPlacement {
  const { entity } = state;
  const { role, source } = roleOf(entity, project, ctx.roleOverrides);
  const slug = project?.slug ?? null;
  const real = slug === null || state.real === slug;
  return {
    key: entity.key,
    name: entity.name,
    displayName: entity.displayName,
    registered: entity.registered,
    role,
    roleSource: source,
    building: slug,
    room: slug === null ? null : roomOfRole(role),
    presence: real ? "real" : "proxy",
    workingIn: real ? null : state.real,
    locationInferred: entity.homes.length > 1,
    laneStatus: state.laneStatus,
    posture: state.posture,
    caption: real ? state.caption : null,
    deskTicketKey: null,
    alerts: [],
  };
}

function activeBuilding(
  project: ProjectOut,
  states: Map<AgentKey, AgentState>,
  entities: AgentEntity[],
  ctx: ReduceContext,
): Building {
  const { facts } = ctx;
  const slug = project.slug;
  const agents = sortPlacements(
    [...states.values()].filter((s) => s.entity.homes.includes(slug)).map((s) => placement(s, project, ctx)),
    project.lead.id,
  );

  const desks: DeskHolder[] = agents.map((a) => {
    const entity = states.get(a.key)!.entity;
    return {
      key: a.key,
      room: a.room ?? "lead-office",
      worker: !entity.registered,
      lead: entity.lead,
      contextLine: entity.lane?.contextLine ?? null,
    };
  });
  const cards = Object.values(facts.cards)
    .filter((fact) => fact.slug === slug)
    .map((fact) => fact.card);
  const built = buildObjects(project, cards, desks, ctx);
  const toTruck = flyObjects(slug, built, (card) => buildObjects(project, [card], desks, ctx)[0]!, ctx);
  const objects = [...built, ...toTruck].map((b) => b.object);

  for (const agent of agents) {
    const own = built.filter((b) => b.object.deskOf === agent.key || (agent.registered && b.assigneeId === agent.key));
    agent.deskTicketKey = built.find((b) => b.object.deskOf === agent.key)?.object.key ?? null;
    agent.alerts = alertsOf(own);
  }

  const meeting = meetingKey(slug, project.lead.id, entities, ctx);
  return {
    slug,
    key: project.key,
    name: project.name,
    color: project.color ?? null,
    icon: project.icon ?? null,
    archived: false,
    counts: { ...project.counts },
    lead: { id: project.lead.id, displayName: project.lead.displayName },
    rooms: buildRooms(slug, agents, meeting, ctx),
    objects,
    agents,
    milestones: milestoneMarks(slug, cards, facts),
    releases: releaseMarks(slug, facts),
    beacons: beaconsOf(built, facts),
    mailbox: [],
    archivedCount: facts.archivedTickets[slug] ?? 0,
  };
}

function archivedBuilding(project: ProjectOut, ctx: ReduceContext): Building {
  const { facts } = ctx;
  return {
    slug: project.slug,
    key: project.key,
    name: project.name,
    color: project.color ?? null,
    icon: project.icon ?? null,
    archived: true,
    counts: { ...project.counts },
    lead: { id: project.lead.id, displayName: project.lead.displayName },
    rooms: [],
    objects: [],
    agents: [],
    milestones: milestoneMarks(project.slug, [], facts),
    releases: releaseMarks(project.slug, facts),
    beacons: [],
    mailbox: [],
    archivedCount: facts.archivedTickets[project.slug] ?? 0,
  };
}

const ROLE_ORDER: RoleId[] = ["lead", "worker", "analyst", "design"];

function sortPlacements(list: AgentPlacement[], leadId?: string): AgentPlacement[] {
  return list.sort(
    (a, b) =>
      Number(b.key === leadId) - Number(a.key === leadId) ||
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
      a.name.localeCompare(b.name),
  );
}

function alertsOf(own: BuiltObject[]): string[] {
  const alerts: string[] = [];
  for (const { object } of own) {
    if (object.stall) alerts.push(`${object.key} ${object.stall.state}`);
    if (object.waitingOnHuman) {
      alerts.push(object.nameTag ? `${object.key} waiting on ${object.nameTag}` : `${object.key} waiting on a person`);
    }
  }
  return alerts;
}

/** Plan 4.3: an amber beacon over the lead's office per `attention` stall. */
function beaconsOf(built: BuiltObject[], facts: Readonly<Facts>): Beacon[] {
  const beacons: Beacon[] = [];
  for (const { object, assigneeId } of built) {
    if (object.stall?.state !== "attention") continue;
    const open = facts.stalls[object.key];
    const agent = open?.blockedMember ?? open?.agent ?? assigneeId ?? "an agent";
    const minutes = object.stall.quietMinutes;
    beacons.push({
      ticketKey: object.key,
      agent,
      text: minutes === null ? `attention: ${agent} blocked` : `attention: ${agent} blocked ${minutes} min`,
    });
  }
  return beacons;
}

function milestoneMarks(slug: string, cards: { milestone?: { id: string } | null }[], facts: Readonly<Facts>): MilestoneMark[] {
  return (facts.milestones[slug] ?? [])
    .filter((m) => !m.archivedAt)
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      id: m.id,
      key: m.key,
      title: m.title,
      state: m.state,
      targetDate: m.targetDate ?? null,
      ticketCount: cards.filter((c) => c.milestone?.id === m.id).length,
      handedOffTo: facts.handoffs[m.id] ?? null,
    }));
}

function releaseMarks(slug: string, facts: Readonly<Facts>): ReleaseMark[] {
  return (facts.releases[slug] ?? [])
    .filter((r) => !r.deletedAt)
    .sort((a, b) => a.number - b.number)
    .map((r) => ({
      id: r.id,
      number: r.number,
      version: r.version ?? null,
      state: r.state,
      publishedAt: r.publishedAt ?? null,
    }));
}

const WALKING: string[] = ["pending", "claimed"];
const FLAGGED: string[] = ["uncertain", "unroutable"];

/** Plan 4.3: pending and claimed letters walk; forwarded hands over; uncertain or unroutable park flagged. */
function deliveries(
  facts: Readonly<Facts>,
  states: Map<AgentKey, AgentState>,
): { walks: DeliveryWalk[]; letters: Map<string, Letter[]> } {
  const walks: DeliveryWalk[] = [];
  const letters = new Map<string, Letter[]>();
  const active = new Set(facts.order);
  const sorted = Object.values(facts.deliveries).sort((a, b) => a.createdAt - b.createdAt);
  for (const delivery of sorted) {
    if (!delivery.recipientId) continue;
    const state = delivery.state as DeliveryState;
    const toBuilding = states.get(delivery.recipientId)?.real ?? null;
    if (WALKING.includes(state)) {
      walks.push({
        deliveryId: delivery.deliveryId,
        recipientId: delivery.recipientId,
        reason: delivery.reason ?? "",
        state,
        toBuilding,
        startedAt: delivery.createdAt,
      });
    } else if (FLAGGED.includes(state)) {
      const slug = delivery.slug && active.has(delivery.slug) ? delivery.slug : toBuilding;
      if (!slug) continue;
      const list = letters.get(slug) ?? [];
      list.push({
        deliveryId: delivery.deliveryId,
        recipientId: delivery.recipientId,
        reason: delivery.reason ?? "",
        state,
        flagged: true,
      });
      letters.set(slug, list);
    }
  }
  return { walks, letters };
}
