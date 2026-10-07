/* The building template: a building's rooms as grid-engine layouts, joined by doors. Pure data and functions (no
   Three.js, no DOM), so it runs under `node --test` and phase 4's portal graph can take the layouts and doors as they
   are.

   Building cells: x east, z south (towards the home camera). The origin (0, 0) is the north-west corner and never moves:
   role rooms grow east in 6 x 6 modules (TOWN_PLAN section 4), so old cells keep their place. At its largest a building
   is 33 x 28 cells (19.8 x 16.8 world units).

     x:  0        9           21      27      33
     z0  +--------+-----------+-------+-------+
         |storage | meeting   |workers        |   west: status rooms, fixed size; they never grow with their piles
     z7  +--------+-----------+ (two module   |   centre: meeting room (when present), the lead's office, the lobby
         |planning|           |  rows)        |   east: role rooms, one to two module columns wide
     z12 |        | lead's    +-------+-------+
     z14 +--------+ office    |analyst        |
         |review  |           |               |
     z17 |        +-----------+-------+-------+
     z18 |        |           |design         |
     z21 +--------+  lobby    |               |
         |dispatch|           +-------+-------+
     z28 +--[ ]---+----[ ]----+                  the lobby's south door is the entrance; dispatch's loading door
                                                 opens onto the truck's apron (no walker uses it)

   Dressing zones: every room keeps free floor that no desk, pile, door or seat needs, for the homely props (sofa corner
   in the lead's office, coffee corner in the lobby, plants between desks, shelving in the status rooms). They are named
   per room in ZONES below; `dressingZones(template)` returns them in building cells.

   Two plans (`BuildingPlan`): "classic" is the building above; "three-rooms" (threeRoomTemplate.ts) is the spec
   addendum's floor plan, where one physical room, a hall, hosts several model rooms (`TemplateRoom.hosts`) and
   `roomOf` resolves a hosted kind to its hall.
*/
import type { Cell, Definitions, WorldLayout, WorldProp } from "@crewhub/world-engine";
import type { Building, RoomKind } from "@crewhub/world-model";
import { PILE_ROOMS } from "./interiorLayout.ts";
import { dressingDefinitions, dressingSeed, dressRooms } from "./roomDressing.ts";
import { threeRoomTemplate, threeRoomZones } from "./threeRoomTemplate.ts";

/** Which building template a viewer sees (state/buildingPlan.ts): the three halls of the addendum, or the ten rooms. */
export type BuildingPlan = "three-rooms" | "classic";
/** What a viewer gets before choosing: the lead flips it to "three-rooms" once the round passes its gate. */
export const DEFAULT_BUILDING_PLAN: BuildingPlan = "three-rooms";

/** World units per building cell: the Greenhouse grid. */
export const BUILDING_CELL = 0.6;
/** Side of a role-room growth module, in cells. */
export const MODULE = 6;
/** A role room is one or two module columns wide. */
export const MAX_MODULE_COLUMNS = 2;
/** Desks per 6 x 6 module: two staggered workstations with their seats, and floor to spare for plants. */
export const DESKS_PER_MODULE = 2;

const WEST = 9;
const CENTRE = 12;
const EAST_X = WEST + CENTRE;
/** The widest and deepest a building gets, in cells; the town reserves a plot for it. */
export const MAX_WIDTH = EAST_X + MODULE * MAX_MODULE_COLUMNS;
export const DEPTH = 28;
/** World units the floors stand above the lawn: the building's slab. Walkers inside a building walk at this height. */
export const FLOOR_RISE = 0.24;
/** World units the tall back walls (north glass, west chalk) stand above the floor: the old Greenhouse room's height. */
export const BACK_WALL_HEIGHT = 1.75;
/** World units between the plot's north edge and the building's north wall. */
export const PLOT_MARGIN = 2;
/** The building cell just outside the front door (the lobby's south door). */
export const ENTRANCE: Cell = { x: WEST + 6, z: DEPTH };
/** Dispatch's loading door on the south wall, building cells x1 (inclusive) to x2 (exclusive); only the truck uses it. */
export const LOADING = { x1: 1, x2: 4 };

