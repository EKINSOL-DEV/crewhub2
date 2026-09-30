/**
 * The hidden text view: every fact the scene shows as a sentence, grouped by section (Town, one
 * section per building, one per room). Inferences say so; statuses are always words.
 */
import { roomLabel } from "./rooms.ts";
import type {
  AgentPlacement,
  Building,
  LaneStatus,
  Posture,
  RoleId,
  RoleSource,
  Room,
  TextLine,
  TicketStatus,
  TransitPlace,
  WorkObject,
  WorldModel,
} from "./model.ts";

const STATUS_WORDS: Record<TicketStatus, string> = {
  backlog: "backlog",
  planned: "planned",
  in_progress: "in progress",
  review: "review",
  done: "done",
};

const LANE_WORDS: Record<LaneStatus, string> = {
  working: "working",
  idle: "idle",
  done: "done (herdr's pane status, not a finished ticket)",
  blocked: "blocked on a prompt",
  unknown: "status unknown",
};

const POSTURE_WORDS: Record<Posture, string> = {
  focused: "focused",
  relaxed: "relaxed",
  "raised-hand": "hand raised",
  greyed: "greyed out",
};

const LOOK_WORDS: Record<WorkObject["look"], string> = {
  folder: "folder",
  box: "cardboard box",
  "bug-crate": "crate with a bug stamp",
  envelope: "envelope with a question mark",
};

const ROLE_WORDS: Record<RoleId, string> = { lead: "lead", worker: "worker", analyst: "analyst", design: "design" };

function roleText(role: RoleId, source: RoleSource): string {
  if (source === "fact") return `${ROLE_WORDS[role]}, the project lead`;
  if (source === "override") return `${ROLE_WORDS[role]}, set by a person`;
  return `${ROLE_WORDS[role]}, from its name`;
}

export function buildingSection(building: Building): string {
  return `${building.name} (${building.key})`;
}

function clock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}

export function describeWorld(model: WorldModel): TextLine[] {
  const lines: TextLine[] = [];
  const add = (section: string, text: string, kind: TextLine["kind"] = "fact") => lines.push({ section, text, kind });
  const nameOf = new Map<string, string>();
  for (const building of model.buildings) nameOf.set(building.slug, buildingSection(building));
  const buildingName = (slug: string | null) => (slug ? (nameOf.get(slug) ?? slug) : "the town hall");

  if (model.mode === "demo") add("Town", "Demo mode: scripted data, no live crewhub-loops session", "demo");
  const { freshness } = model;
  if (freshness.teamTs === null) {
    add("Town", "No team snapshot yet: every agent's status is unknown.");
  } else if (freshness.stale) {
    add("Town", `The team snapshot is stale since ${freshness.teamTs}: every agent's status shows as unknown.`);
  } else {
    add("Town", `Team snapshot from ${freshness.teamTs}, ${freshness.ageSeconds ?? 0} s old.`);
  }
  const active = model.buildings.filter((b) => !b.archived);
  const archived = model.buildings.filter((b) => b.archived);
  add(
    "Town",
    `${active.length} ${active.length === 1 ? "building" : "buildings"} in project order: ${active.map(buildingSection).join(", ") || "none"}.`,
  );
  for (const building of archived) add("Town", `${buildingSection(building)} is boarded up: the project is archived.`);
  for (const agent of model.postOffice) add("Town", `${agent.displayName} is the postman, at the post office: ${agentState(agent)}.`);
  for (const agent of model.townHall) {
    add("Town", `${agent.displayName} is in the town hall, active in no building: ${agentState(agent)}.`);
    describeCaption("Town", agent, add);
  }
  for (const walk of model.deliveries) {
    add(
      "Town",
      `The postman carries a letter for ${walk.recipientId} (${walk.reason.replace("_", " ")}), ${walk.state}, to ${buildingName(walk.toBuilding)}.`,
    );
  }

  for (const building of model.buildings) describeBuilding(building, add, buildingName);
  return lines;
}

type Add = (section: string, text: string, kind?: TextLine["kind"]) => void;

function agentState(agent: AgentPlacement): string {
  return `${LANE_WORDS[agent.laneStatus]}, posture ${POSTURE_WORDS[agent.posture]}`;
}

function describeCaption(section: string, agent: AgentPlacement, add: Add): void {
  if (!agent.caption) return;
  const lasting = agent.caption.kind === "question" ? ", staying until its next line" : "";
  add(section, `${agent.displayName} says (${agent.caption.kind}, on ${agent.caption.ticketKey}${lasting}): "${agent.caption.text}"`);
}

function describeBuilding(building: Building, add: Add, buildingName: (slug: string | null) => string): void {
  const section = buildingSection(building);
  add(section, `${section}, led by ${building.lead.displayName}.${building.archived ? " Boarded up: archived." : ""}`);
  if (building.color || building.icon) {
    add(section, `Facade ${building.color ?? "plain"}, emblem ${building.icon ?? "none"}.`, "cosmetic");
  }
  const c = building.counts;
  add(section, `Tickets: ${c.backlog} backlog, ${c.planned} planned, ${c.in_progress} in progress, ${c.review} review, ${c.done} done.`);
  for (const m of building.milestones) {
    const target = m.targetDate ? `, target ${m.targetDate}` : "";
    const handoff = m.handedOffTo ? `, handed off to ${m.handedOffTo}` : "";
    add(section, `Milestone ${m.key} "${m.title}": ${m.state}${target}, ${m.ticketCount} open ${m.ticketCount === 1 ? "ticket" : "tickets"}${handoff}.`);
  }
  for (const r of building.releases) {
    const name = r.version ? `Release ${r.number} (${r.version})` : `Release ${r.number}`;
    add(
      section,
      r.publishedAt
        ? `${name}: published at ${r.publishedAt}; a banner hangs in the lobby and a trophy stands on the lead's desk.`
        : `${name}: ${r.state}.`,
    );
  }
  for (const beacon of building.beacons) add(section, `Amber beacon over the lead's office on ${beacon.ticketKey}: ${beacon.text}.`);
  if (building.archivedCount > 0) {
    add(section, `${building.archivedCount} ${building.archivedCount === 1 ? "ticket" : "tickets"} archived from Dispatch; the truck took them away and the lobby keeps the count.`);
  }

  for (const agent of building.agents) describeAgent(section, agent, add, buildingName);
  for (const room of building.rooms) describeRoom(building, room, add);
}

