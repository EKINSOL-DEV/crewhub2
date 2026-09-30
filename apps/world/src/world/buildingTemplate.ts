/* The building template: a building's rooms as grid-engine layouts, joined by doors. Pure data and functions (no
   Three.js, no DOM), so it runs under `node --test` and phase 4's portal graph can take the layouts and doors as they
   are.

   Building cells: x east, z south (towards the home camera). The origin (0, 0) is the north-west corner and never moves:
   role rooms grow east in 4 x 4 modules (TOWN_PLAN section 4), so old cells keep their place.

     x:  0      6        14
     z0  +------+--------+--------+
         |stor- |meeting | workers|   west: status rooms, fixed size; they never grow with their piles
     z5  +------+--------+ (2 rows|   centre: meeting room (when present), the lead's office, the lobby
         |plan- | lead's |  of    |   east: role rooms, one to two module columns wide
     z10 +------+ office +--------+
         |review|        |analyst |
     z13 |      +--------+--------+
     z15 +------+ lobby  | design |
         |dis-  |        +--------+
     z20 +------+---[ ]--+           the lobby's south door is the building entrance
*/
import type { Cell, Definitions, WorldLayout, WorldProp } from "@crewhub/world-engine";
import type { Building, RoomKind } from "@crewhub/world-model";

/** World units per building cell: the Greenhouse grid. */
export const BUILDING_CELL = 0.6;
/** Side of a role-room growth module, in cells. */
export const MODULE = 4;
/** A role room is one or two module columns wide. */
export const MAX_MODULE_COLUMNS = 2;
/** Desks per 4 x 4 module: two staggered workstations with their seats. */
export const DESKS_PER_MODULE = 2;

const WEST = 6;
const CENTRE = 8;
const EAST_X = WEST + CENTRE;
/** The widest and deepest a building gets, in cells; the town reserves a plot for it. */
export const MAX_WIDTH = EAST_X + MODULE * MAX_MODULE_COLUMNS;
export const DEPTH = 20;

export type RoleRoom = "workers" | "analyst" | "design";
export const ROLE_ROOMS: readonly RoleRoom[] = ["workers", "analyst", "design"];
export const STATUS_ROOMS = ["storage", "planning", "review", "dispatch"] as const;

export interface TemplateRoom {
  kind: RoomKind;
  /** The room's north-west cell in building cells. */
  origin: Cell;
  /** The room's own interior grid and furniture; `entrance` is its first door cell. */
  layout: WorldLayout;
}

export interface DoorSide {
  room: RoomKind | "town";
  /** A cell of that room's own grid, on its edge (for "town": the building cell just outside). */
  cell: Cell;
}

export interface TemplateDoor {
  id: string;
  a: DoorSide;
  b: DoorSide;
}

export interface BuildingTemplate {
  /** In building cells. */
  size: { width: number; depth: number };
  rooms: TemplateRoom[];
  doors: TemplateDoor[];
}

/* Interior furniture, in building cells. Collision comes from these footprints, never from meshes. */
export const interiorDefinitions: Definitions = {
  workdesk: {
    id: "workdesk",
    label: "Workstation",
    footprint: { width: 2, depth: 1 },
    blocksMovement: true,
    tags: ["work", "desk"],
    // The seat is north of the desk: the agent faces south, over the desk, towards the camera.
    approaches: [{ x: 1, z: -1 }],
  },
  "lead-desk": {
    id: "lead-desk",
    label: "The lead's desk with the inbox tray",
    footprint: { width: 3, depth: 2 },
    blocksMovement: true,
    tags: ["work", "desk", "inbox"],
    approaches: [{ x: 1, z: -1 }],
  },
  rack: {
    id: "rack",
    label: "Storage rack",
    footprint: { width: 2, depth: 1 },
    blocksMovement: true,
    tags: ["storage", "pile"],
    approaches: [{ x: 0, z: 1 }],
  },
  "planning-table": {
    id: "planning-table",
    label: "Planning table",
    footprint: { width: 4, depth: 1 },
    blocksMovement: true,
    tags: ["planning", "pile"],
    approaches: [{ x: 3, z: -1 }],
  },
  "review-pile": {
    id: "review-pile",
    label: "Review pile",
    footprint: { width: 3, depth: 2 },
    blocksMovement: true,
    tags: ["review", "pile"],
    approaches: [{ x: 1, z: 2 }],
  },
  pallet: {
    id: "pallet",
    label: "Dispatch pallet",
    footprint: { width: 2, depth: 2 },
    blocksMovement: true,
    tags: ["dispatch", "pile"],
    approaches: [{ x: 0, z: -1 }],
  },
  mailbox: {
    id: "mailbox",
    label: "Mailbox",
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    tags: ["mail"],
    approaches: [{ x: 0, z: -1 }],
  },
  "meeting-table": {
    id: "meeting-table",
    label: "Meeting table",
    footprint: { width: 4, depth: 2 },
    blocksMovement: true,
    tags: ["gather"],
    approaches: [{ x: 0, z: -1 }],
  },
  bench: {
    id: "bench",
    label: "Oak bench",
    footprint: { width: 3, depth: 1 },
    blocksMovement: true,
    tags: ["rest"],
    approaches: [{ x: 1, z: -1 }],
  },
  plant: {
    id: "plant",
    label: "Bird of paradise",
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    tags: ["decoration", "greenery"],
    approaches: [],
  },
};

