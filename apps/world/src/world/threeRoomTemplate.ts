/* The three-room template (spec addendum "three rooms per building", 2026-10-07): every building has exactly three
   physical rooms, the halls, and each hall hosts several model rooms. Pure data and functions, like the classic
   template in buildingTemplate.ts, which keeps the shared types, the definitions and the walls.

   Building cells: x east, z south; one cell is 0.6 world units. The origin (0, 0) never moves; the floor grows east in
   6 x 6 module columns. `MAX_WIDTH` (33), `DEPTH` (28), `ENTRANCE` and `LOADING` are the classic template's, so plots,
   roads and the truck's apron stay where they are.

     x: 0        9           15  18  21 ........ 27 ........ 33   the floor grows east in 6-cell module columns
     z0  +--------+-----------------------+-----------+-----------+
         |LEAD'S  | THE FLOOR    module grid 6 x 6, 3 rows        |   hosts workers, analyst, design, meeting
         |OFFICE  | [w][w]       desks by role (two per module,   |
         | shelf  |  ...         staggered):                      |
         | lead   |              workers, then analyst, then      |
         | desk * |              design, each role contiguous     |
     z6  |  (beacon)                                              |
         |  side  |                                               |
         |  desks ~ window                                        |
     z12 |  sofa  +-------+                                       |
         |  corner| huddle|                                       |
         |        D (O)   |                                       |
     z18 +--------+-------+-----------D---+·························
         |ADMINISTRATION                 |   (outside: lawn, when the floor is wider than 12 cells)
         | [Backlog] [Planning] [Review] [Done]                    hosts storage, planning, review, dispatch
         |  x1-3      x5-7       x9-11   x13-15
         |                               |
         |          mailbox     counter  |
     z28 +-[load]---------[E]------------+
           x1-4           x15

   Doors: the office to the floor at office cell (8, 14) / floor cell (0, 14); the floor to Administration at floor
   cell (9, 17) / administration cell (18, 0); the front door at ENTRANCE; the loading door at LOADING (the truck only).
   Walls stand only between halls: inside a hall the floor is open.

   Desks carry their role in their id (`desk-analyst-3`; `deskZone`): an agent sits at a desk of its own room kind, as
   before. The huddle table replaces the meeting room (tag `gather`; the cast pose stays `meeting-table`). The four
   racks are the piles: three slots on four shelves each, then a pallet with a count in front. */
import type { WorldProp } from "@crewhub/world-engine";
import type { Building, RoomKind } from "@crewhub/world-model";
import {
  DEPTH,
  deskCount,
  dressTemplate,
  ENTRANCE,
  layout,
  MODULE,
  prop,
  ROLE_ROOMS,
  type BuildingTemplate,
  type DressingZone,
  type PileRoom,
  type Piles,
  type RoleRoom,
  type TemplateDoor,
  type TemplateRoom,
} from "./buildingTemplate.ts";

/* The module side and the building depth as literals: this module and buildingTemplate.ts import each other, so
   their constants are not initialised yet when these are made (the template function checks they agree). */
const MODULE_SIDE = 6;
const BUILDING_DEPTH = 28;

/** The lead's office: origin (0, 0). */
export const OFFICE = { x: 0, z: 0, width: 9, depth: 18 } as const;
/** The floor: origin (9, 0), `columns` modules wide, three module rows deep. */
export const FLOOR = { x: OFFICE.width, z: 0, rows: 3 } as const;
/** Administration: origin (0, 18), the full width of a two-column building. */
export const ADMIN = { x: 0, z: OFFICE.depth, width: 21, depth: BUILDING_DEPTH - OFFICE.depth } as const;
/** The floor is two to four module columns wide. */
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 4;
/** The huddle's module: column 0 of the last row, by the office door. */
export const HUDDLE_MODULE = { column: 0, row: 2 } as const;
/** Desks per module: two, staggered. */
const DESKS_PER_MODULE = 2;
/** Shelves per rack, and slots per shelf. */
export const RACK_SHELVES = 4;
export const RACK_SLOTS = 3;

/** The racks against Administration's north wall, west to east, with the model room each one stands for. */
export const RACKS: readonly { id: string; room: "storage" | "planning" | "review" | "dispatch"; x: number }[] = [
  { id: "rack-backlog", room: "storage", x: 1 },
  { id: "rack-planning", room: "planning", x: 5 },
  { id: "rack-review", room: "review", x: 9 },
  { id: "rack-done", room: "dispatch", x: 13 },
];