function describeAgent(section: string, agent: AgentPlacement, add: Add, buildingName: (slug: string | null) => string): void {
  const where = agent.room ? roomLabel(agent.room) : "the town";
  add(section, `${agent.displayName} is ${roleText(agent.role, agent.roleSource)}; home place in the ${where}.`, agent.roleSource === "name-rule" ? "inference" : "fact");
  if (agent.presence === "proxy") {
    add(section, `${agent.displayName} is a translucent proxy here: working in ${buildingName(agent.workingIn)}, inferred from recent events.`, "inference");
  } else {
    if (agent.locationInferred) {
      add(section, `${agent.displayName} is working in ${buildingName(agent.building)}, inferred from recent events.`, "inference");
    }
    add(section, `${agent.displayName}: ${agentState(agent)}.`);
    describeCaption(section, agent, add);
  }
  if (agent.deskTicketKey) add(section, `${agent.displayName} has ${agent.deskTicketKey} on its desk.`);
  for (const alert of agent.alerts) add(section, `${agent.displayName} is lit: ${alert}.`);
}

function describeRoom(building: Building, room: Room, add: Add): void {
  const section = `${buildingSection(building)}: ${roomLabel(room.kind)}`;
  if (room.kind === "meeting") {
    add(section, `${room.label}, inferred from recent comments and progress lines.`, "inference");
    return;
  }
  if (!room.present) add(section, `${room.label} is empty and dimmed: ${room.emptyLabel ?? "nobody here"}.`);
  if (room.kind === "lobby") {
    if (building.mailbox.length === 0) add(section, "Lobby with the project sign; the mailbox is empty.");
    for (const letter of building.mailbox) {
      add(section, `Flagged letter in the mailbox for ${letter.recipientId} (${letter.reason.replace("_", " ")}): ${letter.state}.`);
    }
  }
  const agents = building.agents.filter((a) => a.room === room.kind);
  if (agents.length > 0) add(section, `${room.label}: ${agents.map((a) => a.displayName).join(", ")}.`);
  const objects = building.objects.filter((o) => o.room === room.kind);
  const statusRoom = ["storage", "planning", "review", "dispatch"].includes(room.kind);
  if (objects.length === 0) {
    if (statusRoom) add(section, `${room.label}: no tickets.`);
    return;
  }
  if (statusRoom) add(section, `${room.label}: ${objects.length} ${objects.length === 1 ? "ticket" : "tickets"} in the pile.`);
  for (const object of objects) describeObject(section, object, building, add);
}

function placeWords(place: TransitPlace): string {
  if (place === "truck") return "the truck";
  const label = roomLabel(place);
  // "the planning room", "the lead's office"; Storage, Dispatch and the Lobby are names.
  if (!/room$|office$/.test(label)) return place === "lobby" ? "the lobby" : label;
  return `the ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

function describeObject(section: string, object: WorkObject, building: Building, add: Add): void {
  const parts = [`${object.key} "${object.title}": ${object.kind} as a ${LOOK_WORDS[object.look]}, ${STATUS_WORDS[object.status]}`];
  if (object.priorityTag) parts.push(`${object.priorityTag} priority tag`);
  if (object.blocked) parts.push("blocked, strapped shut");
  if (object.sealed) parts.push("held, sealed");
  if (object.stall) {
    const minutes = object.stall.quietMinutes === null ? "" : ` ${object.stall.quietMinutes} min`;
    const nudges = object.stall.nudges > 0 ? `, nudged ${object.stall.nudges} ${object.stall.nudges === 1 ? "time" : "times"}` : "";
    parts.push(
      object.stall.state === "stalled"
        ? `stalled, quiet${minutes}${nudges}, the desk lamp dimmed`
        : `needs attention, quiet${minutes}${nudges}`,
    );
  }
  if (object.nameTag) parts.push(`name tag ${object.nameTag}`);
  else if (object.waitingOnHuman) parts.push("waiting on a person");
  if (object.milestone) parts.push(`milestone band ${object.milestone.key}`);
  if (object.labels.length > 0) parts.push(`label stickers ${object.labels.join(", ")}`);
  if (object.labels.includes("prop")) parts.push("a star sticker: a prop request");
  if (object.status === "in_progress") {
    if (object.deskOf === null) parts.push("in the lead's inbox tray, no agent on it");
    else {
      const holder = building.agents.find((a) => a.key === object.deskOf)?.displayName ?? object.deskOf;
      parts.push(`on the desk of ${holder}`);
    }
  }
  add(section, `${parts.join("; ")}.`);
  if (object.deskInferred) add(section, `${object.key} is on that desk because the agent's status line names it: an inference.`, "inference");
  if (object.speechMarkUntil !== null) add(section, `${object.key} has a new comment (speech mark until ${clock(object.speechMarkUntil)}).`);
  if (object.celebrateUntil !== null) add(section, `${object.key} was just moved to done by a person.`);
  if (object.transit) {
    add(section, `${object.key} is in transit from ${placeWords(object.transit.fromRoom)} to ${placeWords(object.transit.toRoom)}: the ticket drone carries it.`, "cosmetic");
  }
}
