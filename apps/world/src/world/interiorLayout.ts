/* Where things go inside a building: desk slots for agents, slots for work objects (racks, the planning table, the
   review pile, dispatch pallets, desks and the lead's inbox tray), piles that turn into a pallet with a count, room
   navigation for the keyboard and one-line room summaries. Pure: no Three.js, no DOM. Positions are building cells
   (floats; x.5 is a cell centre). */
import type { Cell } from "@crewhub/world-engine";
import type { AgentKey, AgentPlacement, Building, RoomKind, WorkObject } from "@crewhub/world-model";
import { roomOf, type BuildingTemplate, type TemplateRoom } from "./buildingTemplate.ts";

export interface DeskSlot {
  agentKey: AgentKey;
  room: RoomKind;
  /** The desk prop's id in its room layout. */
  propId: string;
  /** "lead-desk" or "workdesk". */
  definitionId: string;
  /** The desk's centre, building cells. */
  desk: { x: number; z: number };
  /** The seat (the desk's approach cell), building cells. */
  seat: Cell;
}

const FOOTPRINTS: Record<string, { width: number; depth: number; seat: Cell }> = {
  workdesk: { width: 2, depth: 1, seat: { x: 1, z: -1 } },
  "lead-desk": { width: 3, depth: 2, seat: { x: 1, z: -1 } },
};

function desksOf(room: TemplateRoom) {
  return room.layout.props
    .filter((p) => p.definitionId in FOOTPRINTS)
    .map((p) => {
      const f = FOOTPRINTS[p.definitionId]!;
      return {
        propId: p.id,
        definitionId: p.definitionId,
        desk: { x: room.origin.x + p.cell.x + f.width / 2, z: room.origin.z + p.cell.z + f.depth / 2 },
        seat: { x: room.origin.x + p.cell.x + f.seat.x, z: room.origin.z + p.cell.z + f.seat.z },
      };
    });
}

/**
 * Desk slots by agent key: the project lead at the lead's desk, everyone else at the desks of its role room in key
 * order (deterministic: the same agents always sit at the same desks). Agents past a room's capacity get no desk; the
 * text view still lists them.
 */
export function assignDesks(building: Building, template: BuildingTemplate): Map<AgentKey, DeskSlot> {
  const slots = new Map<AgentKey, DeskSlot>();
  const byRoom = new Map<RoomKind, AgentPlacement[]>();
  for (const agent of building.agents) {
    if (!agent.room) continue;
    const list = byRoom.get(agent.room) ?? [];
    list.push(agent);
    byRoom.set(agent.room, list);
  }
  for (const [kind, agents] of byRoom) {
    const room = roomOf(template, kind);
    if (!room) continue;
    const desks = desksOf(room);
    const lead = desks.find((d) => d.definitionId === "lead-desk");
    const free = desks.filter((d) => d !== lead);
    const sorted = [...agents].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (const agent of sorted) {
      const desk = agent.key === building.lead.id && lead ? lead : free.shift();
      if (desk) slots.set(agent.key, { agentKey: agent.key, room: kind, ...desk });
    }
  }
  return slots;
}

export type Surface = "floor" | "rack" | "table" | "pile" | "pallet" | "desk" | "lead-desk";

export interface Placement {
  room: RoomKind;
  x: number;
  z: number;
  /** What the object stands on; the renderer adds that surface's height. */
  surface: Surface;
  /** Objects below it in the same stack. */
  level: number;
  /** Stack identity: objects with the same slot stack on each other. */
  slot: string;
}

export interface PalletMark {
  room: RoomKind;
  x: number;
  z: number;
  /** How many tickets are wrapped on the pallet. */
  count: number;
}

export interface ObjectLayout {
  /** Where each object is now, by ticket id; objects wrapped on a pallet have none. */
  placements: Map<string, Placement>;
  /** Where each flying object lands (by ticket id); none for a flight to the truck. */
  targets: Map<string, Placement>;
  pallets: PalletMark[];
}

interface PileRoom {
  /** Slot centres in room cells, in fill order; each stacks up to `height`. */
  slots: { x: number; z: number }[];
  height: number;
  surface: Surface;
  /** Where the pallet stands when the pile overflows, room cells. */
  pallet: { x: number; z: number };
}