export type RoleRoom = "workers" | "analyst" | "design";
export const ROLE_ROOMS: readonly RoleRoom[] = ["workers", "analyst", "design"];
export const STATUS_ROOMS = ["storage", "planning", "review", "dispatch"] as const;

export interface TemplateRoom {
  kind: RoomKind;
  /** Model rooms this physical room stands for besides its own kind (a hall of the three-room plan); empty in classic. */
  hosts: readonly RoomKind[];
  /** The room's north-west cell in building cells. */
  origin: Cell;
  /** The room's own interior grid and furniture; `entrance` is its first door cell. */
  layout: WorldLayout;
}

/** Where a model room's loose objects stand: slots in fill order, each stacking (or shelving) up to `height`. */
export interface PileRoom {
  /** Slot centres in the room's own cells (the hall's, when hosted), in fill order. */
  slots: { x: number; z: number }[];
  /** Objects per slot: stacked on each other, or one per shelf level when `surface` is "shelf". */
  height: number;
  surface: Surface;
  /** Where the pallet stands when the pile overflows, room cells. */
  pallet: { x: number; z: number };
}
/** What an object stands on; the renderer adds that surface's height ("shelf": the rack's bottom shelf, then `level` shelves up). */
export type Surface = "floor" | "rack" | "shelf" | "table" | "pile" | "pallet" | "desk" | "lead-desk";
export type Piles = Readonly<Partial<Record<RoomKind, PileRoom>>>;

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
  plan: BuildingPlan;
  /** In building cells. */
  size: { width: number; depth: number };
  rooms: TemplateRoom[];
  doors: TemplateDoor[];
  /** The piles per model room: the classic status rooms' own, or a rack per status in Administration. */
  piles: Piles;
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
  // The three-room plan's pieces (threeRoomTemplate.ts). A status rack is approached from the south, its middle cell.
  "rack-backlog": statusRack("rack-backlog", "Backlog rack", "storage"),
  "rack-planning": statusRack("rack-planning", "Planning rack", "planning"),
  "rack-review": statusRack("rack-review", "Review rack", "review"),
  "rack-done": statusRack("rack-done", "Done rack", "dispatch"),
  "huddle-table": {
    id: "huddle-table",
    label: "Huddle table",
    footprint: { width: 2, depth: 2 },
    blocksMovement: true,
    tags: ["gather"],
    // Places all round: every edge cell but the corners.
    approaches: [
      { x: 0, z: -1 },
      { x: 1, z: -1 },
      { x: 2, z: 0 },
      { x: 2, z: 1 },
      { x: 0, z: 2 },
      { x: 1, z: 2 },
      { x: -1, z: 0 },
      { x: -1, z: 1 },
    ],
  },
  "archive-counter": {
    id: "archive-counter",
    label: "Archive counter",
    footprint: { width: 3, depth: 1 },
    blocksMovement: true,
    tags: ["archive", "counter"],
    approaches: [{ x: 1, z: -1 }],
  },
  bench: {
    id: "bench",
    label: "Oak bench",
    footprint: { width: 3, depth: 1 },
    blocksMovement: true,
    tags: ["rest"],
    approaches: [{ x: 1, z: -1 }],
  },
  "coffee-machine": {
    id: "coffee-machine",
    label: "Coffee machine",
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    tags: ["coffee", "rest"],
    approaches: [{ x: 0, z: 1 }],
  },
  plant: {
    id: "plant",
    label: "Bird of paradise",
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    tags: ["decoration", "greenery"],
    // Someone watering it stands to its west.
    approaches: [{ x: -1, z: 0 }],
  },
  // The homely dressing pieces (roomDressing.ts): plain blocking footprints the director never visits.
  ...dressingDefinitions,
};

/** A status rack of the three-room plan: 3 x 1 against Administration's north wall, tagged with its model room. */
function statusRack(id: string, label: string, room: RoomKind) {
  return { id, label, footprint: { width: 3, depth: 1 }, blocksMovement: true, tags: [room, "pile"], approaches: [{ x: 1, z: 1 }] };
}