const prop = (id: string, definitionId: string, x: number, z: number): WorldProp => ({ id, definitionId, cell: { x, z }, rotation: 0 });

function layout(width: number, depth: number, entrance: Cell, props: WorldProp[]): WorldLayout {
  return { version: 1, grid: { width, depth, cellSize: BUILDING_CELL }, props, entrance };
}

/** Workstations of a role room: two per module, staggered so every seat and door stays reachable. */
function roleDesks(columns: number, rows: number): WorldProp[] {
  const desks: WorldProp[] = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const x = column * MODULE,
        z = row * MODULE;
      desks.push(prop(`desk-${desks.length}`, "workdesk", x, z + 1));
      desks.push(prop(`desk-${desks.length}`, "workdesk", x + 2, z + 3));
    }
  // Slot order: row by row, so the first desks are nearest the door.
  return desks;
}

/** Module rows per role room: the workers room is two modules deep, the analyst and design rooms one. */
const ROLE_ROWS: Record<RoleRoom, number> = { workers: 2, analyst: 1, design: 1 };
const ROLE_Z: Record<RoleRoom, number> = { workers: 0, analyst: 8, design: 12 };
/** Each role room's door on its west edge (its own cells), and the matching cell of the neighbour. */
const ROLE_DOORS: Record<RoleRoom, { own: Cell; room: RoomKind; other: Cell }> = {
  workers: { own: { x: 0, z: 6 }, room: "lead-office", other: { x: CENTRE - 1, z: 1 } },
  analyst: { own: { x: 0, z: 2 }, room: "lead-office", other: { x: CENTRE - 1, z: 5 } },
  design: { own: { x: 0, z: 2 }, room: "lobby", other: { x: CENTRE - 1, z: 1 } },
};

/** Role-room capacity in desks for a number of module columns. */
export function roleCapacity(room: RoleRoom, columns: number): number {
  return columns * ROLE_ROWS[room] * DESKS_PER_MODULE;
}

/** Module columns a role room needs for `agents` desks: at least one, at most two. */
export function roleColumns(room: RoleRoom, agents: number): number {
  const perColumn = ROLE_ROWS[room] * DESKS_PER_MODULE;
  return Math.min(MAX_MODULE_COLUMNS, Math.max(1, Math.ceil(agents / perColumn)));
}

/** The side desks in the lead's office, for agents a person set to `lead` (and a second lead lane). */
const OFFICE_SIDE_DESKS = 2;

/**
 * The template for a building. Deterministic: the same building gives the same template. The lobby, the lead's
 * office and the four status rooms always exist (an archived building keeps its shell); a role room exists once the
 * model has it (an agent of that role has been present); the meeting room only while the model infers a meeting.
 */