/** The office door onto the floor, and the floor's door down to Administration, in each room's own cells. */
export const OFFICE_DOOR = { office: { x: OFFICE.width - 1, z: 14 }, floor: { x: 0, z: 14 } } as const;
export const ADMIN_DOOR = { floor: { x: 9, z: FLOOR.rows * MODULE_SIDE - 1 }, admin: { x: 18, z: 0 } } as const;

/** Model rooms per hall, besides the hall's own kind. */
export const HALL_HOSTS: Record<"lobby" | "workers" | "lead-office", readonly RoomKind[]> = {
  lobby: ["storage", "planning", "review", "dispatch"],
  workers: ["analyst", "design", "meeting"],
  "lead-office": [],
};

/** Modules a role needs: one per two desks, at least one while the model has the room. */
function roleModules(building: Building, kind: RoleRoom): number {
  if (!building.rooms.some((r) => r.kind === kind)) return 0;
  return Math.max(1, Math.ceil(deskCount(building, kind) / DESKS_PER_MODULE));
}

/** Desk modules a floor of `columns` holds: every module but the huddle's. */
export const floorModules = (columns: number): number => columns * FLOOR.rows - 1;
/** Desks a floor of `columns` holds: 10, 16 and 22. */
export const floorCapacity = (columns: number): number => floorModules(columns) * DESKS_PER_MODULE;

/** The smallest column count (2 to 4) whose modules hold every role's desks and the huddle. */
export function floorColumns(building: Building): number {
  const needed = ROLE_ROOMS.reduce((n, kind) => n + roleModules(building, kind), 0);
  let columns = MIN_COLUMNS;
  while (columns < MAX_COLUMNS && floorModules(columns) < needed) columns++;
  return columns;
}

/** The desk modules of a floor in fill order: row by row from the back (north), the huddle's module left out. */
function moduleOrder(columns: number): { column: number; row: number }[] {
  const out: { column: number; row: number }[] = [];
  for (let row = 0; row < FLOOR.rows; row++)
    for (let column = 0; column < columns; column++)
      if (row !== HUDDLE_MODULE.row || column !== HUDDLE_MODULE.column) out.push({ column, row });
  return out;
}

/** The two staggered desks of a module, in the floor's cells. Seats lie north of the desks. */
function moduleDesks(kind: RoleRoom, first: number, module: { column: number; row: number }): WorldProp[] {
  const x = module.column * MODULE,
    z = module.row * MODULE;
  return [prop(`desk-${kind}-${first}`, "workdesk", x + 1, z + 1), prop(`desk-${kind}-${first + 1}`, "workdesk", x + 3, z + 3)];
}

/** The floor's furniture: the huddle table and the role desks, each role contiguous, workers first. */
function floorProps(building: Building, columns: number): WorldProp[] {
  const props: WorldProp[] = [prop("huddle", "huddle-table", HUDDLE_MODULE.column * MODULE + 2, HUDDLE_MODULE.row * MODULE + 2)];
  const modules = moduleOrder(columns);
  let next = 0;
  for (const kind of ROLE_ROOMS) {
    let count = 0;
    for (let i = 0; i < roleModules(building, kind) && next < modules.length; i++, next++) {
      props.push(...moduleDesks(kind, count, modules[next]!));
      count += DESKS_PER_MODULE;
    }
  }
  return props;
}

/** The racks' piles: three slots on each of four shelves, the pallet in front of the rack past that. */
function rackPiles(): Piles {
  const piles: Partial<Record<RoomKind, PileRoom>> = {};
  for (const rack of RACKS)
    piles[rack.room] = {
      slots: Array.from({ length: RACK_SLOTS }, (_, i) => ({ x: rack.x + i + 0.5, z: 0.5 })),
      height: RACK_SHELVES,
      surface: "shelf",
      pallet: { x: rack.x + 1.5, z: 2.5 },
    };
  return piles;
}

/**
 * The three-room template of a building. Deterministic: the same building gives the same template. All three halls
 * always exist; the floor's width follows the role desks the model needs.
 */