/** Status rooms never grow with their piles: a fixed stack height per room, then a pallet with a count. */
export const PILE_ROOMS: Record<"storage" | "planning" | "review" | "dispatch", PileRoom> = {
  // Four racks along the back wall and two in front (buildingTemplate), two slots each.
  storage: {
    slots: [0, 2, 4, 6]
      .flatMap((x) => [
        { x: x + 0.5, z: 0.5 },
        { x: x + 1.5, z: 0.5 },
      ])
      .concat(
        [0, 2].flatMap((x) => [
          { x: x + 0.5, z: 3.5 },
          { x: x + 1.5, z: 3.5 },
        ]),
      ),
    height: 3,
    surface: "rack",
    pallet: { x: 7.5, z: 5.5 },
  },
  // The planning table's east end, by the door to the lead's office, is the front: next up lies there.
  planning: { slots: [5.5, 4.5, 3.5, 2.5].map((x) => ({ x, z: 4.5 })), height: 3, surface: "table", pallet: { x: 7.5, z: 5.5 } },
  review: {
    slots: [3.5, 4.5, 5.5].flatMap((x) => [
      { x, z: 2.5 },
      { x, z: 3.5 },
    ]),
    height: 4,
    surface: "pile",
    pallet: { x: 7.5, z: 4.5 },
  },
  dispatch: {
    slots: [1, 4].flatMap((x) => [
      { x: x + 0.5, z: 3.5 },
      { x: x + 1.5, z: 3.5 },
      { x: x + 0.5, z: 4.5 },
      { x: x + 1.5, z: 4.5 },
    ]),
    height: 3,
    surface: "pallet",
    pallet: { x: 7.5, z: 4.5 },
  },
};

export function pileCapacity(kind: keyof typeof PILE_ROOMS): number {
  const room = PILE_ROOMS[kind];
  return room.slots.length * room.height;
}

const isPileRoom = (kind: RoomKind): kind is keyof typeof PILE_ROOMS => kind in PILE_ROOMS;

/**
 * Places every object: status rooms fill their slots in board order (`position`), stack up to the room's height and
 * put the rest on a pallet with a count; in-progress objects lie on their agent's desk, or in the lead's inbox tray
 * when no agent (or no desk) holds them. A flying object also gets the slot it will land in.
 */
export function placeObjects(building: Building, template: BuildingTemplate, desks: Map<AgentKey, DeskSlot>): ObjectLayout {
  const placements = new Map<string, Placement>();
  const targets = new Map<string, Placement>();
  const pallets: PalletMark[] = [];
  const leadDesk = desks.get(building.lead.id);
  const stackCount = new Map<string, number>();

  const byRoom = new Map<RoomKind, WorkObject[]>();
  for (const object of building.objects) {
    const list = byRoom.get(object.room) ?? [];
    list.push(object);
    byRoom.set(object.room, list);
  }

  const onDesk = (deskOf: AgentKey | null, room: RoomKind): Placement => {
    const own = deskOf ? desks.get(deskOf) : undefined;
    const slot = own ?? leadDesk;
    if (!slot) {
      const r = roomOf(template, room);
      const x = r ? r.origin.x + r.layout.grid.width / 2 : 0,
        z = r ? r.origin.z + r.layout.grid.depth / 2 : 0;
      const key = `floor:${room}`;
      const level = stackCount.get(key) ?? 0;
      stackCount.set(key, level + 1);
      return { room, x, z, surface: "floor", level, slot: key };
    }
    // The lead's own tickets lie on its desk; tickets without an agent (or a desk) go to the inbox tray.
    const inbox = !own;
    const key = inbox ? "inbox" : `desk:${slot.agentKey}`;
    const level = stackCount.get(key) ?? 0;
    stackCount.set(key, level + 1);
    const x = inbox ? slot.desk.x + 0.75 : slot.desk.x + (slot.definitionId === "lead-desk" ? -0.5 : 0.35);
    return { room: slot.room, x, z: slot.desk.z, surface: slot.definitionId === "lead-desk" ? "lead-desk" : "desk", level, slot: key };
  };

  for (const [kind, objects] of byRoom) {
    if (!isPileRoom(kind)) {
      for (const o of objects) placements.set(o.ticketId, onDesk(o.deskOf, kind));
      continue;
    }
    const room = roomOf(template, kind);
    if (!room) continue;
    const pile = PILE_ROOMS[kind];
    const sorted = [...objects].sort((a, b) => a.position - b.position || a.key.localeCompare(b.key));
    const capacity = pileCapacity(kind);
    // When the pile overflows, the last slot's worth goes to the pallet with everything past it.
    const shown = sorted.length > capacity ? capacity - pile.height : sorted.length;
    sorted.forEach((o, i) => {
      if (i >= shown) return;
      const s = pile.slots[i % pile.slots.length]!;
      const slot = `${kind}:${i % pile.slots.length}`;
      placements.set(o.ticketId, { room: kind, x: room.origin.x + s.x, z: room.origin.z + s.z, surface: pile.surface, level: Math.floor(i / pile.slots.length), slot });
      stackCount.set(slot, Math.floor(i / pile.slots.length) + 1);
    });
    if (sorted.length > shown) {
      pallets.push({ room: kind, x: room.origin.x + pile.pallet.x, z: room.origin.z + pile.pallet.z, count: sorted.length - shown });
    }
  }

  // Landing slots for flights: on top of what is already there.
  for (const object of building.objects) {
    const transit = object.transit;
    if (!transit || transit.toRoom === "truck") continue;
    const kind = transit.toRoom;
    if (!isPileRoom(kind)) {
      targets.set(object.ticketId, onDesk(transit.toDeskOf, kind));
      continue;
    }
    const room = roomOf(template, kind);
    if (!room) continue;
    const pile = PILE_ROOMS[kind];
    // The least stacked slot, first in fill order.
    let best = 0;
    let bestLevel = Number.POSITIVE_INFINITY;
    pile.slots.forEach((_, i) => {
      const level = stackCount.get(`${kind}:${i}`) ?? 0;
      if (level < bestLevel) {
        best = i;
        bestLevel = level;
      }
    });
    const slot = `${kind}:${best}`;
    const s = pile.slots[best]!;
    const level = Math.min(bestLevel, pile.height);
    stackCount.set(slot, level + 1);
    targets.set(object.ticketId, { room: kind, x: room.origin.x + s.x, z: room.origin.z + s.z, surface: pile.surface, level, slot });
  }
  return { placements, targets, pallets };
}