export const prop = (id: string, definitionId: string, x: number, z: number): WorldProp => ({ id, definitionId, cell: { x, z }, rotation: 0 });

export function layout(width: number, depth: number, entrance: Cell, props: WorldProp[]): WorldLayout {
  return { version: 1, grid: { width, depth, cellSize: BUILDING_CELL }, props, entrance };
}

/**
 * The role zone a desk carries in its id (`desk-analyst-3` on the three-room floor), or null for a desk whose zone is
 * its room (classic `desk-0`, the office's `side-desk-0`).
 */
export function deskZone(desk: Pick<WorldProp, "id">): RoleRoom | null {
  const m = /^desk-(workers|analyst|design)-\d+$/.exec(desk.id);
  return m ? (m[1] as RoleRoom) : null;
}

/** Workstations of a role room: two per module, staggered so every seat and door stays reachable. */
function roleDesks(columns: number, rows: number): WorldProp[] {
  const desks: WorldProp[] = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const x = column * MODULE,
        z = row * MODULE;
      desks.push(prop(`desk-${desks.length}`, "workdesk", x + 1, z + 2));
      desks.push(prop(`desk-${desks.length}`, "workdesk", x + 3, z + 4));
    }
  // Slot order: row by row, so the first desks are nearest the door.
  return desks;
}