export function buildingTemplate(building: Building): BuildingTemplate {
  const kinds = new Set(building.rooms.map((r) => r.kind));
  const rooms: TemplateRoom[] = [];
  const doors: TemplateDoor[] = [];
  const door = (id: string, a: DoorSide, b: DoorSide) => doors.push({ id, a, b });

  // Centre column.
  rooms.push({
    kind: "lobby",
    origin: { x: WEST, z: 13 },
    layout: layout(CENTRE, 7, { x: 4, z: 6 }, [prop("mailbox", "mailbox", 1, 5), prop("bench", "bench", 5, 5), prop("plant", "plant", 7, 3)]),
  });
  rooms.push({
    kind: "lead-office",
    origin: { x: WEST, z: 5 },
    layout: layout(CENTRE, 8, { x: 4, z: 7 }, [
      prop("lead-desk", "lead-desk", 3, 2),
      prop("side-desk-0", "workdesk", 1, 5),
      prop("side-desk-1", "workdesk", 5, 5),
      prop("plant", "plant", 7, 7),
    ]),
  });
  door("entrance", { room: "lobby", cell: { x: 4, z: 6 } }, { room: "town", cell: { x: WEST + 4, z: DEPTH } });
  door("lobby-office", { room: "lobby", cell: { x: 4, z: 0 } }, { room: "lead-office", cell: { x: 4, z: 7 } });
  if (kinds.has("meeting")) {
    rooms.push({ kind: "meeting", origin: { x: WEST, z: 0 }, layout: layout(CENTRE, 5, { x: 6, z: 4 }, [prop("table", "meeting-table", 2, 1)]) });
    door("office-meeting", { room: "lead-office", cell: { x: 6, z: 0 } }, { room: "meeting", cell: { x: 6, z: 4 } });
  }

  // West column: the work flows north to south, storage to dispatch.
  rooms.push({
    kind: "storage",
    origin: { x: 0, z: 0 },
    layout: layout(WEST, 5, { x: 3, z: 4 }, [
      prop("rack-0", "rack", 0, 0),
      prop("rack-1", "rack", 2, 0),
      prop("rack-2", "rack", 4, 0),
      prop("rack-3", "rack", 0, 2),
      prop("rack-4", "rack", 2, 2),
    ]),
  });
  rooms.push({ kind: "planning", origin: { x: 0, z: 5 }, layout: layout(WEST, 5, { x: 5, z: 1 }, [prop("table", "planning-table", 0, 3)]) });
  rooms.push({ kind: "review", origin: { x: 0, z: 10 }, layout: layout(WEST, 5, { x: 5, z: 1 }, [prop("pile", "review-pile", 1, 1)]) });
  rooms.push({
    kind: "dispatch",
    origin: { x: 0, z: 15 },
    layout: layout(WEST, 5, { x: 5, z: 1 }, [prop("pallet-0", "pallet", 0, 2), prop("pallet-1", "pallet", 2, 2)]),
  });
  door("storage-planning", { room: "storage", cell: { x: 3, z: 4 } }, { room: "planning", cell: { x: 3, z: 0 } });
  door("office-planning", { room: "lead-office", cell: { x: 0, z: 1 } }, { room: "planning", cell: { x: WEST - 1, z: 1 } });
  door("office-review", { room: "lead-office", cell: { x: 0, z: 6 } }, { room: "review", cell: { x: WEST - 1, z: 1 } });
  door("review-dispatch", { room: "review", cell: { x: 3, z: 4 } }, { room: "dispatch", cell: { x: 3, z: 0 } });
  door("lobby-dispatch", { room: "lobby", cell: { x: 0, z: 3 } }, { room: "dispatch", cell: { x: WEST - 1, z: 1 } });

  // East column: role rooms, grown by the desks they need.
  let width = EAST_X;
  for (const kind of ROLE_ROOMS) {
    if (!kinds.has(kind)) continue;
    const columns = roleColumns(kind, deskCount(building, kind));
    const rows = ROLE_ROWS[kind];
    const d = ROLE_DOORS[kind];
    rooms.push({ kind, origin: { x: EAST_X, z: ROLE_Z[kind] }, layout: layout(columns * MODULE, rows * MODULE, d.own, roleDesks(columns, rows)) });
    door(`${d.room}-${kind}`, { room: d.room, cell: d.other }, { room: kind, cell: d.own });
    width = Math.max(width, EAST_X + columns * MODULE);
  }
  return { size: { width, depth: DEPTH }, rooms, doors };
}