/** The room centre, building cells. */
export function roomCentre(room: TemplateRoom): { x: number; z: number } {
  return { x: room.origin.x + room.layout.grid.width / 2, z: room.origin.z + room.layout.grid.depth / 2 };
}

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Arrow-key focus between rooms: the nearest room whose centre lies in the arrow's direction (screen up is north in
 * the home view), preferring rooms straight ahead. Returns `from` when nothing lies that way.
 */
export function roomNeighbor(template: BuildingTemplate, from: RoomKind, key: string): RoomKind {
  const direction = DIRECTIONS[key];
  const start = roomOf(template, from);
  if (!direction || !start) return from;
  const a = roomCentre(start);
  let best: { kind: RoomKind; score: number } | null = null;
  for (const room of template.rooms) {
    if (room.kind === from) continue;
    const b = roomCentre(room);
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const along = dx * direction[0] + dz * direction[1];
    if (along <= 0.5) continue;
    const across = Math.abs(dx * direction[1] - dz * direction[0]);
    const score = along + across * 2;
    if (!best || score < best.score) best = { kind: room.kind, score };
  }
  return best?.kind ?? from;
}

/** Room order for Home/End and the first focus: the lobby first (where you come in). */
export function firstRoom(template: BuildingTemplate): RoomKind {
  return template.rooms.find((r) => r.kind === "lobby")?.kind ?? template.rooms[0]?.kind ?? "lobby";
}

const ROOM_WORDS: Record<RoomKind, string> = {
  lobby: "Lobby",
  "lead-office": "Lead's office",
  workers: "Workers room",
  analyst: "Analyst room",
  design: "Design room",
  storage: "Storage",
  planning: "Planning room",
  review: "Review room",
  dispatch: "Dispatch",
  meeting: "Meeting room",
};

/** One word per room for the crowded phone layout. */
const ROOM_SHORT: Record<RoomKind, string> = {
  lobby: "Lobby",
  "lead-office": "Lead",
  workers: "Workers",
  analyst: "Analyst",
  design: "Design",
  storage: "Storage",
  planning: "Planning",
  review: "Review",
  dispatch: "Dispatch",
  meeting: "Meeting",
};
export const shortRoomName = (kind: RoomKind): string => ROOM_SHORT[kind];

export function roomName(building: Building, kind: RoomKind): string {
  return building.rooms.find((r) => r.kind === kind)?.label ?? ROOM_WORDS[kind];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One line for the polite status line when a room gets the keyboard focus. */
export function roomSummary(building: Building, kind: RoomKind, laneWords: (agent: AgentPlacement) => string): string {
  const name = roomName(building, kind);
  const room = building.rooms.find((r) => r.kind === kind);
  if (room && !room.present) return `${name}: empty and dimmed, ${room.emptyLabel ?? "nobody here"}.`;
  const parts: string[] = [];
  const objects = building.objects.filter((o) => o.room === kind);
  const agents = building.agents.filter((a) => a.room === kind);
  if (agents.length) parts.push(agents.map((a) => `${a.displayName} ${a.presence === "proxy" ? "(a proxy)" : laneWords(a)}`).join(", "));
  if (isPileRoom(kind)) parts.push(objects.length ? plural(objects.length, "ticket") : "no tickets");
  else if (objects.length) parts.push(`${plural(objects.length, "ticket")} on the desks`);
  const waiting = objects.filter((o) => o.nameTag || o.waitingOnHuman).length;
  if (waiting) parts.push(`${waiting} waiting on a person`);
  const stalled = objects.filter((o) => o.stall).length;
  if (stalled) parts.push(plural(stalled, "stalled ticket"));
  if (kind === "lead-office") for (const beacon of building.beacons) parts.push(`beacon: ${beacon.text}`);
  if (kind === "lobby") {
    if (building.mailbox.length) parts.push(plural(building.mailbox.length, "flagged letter"));
    if (building.archivedCount) parts.push(`${building.archivedCount} archived`);
    const published = building.releases.filter((r) => r.publishedAt);
    for (const r of published) parts.push(`release ${r.version ?? r.number} published`);
  }
  if (kind === "dispatch" && building.archivedCount) parts.push(`the truck took ${building.archivedCount} away`);
  return `${name}: ${parts.join(", ") || "quiet"}.`;
}