/** Module rows per role room: the workers room is two modules deep, the analyst and design rooms one. */
const ROLE_ROWS: Record<RoleRoom, number> = { workers: 2, analyst: 1, design: 1 };
const ROLE_Z: Record<RoleRoom, number> = { workers: 0, analyst: 12, design: 18 };
/** Each role room's door on its west edge (its own cells), and the matching cell of the neighbour. */
const ROLE_DOORS: Record<RoleRoom, { own: Cell; room: RoomKind; other: Cell }> = {
  workers: { own: { x: 0, z: 9 }, room: "lead-office", other: { x: CENTRE - 1, z: 2 } },
  analyst: { own: { x: 0, z: 3 }, room: "lead-office", other: { x: CENTRE - 1, z: 8 } },
  design: { own: { x: 0, z: 3 }, room: "lobby", other: { x: CENTRE - 1, z: 4 } },
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
export function buildingTemplate(building: Building, plan: BuildingPlan = DEFAULT_BUILDING_PLAN): BuildingTemplate {
  // The template reads only the plan, the slug, the room kinds and each role room's desk count. The renderer asks for
  // it on every model update of every building, so the same inputs return the same (shared, read-only) template.
  const key = `${plan}|${building.slug}|${building.rooms.map((r) => r.kind).join()}|${ROLE_ROOMS.map((kind) => deskCount(building, kind)).join()}`;
  let template = templates.get(key);
  if (template) {
    // Most recently used last, so the oldest goes first when the cache is full.
    templates.delete(key);
  } else {
    template = plan === "three-rooms" ? threeRoomTemplate(building) : makeTemplate(building);
    if (templates.size >= TEMPLATE_CACHE) templates.delete(templates.keys().next().value!);
  }
  templates.set(key, template);
  return template;
}

/** Templates by their inputs; a stress town has a dozen buildings, each changing its desks now and then. */
const TEMPLATE_CACHE = 64;
const templates = new Map<string, BuildingTemplate>();

function makeTemplate(building: Building): BuildingTemplate {
  const kinds = new Set(building.rooms.map((r) => r.kind));
  const rooms: TemplateRoom[] = [];
  const doors: TemplateDoor[] = [];
  const door = (id: string, a: DoorSide, b: DoorSide) => doors.push({ id, a, b });

  // Centre column: an entrance hall, the lead's office behind it, the meeting room at the back.
  rooms.push({
    kind: "lobby",
    hosts: [],
    origin: { x: WEST, z: 17 },
    layout: layout(CENTRE, 11, { x: 6, z: 10 }, [
      prop("mailbox", "mailbox", 1, 9),
      prop("bench", "bench", 8, 9),
      prop("plant", "plant", 11, 8),
      prop("coffee", "coffee-machine", 10, 0),
    ]),
  });
  rooms.push({
    kind: "lead-office",
    hosts: [],
    origin: { x: WEST, z: 7 },
    layout: layout(CENTRE, 10, { x: 6, z: 9 }, [
      prop("lead-desk", "lead-desk", 5, 3),
      prop("side-desk-0", "workdesk", 9, 5),
      prop("side-desk-1", "workdesk", 9, 8),
      prop("plant", "plant", 11, 0),
    ]),
  });
  door("entrance", { room: "lobby", cell: { x: ENTRANCE.x - WEST, z: 10 } }, { room: "town", cell: ENTRANCE });
  door("lobby-office", { room: "lobby", cell: { x: 6, z: 0 } }, { room: "lead-office", cell: { x: 6, z: 9 } });
  if (kinds.has("meeting")) {
    rooms.push({ kind: "meeting", hosts: [], origin: { x: WEST, z: 0 }, layout: layout(CENTRE, 7, { x: 8, z: 6 }, [prop("table", "meeting-table", 4, 2)]) });
    door("office-meeting", { room: "lead-office", cell: { x: 8, z: 0 } }, { room: "meeting", cell: { x: 8, z: 6 } });
  }

  // West column: the work flows north to south, storage to dispatch.
  rooms.push({
    kind: "storage",
    hosts: [],
    origin: { x: 0, z: 0 },
    layout: layout(WEST, 7, { x: 4, z: 6 }, [
      prop("rack-0", "rack", 0, 0),
      prop("rack-1", "rack", 2, 0),
      prop("rack-2", "rack", 4, 0),
      prop("rack-3", "rack", 6, 0),
      prop("rack-4", "rack", 0, 3),
      prop("rack-5", "rack", 2, 3),
    ]),
  });
  rooms.push({ kind: "planning", hosts: [], origin: { x: 0, z: 7 }, layout: layout(WEST, 7, { x: 8, z: 2 }, [prop("table", "planning-table", 2, 4)]) });
  rooms.push({ kind: "review", hosts: [], origin: { x: 0, z: 14 }, layout: layout(WEST, 7, { x: 8, z: 1 }, [prop("pile", "review-pile", 3, 2)]) });
  rooms.push({
    kind: "dispatch",
    hosts: [],
    origin: { x: 0, z: 21 },
    layout: layout(WEST, 7, { x: 8, z: 2 }, [prop("pallet-0", "pallet", 1, 3), prop("pallet-1", "pallet", 4, 3)]),
  });
  door("storage-planning", { room: "storage", cell: { x: 4, z: 6 } }, { room: "planning", cell: { x: 4, z: 0 } });
  door("office-planning", { room: "lead-office", cell: { x: 0, z: 2 } }, { room: "planning", cell: { x: WEST - 1, z: 2 } });
  door("office-review", { room: "lead-office", cell: { x: 0, z: 8 } }, { room: "review", cell: { x: WEST - 1, z: 1 } });
  door("review-dispatch", { room: "review", cell: { x: 4, z: 6 } }, { room: "dispatch", cell: { x: 4, z: 0 } });
  door("lobby-dispatch", { room: "lobby", cell: { x: 0, z: 6 } }, { room: "dispatch", cell: { x: WEST - 1, z: 2 } });

  // East column: role rooms, grown by the desks they need.
  let width = EAST_X;
  for (const kind of ROLE_ROOMS) {
    if (!kinds.has(kind)) continue;
    const columns = roleColumns(kind, deskCount(building, kind));
    const rows = ROLE_ROWS[kind];
    const d = ROLE_DOORS[kind];
    rooms.push({ kind, hosts: [], origin: { x: EAST_X, z: ROLE_Z[kind] }, layout: layout(columns * MODULE, rows * MODULE, d.own, roleDesks(columns, rows)) });
    door(`${d.room}-${kind}`, { room: d.room, cell: d.other }, { room: kind, cell: d.own });
    width = Math.max(width, EAST_X + columns * MODULE);
  }
  const template: BuildingTemplate = { plan: "classic", size: { width, depth: DEPTH }, rooms, doors, piles: PILE_ROOMS };
  return dressTemplate(template, building.slug);
}

/** The homely dressing: its blocking pieces join the room layouts (roomDressing.ts). */
export function dressTemplate(template: BuildingTemplate, slug: string): BuildingTemplate {
  const dressing = { definitions: interiorDefinitions, seed: dressingSeed(slug), zones: dressingZones(template), loading: LOADING, piles: template.piles };
  return { ...template, rooms: dressRooms(template, dressing) };
}

/** A free rectangle of floor in building cells, for props that dress a room and block nothing. */
export interface DressingZone {
  room: RoomKind;
  /** What the zone is meant for, in a few words (the art direction's intent, not a rule). */
  use: string;
  x: number;
  z: number;
  width: number;
  depth: number;
}

type Zone = Omit<DressingZone, "room">;
const zone = (use: string, x: number, z: number, width: number, depth: number): Zone => ({ use, x, z, width, depth });

/**
 * The dressing zones per room, in the room's own cells: floor that no desk, pile, door, door approach or seat needs.
 * Blocking every zone cell still leaves every door, seat and approach reachable (a test checks it).
 */
const ZONES: Partial<Record<RoomKind, Zone[]>> = {
  lobby: [zone("coffee corner: a table and chairs by the coffee machine", 8, 5, 3, 2), zone("waiting corner: armchairs, a rug, a plant", 1, 1, 3, 3)],
  "lead-office": [zone("sofa corner: sofa, coffee table, floor lamp", 1, 4, 3, 3), zone("bookshelf along the back wall", 1, 0, 3, 1)],
  meeting: [zone("sideboard and plants", 0, 0, 2, 7), zone("whiteboard and plants", 10, 0, 2, 5)],
  storage: [zone("crates and a step ladder", 6, 3, 3, 2)],
  planning: [zone("pinboard and a shelf", 0, 0, 2, 3), zone("plant and a stool", 0, 5, 2, 2)],
  review: [zone("shelving", 0, 0, 2, 4)],
  dispatch: [zone("tape, scales and a stack of boxes", 0, 0, 3, 2)],
};
/** Plants between desks: two corners of every role-room module. */
const MODULE_ZONES: Zone[] = [zone("plants between desks", 4, 0, 2, 2), zone("plants between desks", 0, 4, 2, 2)];

/** The dressing zones of a template's rooms, in building cells, in room order. */
export function dressingZones(template: BuildingTemplate): DressingZone[] {
  if (template.plan === "three-rooms") return threeRoomZones(template);
  const out: DressingZone[] = [];
  for (const room of template.rooms) {
    const { width, depth } = room.layout.grid;
    const local: Zone[] = [...(ZONES[room.kind] ?? [])];
    if ((ROLE_ROOMS as readonly RoomKind[]).includes(room.kind))
      for (let z = 0; z < depth; z += MODULE)
        for (let x = 0; x < width; x += MODULE) for (const m of MODULE_ZONES) local.push({ ...m, x: x + m.x, z: z + m.z });
    for (const z of local) out.push({ room: room.kind, ...z, x: room.origin.x + z.x, z: room.origin.z + z.z });
  }
  return out;
}

/** How many desks a room needs: every agent (real or proxy) whose home place is that room. */
export function deskCount(building: Building, room: RoomKind): number {
  return building.agents.filter((a) => a.room === room && a.key !== building.lead.id).length;
}

export function officeSideDesks(): number {
  return OFFICE_SIDE_DESKS;
}

/** The template room whose own kind is `kind`, else the hall that hosts it (the analyst room is the floor). */
export function roomOf(template: BuildingTemplate, kind: RoomKind): TemplateRoom | undefined {
  return template.rooms.find((r) => r.kind === kind) ?? template.rooms.find((r) => r.hosts.includes(kind));
}

/** The kind of the physical room a model room is in (its own, or its hall's), or null when the building lacks it. */
export function hallOf(template: BuildingTemplate, kind: RoomKind): RoomKind | null {
  return roomOf(template, kind)?.kind ?? null;
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

/** A gap in the walls, on one grid line from (x1, z1) to (x2, z2), building cells. */
export interface Opening {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  /** The door it belongs to, or "loading" for dispatch's loading door. */
  id: string;
}

function ownerMap(template: BuildingTemplate): Map<string, RoomKind> {
  const owner = new Map<string, RoomKind>();
  for (const room of template.rooms)
    for (let z = 0; z < room.layout.grid.depth; z++)
      for (let x = 0; x < room.layout.grid.width; x++) owner.set(`${room.origin.x + x},${room.origin.z + z}`, room.kind);
  return owner;
}

/**
 * The wall openings: every door, drawn two cells wide where the wall goes on with the same two rooms on either side
 * (a generous opening; walkers still use the door cell), and dispatch's loading door.
 */
export function doorOpenings(template: BuildingTemplate): Opening[] {
  const owner = ownerMap(template);
  const at = (x: number, z: number) => owner.get(`${x},${z}`);
  const taken = new Set<string>();
  for (const d of template.doors) {
    const a = doorCell(template, d.a),
      b = doorCell(template, d.b);
    if (a && b) taken.add(segmentKey(a, b));
  }
  const out: Opening[] = [];
  for (const d of template.doors) {
    const a = doorCell(template, d.a),
      b = doorCell(template, d.b);
    if (!a || !b) continue;
    // Along the wall: x for a wall between north and south cells, z for one between west and east cells.
    const [ax, az] = a.z !== b.z ? [1, 0] : [0, 1];
    let lo = 0,
      hi = 1;
    for (const step of [1, -1]) {
      const a2 = { x: a.x + ax * step, z: a.z + az * step },
        b2 = { x: b.x + ax * step, z: b.z + az * step };
      if (at(a2.x, a2.z) !== at(a.x, a.z) || at(b2.x, b2.z) !== at(b.x, b.z) || taken.has(segmentKey(a2, b2))) continue;
      taken.add(segmentKey(a2, b2));
      if (step > 0) hi = 2;
      else lo = -1;
      break;
    }
    // The grid line between the two cells.
    if (a.z !== b.z) {
      const z = Math.max(a.z, b.z);
      out.push({ id: d.id, x1: a.x + lo, z1: z, x2: a.x + hi, z2: z });
    } else {
      const x = Math.max(a.x, b.x);
      out.push({ id: d.id, x1: x, z1: a.z + lo, x2: x, z2: a.z + hi });
    }
  }
  out.push({ id: "loading", x1: LOADING.x1, z1: DEPTH, x2: LOADING.x2, z2: DEPTH });
  return out;
}

/**
 * The walls: every room edge, drawn once, with a gap at every opening; unit segments on one line merge into runs. An
 * edge between a room and nothing (an absent role or meeting room) is an outer wall.
 */
export function wallRuns(template: BuildingTemplate): WallRun[] {
  const owner = ownerMap(template);
  const gaps = new Set<string>();
  for (const o of doorOpenings(template)) {
    if (o.z1 === o.z2) for (let x = o.x1; x < o.x2; x++) gaps.add(segmentKey({ x, z: o.z1 - 1 }, { x, z: o.z1 }));
    else for (let z = o.z1; z < o.z2; z++) gaps.add(segmentKey({ x: o.x1 - 1, z }, { x: o.x1, z }));
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
  // Horizontal units line by line (z, then x), vertical ones column by column (x, then z), so neighbours are adjacent.
  const flat = (u: Unit) => u.z1 === u.z2;
  units.sort((a, b) => (flat(a) ? 0 : 1) - (flat(b) ? 0 : 1) || (flat(a) ? a.z1 - b.z1 || a.x1 - b.x1 : a.x1 - b.x1 || a.z1 - b.z1));
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
