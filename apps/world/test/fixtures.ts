/* Small builders for world-model shapes, shared by the movement and navigation tests. */
import type { AgentPlacement, Building, RoomKind, WorkObject, WorldModel } from "@crewhub/world-model";

export const agent = (key: string, room: RoomKind, extra: Partial<AgentPlacement> = {}): AgentPlacement => ({
  key,
  name: key,
  displayName: key,
  registered: false,
  role: room === "lead-office" ? "lead" : room === "design" ? "design" : room === "analyst" ? "analyst" : "worker",
  roleSource: "name-rule",
  building: null,
  room,
  presence: "real",
  workingIn: null,
  locationInferred: false,
  laneStatus: "working",
  posture: "focused",
  caption: null,
  deskTicketKey: null,
  alerts: [],
  ...extra,
});

export const object = (id: string, room: RoomKind, extra: Partial<WorkObject> = {}): WorkObject => ({
  ticketId: id,
  key: `CR-${id}`,
  title: id,
  kind: "task",
  look: "folder",
  status: room === "storage" ? "backlog" : room === "planning" ? "planned" : room === "review" ? "review" : room === "dispatch" ? "done" : "in_progress",
  room,
  deskOf: null,
  deskInferred: false,
  position: 0,
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
});

/** A building with a lead plus `agents`; rooms follow the agents' rooms. */
export function building(slug: string, agents: AgentPlacement[] = [], objects: WorkObject[] = [], extraRooms: RoomKind[] = []): Building {
  const lead = `${slug}-lead`;
  const all = [agent(lead, "lead-office", { role: "lead" }), ...agents].map((a) => ({ ...a, building: slug }));
  const kinds = new Set<RoomKind>(["lobby", "lead-office", "storage", "planning", "review", "dispatch", ...extraRooms]);
  for (const a of all) if (a.room) kinds.add(a.room);
  return {
    slug,
    key: slug.toUpperCase(),
    name: slug,
    color: "coral",
    icon: "home",
    archived: false,
    counts: { backlog: 0, planned: 0, in_progress: 0, review: 0, done: 0 },
    lead: { id: lead, displayName: lead },
    rooms: [...kinds].map((kind) => ({ id: `${slug}:${kind}`, kind, label: kind, present: true, emptyLabel: null })),
    objects,
    agents: all,
    milestones: [],
    releases: [],
    beacons: [],
    mailbox: [],
    archivedCount: 0,
  };
}

export function world(buildings: Building[], extra: Partial<WorldModel> = {}): WorldModel {
  return {
    now: 1_000_000,
    mode: "demo",
    cursor: 1,
    snapshots: 1,
    freshness: { teamTs: null, ageSeconds: 0, stale: false },
    buildings,
    townHall: [],
    postOffice: [],
    deliveries: [],
    ...extra,
  };
}