/** How many desks a room needs: every agent (real or proxy) whose home place is that room. */
export function deskCount(building: Building, room: RoomKind): number {
  return building.agents.filter((a) => a.room === room && a.key !== building.lead.id).length;
}

export function officeSideDesks(): number {
  return OFFICE_SIDE_DESKS;
}

export function roomOf(template: BuildingTemplate, kind: RoomKind): TemplateRoom | undefined {
  return template.rooms.find((r) => r.kind === kind);
}

/** A room cell in building cells. */
export function toBuilding(room: TemplateRoom, cell: Cell): Cell {
  return { x: room.origin.x + cell.x, z: room.origin.z + cell.z };
}

export interface WallRun {
  /** From (x1, z1) to (x2, z2) along one grid line, in building cells; one of the axes is constant. */
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  /** The building's outline (north and west are the tall back walls) or a wall between rooms. */
  side: "north" | "west" | "south" | "east" | "inner";
}

/**
 * The walls: every room edge, drawn once, with a gap where a door crosses it; unit segments on one line merge into
 * runs. An edge between a room and nothing (an absent role or meeting room) is an outer wall.
 */
export function wallRuns(template: BuildingTemplate): WallRun[] {
  const owner = new Map<string, RoomKind>();
  for (const room of template.rooms)
    for (let z = 0; z < room.layout.grid.depth; z++)
      for (let x = 0; x < room.layout.grid.width; x++) owner.set(`${room.origin.x + x},${room.origin.z + z}`, room.kind);
  const gaps = new Set<string>();
  for (const d of template.doors) {
    const a = doorCell(template, d.a),
      b = doorCell(template, d.b);
    if (a && b) gaps.add(segmentKey(a, b));
  }
  type Unit = { x1: number; z1: number; x2: number; z2: number; side: WallRun["side"] };
  const units: Unit[] = [];
  const seen = new Set<string>();
  const neighbours: [number, number, "north" | "south" | "west" | "east"][] = [
    [0, -1, "north"],
    [0, 1, "south"],
    [-1, 0, "west"],
    [1, 0, "east"],
  ];
  for (const [key, kind] of owner) {
    const [x, z] = key.split(",").map(Number) as [number, number];
    for (const [dx, dz, side] of neighbours) {
      const other = owner.get(`${x + dx},${z + dz}`);
      if (other === kind) continue;
      const seg = segmentKey({ x, z }, { x: x + dx, z: z + dz });
      if (seen.has(seg) || gaps.has(seg)) continue;
      seen.add(seg);
      // The segment between the two cells: a unit edge on a grid line.
      const unit: Unit =
        dx === 0
          ? { x1: x, z1: z + Math.max(dz, 0), x2: x + 1, z2: z + Math.max(dz, 0), side: other ? "inner" : side }
          : { x1: x + Math.max(dx, 0), z1: z, x2: x + Math.max(dx, 0), z2: z + 1, side: other ? "inner" : side };
      units.push(unit);
    }
  }
  // Merge collinear touching units of the same side.
  units.sort((a, b) => (a.z1 === a.z2 ? 0 : 1) - (b.z1 === b.z2 ? 0 : 1) || a.z1 - b.z1 || a.x1 - b.x1);
  const runs: WallRun[] = [];
  for (const u of units) {
    const last = runs[runs.length - 1];
    const horizontal = u.z1 === u.z2;
    if (last && last.side === u.side) {
      if (horizontal && last.z1 === last.z2 && last.z1 === u.z1 && last.x2 === u.x1) {
        last.x2 = u.x2;
        continue;
      }
      if (!horizontal && last.x1 === last.x2 && last.x1 === u.x1 && last.z2 === u.z1) {
        last.z2 = u.z2;
        continue;
      }
    }
    runs.push({ ...u });
  }
  return runs;
}

/** A door side's cell in building cells ("town" cells are already building cells). */
export function doorCell(template: BuildingTemplate, side: DoorSide): Cell | null {
  if (side.room === "town") return side.cell;
  const room = roomOf(template, side.room);
  return room ? toBuilding(room, side.cell) : null;
}

function segmentKey(a: Cell, b: Cell): string {
  const [p, q] = a.x < b.x || (a.x === b.x && a.z < b.z) ? [a, b] : [b, a];
  return `${p.x},${p.z}|${q.x},${q.z}`;
}
