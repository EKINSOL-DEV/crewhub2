/** Hand-built world models for the director and `where` tests: only the fields those read matter. */
import type { AgentPlacement, Building, Room, RoomKind, WorkObject, WorldModel } from "../src/model.ts";

export function agent(key: string, extra: Partial<AgentPlacement> = {}): AgentPlacement {
  return {
    key,
    name: key,
    displayName: key,
    registered: true,
    role: "worker",
    roleSource: "name-rule",
    building: "cr",
    room: "workers",
    presence: "real",
    workingIn: null,
    locationInferred: false,
    laneStatus: "idle",
    posture: "relaxed",
    caption: null,
    deskTicketKey: null,
    alerts: [],
    ...extra,
  };
}

export function room(kind: RoomKind, slug = "cr"): Room {
  return { id: `${slug}:${kind}`, kind, label: kind, present: true, emptyLabel: null };
}

export function building(slug: string, agents: AgentPlacement[], extra: Partial<Building> = {}): Building {
  return {
    slug,
    key: slug.toUpperCase(),
    name: `${slug.toUpperCase()} product`,
    color: null,
    icon: null,
    archived: false,
    counts: { backlog: 0, planned: 0, in_progress: 0, review: 0, done: 0 },
    lead: { id: "lead", displayName: "lead" },
    rooms: (["lobby", "lead-office", "workers", "review"] as const).map((k) => room(k, slug)),
    objects: [],
    agents,
    milestones: [],
    releases: [],
    beacons: [],
    mailbox: [],
    archivedCount: 0,
    ...extra,
  };
}

export function object(key: string, extra: Partial<WorkObject> = {}): WorkObject {
  return {
    ticketId: `t-${key}`,
    key,
    title: key,
    kind: "task",
    look: "folder",
    status: "in_progress",
    room: "workers",
    deskOf: null,
    deskInferred: false,
    position: 1,
    priorityTag: null,
    blocked: false,
    sealed: false,
    stall: null,
    nameTag: null,
    waitingOnHuman: false,
    milestone: null,
    labels: [],
    speechMarkUntil: null,
    celebrateUntil: null,
    rejected: null,
    turnedDownUntil: null,
    transit: null,
    ...extra,
  };
}

export function world(buildings: Building[], extra: Partial<WorldModel> = {}): WorldModel {
  return {
    now: Date.parse("2026-10-01T08:00:00Z"),
    mode: "demo",
    cursor: 1,
    snapshots: 0,
    freshness: { teamTs: null, ageSeconds: null, stale: false },
    buildings,
    townHall: [],
    postOffice: [],
    deliveries: [],
    ...extra,
  };
}