export function threeRoomTemplate(building: Building): BuildingTemplate {
  if (MODULE !== MODULE_SIDE || DEPTH !== BUILDING_DEPTH) throw new Error("threeRoomTemplate: the module side or the building depth changed; update its literals");
  const columns = floorColumns(building);
  const floorWidth = columns * MODULE;
  const rooms: TemplateRoom[] = [
    {
      kind: "lead-office",
      hosts: HALL_HOSTS["lead-office"],
      origin: { x: OFFICE.x, z: OFFICE.z },
      layout: layout(OFFICE.width, OFFICE.depth, { ...OFFICE_DOOR.office }, [
        prop("lead-desk", "lead-desk", 2, 2),
        prop("side-desk-0", "workdesk", 6, 6),
        prop("side-desk-1", "workdesk", 6, 10),
        prop("plant", "plant", 8, 17),
      ]),
    },
    {
      kind: "workers",
      hosts: HALL_HOSTS.workers,
      origin: { x: FLOOR.x, z: FLOOR.z },
      layout: layout(floorWidth, FLOOR.rows * MODULE, { ...OFFICE_DOOR.floor }, floorProps(building, columns)),
    },
    {
      kind: "lobby",
      hosts: HALL_HOSTS.lobby,
      origin: { x: ADMIN.x, z: ADMIN.z },
      layout: layout(ADMIN.width, ADMIN.depth, { x: ENTRANCE.x - ADMIN.x, z: ADMIN.depth - 1 }, [
        ...RACKS.map((rack) => prop(rack.id, rack.id, rack.x, 0)),
        prop("mailbox", "mailbox", 11, 7),
        prop("archive-counter", "archive-counter", 16, 7),
      ]),
    },
  ];
  const doors: TemplateDoor[] = [
    { id: "entrance", a: { room: "lobby", cell: { x: ENTRANCE.x - ADMIN.x, z: ADMIN.depth - 1 } }, b: { room: "town", cell: ENTRANCE } },
    { id: "office-floor", a: { room: "lead-office", cell: { ...OFFICE_DOOR.office } }, b: { room: "workers", cell: { ...OFFICE_DOOR.floor } } },
    { id: "floor-admin", a: { room: "workers", cell: { ...ADMIN_DOOR.floor } }, b: { room: "lobby", cell: { ...ADMIN_DOOR.admin } } },
  ];
  const template: BuildingTemplate = {
    plan: "three-rooms",
    size: { width: Math.max(ADMIN.width, FLOOR.x + floorWidth), depth: DEPTH },
    rooms,
    doors,
    piles: rackPiles(),
  };
  return dressTemplate(template, building.slug);
}

type Zone = Omit<DressingZone, "room">;
const zone = (use: string, x: number, z: number, width: number, depth: number): Zone => ({ use, x, z, width, depth });

/** Free floor per hall, in the hall's own cells: the office's corners, Administration's nooks, plants between desks. */
const HALL_ZONES: Record<"lobby" | "lead-office", Zone[]> = {
  "lead-office": [zone("sofa corner: sofa, coffee table, floor lamp", 1, 13, 3, 3), zone("bookshelf along the back wall", 5, 0, 3, 1)],
  lobby: [zone("waiting corner: armchairs, a rug, a plant", 6, 5, 3, 3), zone("crates and a step ladder", 18, 5, 2, 2), zone("pinboard and a shelf", 0, 2, 1, 3)],
};
/** Plants between desks: two corners of every desk module (the huddle's module keeps its ring free). */
const MODULE_ZONES: Zone[] = [zone("plants between desks", 4, 0, 2, 2), zone("plants between desks", 0, 4, 2, 2)];

/** The dressing zones of a three-room template, building cells, in room order. */
export function threeRoomZones(template: BuildingTemplate): DressingZone[] {
  const out: DressingZone[] = [];
  for (const room of template.rooms) {
    const local: Zone[] = [];
    if (room.kind === "workers") {
      const columns = room.layout.grid.width / MODULE;
      for (const m of moduleOrder(columns)) for (const z of MODULE_ZONES) local.push({ ...z, x: m.column * MODULE + z.x, z: m.row * MODULE + z.z });
    } else local.push(...HALL_ZONES[room.kind as "lobby" | "lead-office"]);
    for (const z of local) out.push({ room: room.kind, ...z, x: room.origin.x + z.x, z: room.origin.z + z.z });
  }
  return out;
}
