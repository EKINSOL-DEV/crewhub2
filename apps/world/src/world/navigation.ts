/* The navigation world: one portal graph for the whole town. The town is walked district by district: every district
   in use is a room on its own coarse grid (the central one is `TOWN_ROOM`), and the district roads join neighbouring
   rooms where they cross the border between them. In a town room only the paving is open (the streets, the roads,
   the civic forecourts and paths, and each used plot's garden path), so walkers keep to the paths and never cut
   across lawns or through hedges. Every building adds its rooms from the building template, joined by the template's
   doors, and its lobby door joins the town cell just outside the building's entrance. The graph and the simulation
   live together here so a rebuilt building can take its actors out and put them back. Pure: no Three.js, no DOM, so
   it runs under `node --test`.

   Where a building stands comes from the town plan (townPlan.ts): its lot, never its place in a list. A district's
   room never changes size or place, so a town that grows only adds rooms.

   Rebuilds are per building and per room: a building whose shape changed (a role room grew, the meeting room came or
   went) has its rooms and doors replaced; a room whose furniture changed only (a prop placed in phase 5) is updated in
   place and keeps its doors, which is what the engine's revision cache is for. */
import {
  NavGraph,
  NavSimulation,
  type Cell,
  type Definitions,
  type PropDefinition,
  type Location,
  type WorldLayout,
  type WorldProp,
} from "@crewhub/world-engine";
import { applyEdit, emptyTownDocument } from "@crewhub/world-model";
import type { AgentKey, Building, DistrictSlot, GridCell, RoomKind } from "@crewhub/world-model";
import {
  BUILDING_CELL,
  buildingTemplate,
  DEFAULT_BUILDING_PLAN,
  DEPTH,
  ENTRANCE,
  interiorDefinitions,
  LOADING,
  MAX_WIDTH,
  PLOT_MARGIN,
  roomOf,
  type BuildingPlan,
  type BuildingTemplate,
} from "./buildingTemplate.ts";
import { assignDesks, type DeskSlot } from "./interiorLayout.ts";
import { allocationEdit, CENTRAL_SLOT, DISTRICT_SPAN, lotCentre, lotKey, reservedSpot, slotBounds, slotKey, type Segment } from "./settlement.ts";
import { planTown, type PlanBuilding, type TownPlan } from "./townPlan.ts";
import { CIVIC_LOT, PITCH, PLOT_SIZE, type Bounds } from "./townLayout.ts";
import { civicWalkways, entranceRoad } from "./settlementDressing.ts";
import { COBBLE_Y, GARDEN_PATH, LANE, LAWN_Y } from "./townDressing.ts";

/** The central district's room. Every other district's room is `town@x,z` (`townRoomId`). */
export const TOWN_ROOM = "town";
/** World units per town cell: two building cells, so a walk across the town stays short. */
export const TOWN_CELL = 1.2;
/** Crossing a building's front door costs this many cells: the step down to the street. */
const ENTRANCE_COST = 2;
/** The postman has right of way on the street. */
export const POSTMAN_PRIORITY = 10;

/** A district room in world units: one district cell, from the middle of one border strip to the middle of the next. */
const ROOM_SPAN = { x: DISTRICT_SPAN.x * PITCH, z: DISTRICT_SPAN.z * PITCH };
/** Every town room has this grid. */
export const TOWN_GRID = { width: Math.ceil(ROOM_SPAN.x / TOWN_CELL), depth: Math.ceil(ROOM_SPAN.z / TOWN_CELL) };
const CENTRAL_MIN = { x: slotBounds(CENTRAL_SLOT).minX - PITCH / 2, z: slotBounds(CENTRAL_SLOT).minZ - PITCH / 2 };

export const townRoomId = (slot: DistrictSlot): string => (slot.x === 0 && slot.z === 0 ? TOWN_ROOM : `${TOWN_ROOM}@${slot.x},${slot.z}`);
export const isTownRoom = (id: string): boolean => id === TOWN_ROOM || id.startsWith(`${TOWN_ROOM}@`);
/** The district of a town room; null for any other room. */
export function townRoomSlot(id: string): DistrictSlot | null {
  if (id === TOWN_ROOM) return CENTRAL_SLOT;
  if (!id.startsWith(`${TOWN_ROOM}@`)) return null;
  const [x, z] = id.slice(TOWN_ROOM.length + 1).split(",").map(Number);
  return Number.isInteger(x) && Number.isInteger(z) ? { x: x!, z: z! } : null;
}
/** The north-west corner of a district's room, in world units. */
function roomMin(slot: DistrictSlot): { x: number; z: number } {
  return { x: CENTRAL_MIN.x + slot.x * ROOM_SPAN.x, z: CENTRAL_MIN.z + slot.z * ROOM_SPAN.z };
}
/** The district whose room holds a world position. */
export function townSlotAt(x: number, z: number): DistrictSlot {
  return { x: Math.floor((x - CENTRAL_MIN.x) / ROOM_SPAN.x), z: Math.floor((z - CENTRAL_MIN.z) / ROOM_SPAN.z) };
}

export const roomId = (slug: string, kind: RoomKind) => `${slug}/${kind}`;
export function parseRoomId(id: string): { slug: string; kind: RoomKind } | null {
  const at = id.lastIndexOf("/");
  return at < 0 ? null : { slug: id.slice(0, at), kind: id.slice(at + 1) as RoomKind };
}

/**
 * World position of building cell (0, 0) on a lot: the north-west corner, which never moves (BuildingView). The
 * widest building is centred east to west; the north wall keeps `PLOT_MARGIN` from the plot edge, so the front yard
 * (path, step and the truck's apron) lies between the south wall and the street.
 */
export function buildingOrigin(lot: GridCell): { x: number; z: number } {
  const c = lotCentre(lot);
  return { x: c.x - (MAX_WIDTH * BUILDING_CELL) / 2, z: c.z - PLOT_SIZE / 2 + PLOT_MARGIN };
}

/** The cell of a district's room that holds a world position (clamped to the room). */
export function townCellAt(x: number, z: number, slot: DistrictSlot = CENTRAL_SLOT): Cell {
  const min = roomMin(slot);
  return {
    x: Math.min(TOWN_GRID.width - 1, Math.max(0, Math.floor((x - min.x) / TOWN_CELL))),
    z: Math.min(TOWN_GRID.depth - 1, Math.max(0, Math.floor((z - min.z) / TOWN_CELL))),
  };
}
export function townCellCentre(cell: Cell, slot: DistrictSlot = CENTRAL_SLOT): { x: number; z: number } {
  const min = roomMin(slot);
  return { x: min.x + (cell.x + 0.5) * TOWN_CELL, z: min.z + (cell.z + 0.5) * TOWN_CELL };
}
/** The town location (district room and cell) of a world position. */
export function townLocationAt(x: number, z: number): Location {
  const slot = townSlotAt(x, z);
  return { room: townRoomId(slot), cell: townCellAt(x, z, slot) };
}
/** The district whose room a lot's plot lies in. */
const slotOfLot = (lot: GridCell): DistrictSlot => {
  const c = lotCentre(lot);
  return townSlotAt(c.x, c.z);
};

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
/** The cells of a district's room that a world rectangle touches (inclusive). */
function cover(slot: DistrictSlot, minX: number, minZ: number, maxX: number, maxZ: number): Rect {
  const a = townCellAt(minX, minZ, slot),
    b = townCellAt(maxX - 1e-6, maxZ - 1e-6, slot);
  return { x0: a.x, z0: a.z, x1: b.x, z1: b.z };
}

/** A building's footprint on its district's grid: the shell at its widest, the flag at the north-west corner. */
export function buildingRect(lot: GridCell): Rect {
  const o = buildingOrigin(lot);
  return cover(slotOfLot(lot), o.x - 0.6, o.z - 0.6, o.x + MAX_WIDTH * BUILDING_CELL, o.z + DEPTH * BUILDING_CELL);
}
/** The truck on its apron outside dispatch's loading door (BuildingView: TRUCK_SPOT). */
export function truckRect(lot: GridCell): Rect {
  const o = buildingOrigin(lot);
  return cover(slotOfLot(lot), o.x + (LOADING.x1 - 1) * BUILDING_CELL, o.z + (DEPTH + 0.3) * BUILDING_CELL, o.x + (LOADING.x2 + 2) * BUILDING_CELL, o.z + (DEPTH + 4) * BUILDING_CELL);
}

/** The town cell just outside a building's front door (the town side of the entrance door), in its district's room. */
export function entranceCell(lot: GridCell): Cell {
  const o = buildingOrigin(lot);
  const x = townCellAt(o.x + (ENTRANCE.x + 0.5) * BUILDING_CELL, o.z, slotOfLot(lot)).x;
  return { x, z: buildingRect(lot).z1 + 1 };
}
/** Where walkers stop outside a building: one step down the path from the door (door cells are no destinations). */
export function frontCell(lot: GridCell): Cell {
  const e = entranceCell(lot);
  return { x: e.x, z: e.z + 1 };
}

/** World position of the town cell just outside a building's front door: where its garden path starts. */
export function plotDoor(lot: GridCell): { x: number; z: number } {
  return townCellCentre(entranceCell(lot), slotOfLot(lot));
}
/** What stands on a used plot, in world units: the building at its widest and the parked truck. */
export function plotObstacles(lot: GridCell): Bounds[] {
  const slot = slotOfLot(lot);
  const world = (r: Rect): Bounds => {
    const a = townCellCentre({ x: r.x0, z: r.z0 }, slot),
      b = townCellCentre({ x: r.x1, z: r.z1 }, slot);
    return { minX: a.x - TOWN_CELL / 2, maxX: b.x + TOWN_CELL / 2, minZ: a.z - TOWN_CELL / 2, maxZ: b.z + TOWN_CELL / 2 };
  };
  return [world(buildingRect(lot)), world(truckRect(lot))];
}

const POST = reservedSpot("post-office"),
  HALL = reservedSpot("town-hall");
/** The postman's place on the post office's forecourt (the mail hut's, the mailbox's). */
export const POST_OFFICE_CELL = townCellAt(POST.x - 0.5, POST.z + 1);
/** Where the postman leaves a letter for a recipient who works in no building: the town hall's forecourt. */
export const TOWN_HALL_CELL = townCellAt(HALL.x + 3, HALL.z + 2.2);

/** Height of the ground under a walker: the paving on a used plot's or a civic lot's lawn, else the street's paving. */
export function groundAt(x: number, z: number, usedLots: ReadonlySet<string>): number {
  const LAWN = LAWN_Y + 0.04,
    STREET = COBBLE_Y;
  for (const c of [POST, HALL]) if (Math.abs(x - c.x) <= CIVIC_LOT / 2 && Math.abs(z - c.z) <= CIVIC_LOT / 2) return LAWN;
  // The lot of the lattice cell under the position; its plot is the cell without the street around it.
  const lx = Math.floor(x / PITCH) + 65,
    lz = Math.floor(z / PITCH) + 65;
  const cx = (lx - 64) * PITCH - PITCH / 2,
    cz = (lz - 64) * PITCH - PITCH / 2;
  if (Math.abs(x - cx) <= PLOT_SIZE / 2 && Math.abs(z - cz) <= PLOT_SIZE / 2 && usedLots.has(`${lx},${lz}`)) return LAWN;
  return STREET;
}

const strip = (s: Segment, width: number): Bounds => ({
  minX: Math.min(s.x0, s.x1) - width / 2,
  maxX: Math.max(s.x0, s.x1) + width / 2,
  minZ: Math.min(s.z0, s.z1) - width / 2,
  maxZ: Math.max(s.z0, s.z1) + width / 2,
});
/** A garden path from a front door straight down to the street in front of its lot. */
export function gardenWalk(lot: GridCell): Bounds {
  const door = plotDoor(lot);
  return { minX: door.x - GARDEN_PATH / 2, maxX: door.x + GARDEN_PATH / 2, minZ: door.z - 0.6, maxZ: lotCentre(lot).z + PITCH / 2 };
}
/**
 * Every walkable paved rectangle of a plan: the streets between the lots in use, the roads between districts, the
 * civic paths and one garden path per building that is not archived. The dressing paves exactly these.
 */
export function townWalkways(plan: TownPlan): Bounds[] {
  return [
    ...plan.streets.map((s) => strip(s, LANE)),
    ...plan.roads.map((r) => strip(r, LANE)),
    ...civicWalks(plan),
    ...plan.lots.filter((l) => !l.archived).map((l) => gardenWalk(l.cell)),
  ];
}
/** The civic paths at the plan's tier, exactly as the dressing paves them, and the entrance road of a village or more. */
function civicWalks(plan: TownPlan): Bounds[] {
  const road = entranceRoad(plan);
  return [...civicWalkways(plan), ...(road ? [road] : [])];
}

/**
 * The open cells of one district's room: every cell whose centre lies on the plan's paving, plus the town cell at
 * each front door in the district. Everything else (grass, hedges, lawns, water) is closed.
 */
export function townOpenCells(plan: TownPlan, slot: DistrictSlot = CENTRAL_SLOT, walkways: readonly Bounds[] = townWalkways(plan)): Uint8Array {
  const open = new Uint8Array(TOWN_GRID.width * TOWN_GRID.depth);
  const min = roomMin(slot),
    max = { x: min.x + ROOM_SPAN.x, z: min.z + ROOM_SPAN.z };
  for (const r of walkways) {
    if (r.maxX < min.x || r.minX > max.x || r.maxZ < min.z || r.minZ > max.z) continue;
    const a = townCellAt(r.minX, r.minZ, slot),
      b = townCellAt(r.maxX, r.maxZ, slot);
    for (let z = a.z; z <= b.z; z++)
      for (let x = a.x; x <= b.x; x++) {
        const c = townCellCentre({ x, z }, slot);
        if (c.x >= r.minX && c.x <= r.maxX && c.z >= r.minZ && c.z <= r.maxZ) open[z * TOWN_GRID.width + x] = 1;
      }
  }
  const key = slotKey(slot);
  for (const lot of plan.lots) {
    if (lot.archived || slotKey(slotOfLot(lot.cell)) !== key) continue;
    const e = entranceCell(lot.cell);
    open[e.z * TOWN_GRID.width + e.x] = 1;
  }
  if (slot.x === 0 && slot.z === 0) for (const cell of [POST_OFFICE_CELL, TOWN_HALL_CELL]) open[cell.z * TOWN_GRID.width + cell.x] = 1;
  return open;
}

/** Marks the cells of a footprint closed (a building over its own garden path start, the truck). */
function closeRect(open: Uint8Array, r: Rect) {
  for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) open[z * TOWN_GRID.width + x] = 0;
}

/**
 * A plan for buildings that have no town document (tests, a world before its document loads): every building on
 * the lot the allocation would give it, in the order given.
 */
export function standalonePlan(buildings: readonly PlanBuilding[]): TownPlan {
  const empty = emptyTownDocument();
  const edit = allocationEdit(empty, buildings);
  const result = edit ? applyEdit(empty, edit, { knownStyles: [empty.styleId], builtinIds: [] }) : null;
  return planTown(result?.ok ? result.doc : empty, buildings);
}

/** Where a district road crosses from one district's room into the next: the two town cells either side of the line. */
function portal(road: TownPlan["roads"][number]): { id: string; a: Location; b: Location } {
  const along = road.x0 === road.x1 ? "z" : "x";
  const from = roomMin(road.from),
    to = roomMin(road.to);
  // The shared edge of the two rooms, and a point half a cell either side of it on the road's centre line.
  const edge = along === "x" ? Math.max(from.x, to.x) : Math.max(from.z, to.z);
  const side = (slot: DistrictSlot, min: { x: number; z: number }): Location => {
    const near = (along === "x" ? min.x : min.z) < edge ? edge - TOWN_CELL / 2 : edge + TOWN_CELL / 2;
    return { room: townRoomId(slot), cell: along === "x" ? townCellAt(near, road.z0, slot) : townCellAt(road.x0, near, slot) };
  };
  return { id: `road/${slotKey(road.from)}`, a: side(road.from, from), b: side(road.to, to) };
}

/** A building template as the graph sees it: room shapes and doors (structure) and furniture per room. */
function structureKey(t: BuildingTemplate): string {
  return JSON.stringify([t.rooms.map((r) => [r.kind, r.origin, r.layout.grid.width, r.layout.grid.depth]), t.doors]);
}
const propsKey = (layout: WorldLayout) => JSON.stringify(layout.props);

interface Entry {
  slug: string;
  /** The lot the building stands on. */
  cell: GridCell;
  template: BuildingTemplate;
  structure: string;
  props: Map<RoomKind, string>;
  desks: Map<AgentKey, DeskSlot>;
  building: Building;
}

/** An actor taken out while its building is rebuilt. */
interface Evacuee {
  id: string;
  priority: number;
  kind: RoomKind | null;
  location: Location;
}

export interface NavSyncResult {
  /** Buildings whose rooms were replaced; destinations into them must be set again. */
  rebuilt: string[];
  /** Buildings that left the town; their actors were removed. */
  removed: string[];
}

export class NavWorld {
  /** Interior furniture plus one footprint per town block size; the graph reads it at validation time. */
  readonly definitions: Record<string, PropDefinition>;
  readonly graph: NavGraph;
  readonly sim: NavSimulation;
  #entries = new Map<string, Entry>();
  /** Per town room: what its layout was made from, so an unchanged district is left alone. */
  #townKeys = new Map<string, string>();
  /** The cells of each town room that a district road's portal stands on: they stay open whatever the plan says. */
  #portalCells = new Map<string, Cell[]>();
  /** What the town rooms were last brought up to date for; null when that sync left something for the next one. */
  #townSynced: { plan: TownPlan; walkways: readonly Bounds[]; standing: string } | null = null;
  #usedLots = new Set<string>();

  constructor() {
    this.definitions = { ...interiorDefinitions };
    this.graph = new NavGraph(this.definitions as Definitions);
    const plan = standalonePlan([]);
    this.graph.addRoom({ id: TOWN_ROOM, layout: this.#townLayout(plan, CENTRAL_SLOT, townWalkways(plan))! });
    this.sim = new NavSimulation(this.graph, []);
  }

  entry(slug: string): Entry | undefined {
    return this.#entries.get(slug);
  }
  slugs(): string[] {
    return [...this.#entries.keys()];
  }
  /** Every town room: one per district the walkers can be in. */
  townRooms(): string[] {
    return this.graph.roomIds().filter(isTownRoom);
  }
  /** Height of the ground under a walker (see `groundAt`). */
  groundAt(x: number, z: number): number {
    return groundAt(x, z, this.#usedLots);
  }

  /**
   * Brings the graph in line with the buildings on the plan's lots (`standalonePlan` when none is given). Only
   * changed districts, buildings and rooms are touched. An archived building has no rooms: nobody walks into it.
   * `walkways` is the paving the walkers keep to, in world units: the dressing's own once it paves by plan.
   * `buildingPlan` picks the building template; a switch rebuilds every building (its structure changes).
   */
  sync(
    buildings: readonly Building[],
    plan: TownPlan = standalonePlan(buildings),
    walkways: readonly Bounds[] = townWalkways(plan),
    buildingPlan: BuildingPlan = DEFAULT_BUILDING_PLAN,
  ): NavSyncResult {
    const result: NavSyncResult = { rebuilt: [], removed: [] };
    const wanted = new Map<string, { building: Building; cell: GridCell }>();
    const lots = new Map(plan.lots.map((l) => [l.slug, l]));
    for (const building of buildings) {
      const lot = lots.get(building.slug);
      if (lot && !building.archived) wanted.set(building.slug, { building, cell: lot.cell });
    }
    for (const [slug, entry] of this.#entries) {
      const cell = wanted.get(slug)?.cell;
      if (!cell || lotKey(cell) !== lotKey(entry.cell)) {
        this.#removeBuilding(entry);
        this.#entries.delete(slug);
        result.removed.push(slug);
      }
    }
    this.#usedLots = new Set(plan.lots.map((l) => lotKey(l.cell)));
    // The town rooms follow the plan, the paving and which buildings stand in the graph: when none of them changed
    // since a sync that went through, they are as they should be (a region's rooms are costly to work out again).
    const standing = [...this.#entries.keys()].join();
    const last = this.#townSynced;
    if (!last || last.plan !== plan || last.walkways !== walkways || last.standing !== standing) this.#townSynced = this.#syncTown(plan, walkways) ? { plan, walkways, standing } : null;
    for (const [slug, { building, cell }] of wanted) {
      const template = buildingTemplate(building, buildingPlan);
      const structure = structureKey(template);
      let entry = this.#entries.get(slug);
      if (!entry || entry.structure !== structure) {
        const evacuees = entry ? this.#removeBuilding(entry) : [];
        // A walker standing where the building goes kept its district from updating: wait for the next sync.
        if (!this.#walkable(townRoomId(slotOfLot(cell)), entranceCell(cell))) continue;
        entry = { slug, cell, template, structure, props: new Map(), desks: new Map(), building };
        this.#addBuilding(entry);
        this.#entries.set(slug, entry);
        for (const e of evacuees) this.#return(entry, e);
        if (evacuees.length || result.removed.includes(slug)) result.rebuilt.push(slug);
      } else {
        for (const room of template.rooms) {
          const key = propsKey(room.layout);
          if (entry.props.get(room.kind) === key) continue;
          if (this.sim.updateRoom(roomId(slug, room.kind), room.layout).ok) entry.props.set(room.kind, key);
        }
        entry.template = template;
      }
      entry.building = building;
      entry.desks = assignDesks(building, template);
    }
    return result;
  }

  /** The agent's desk seat, or a free spot in its home room when it has no desk (past the room's capacity). */
  home(slug: string, key: AgentKey, kind: RoomKind | null): Location | null {
    const entry = this.#entries.get(slug);
    if (!entry) return null;
    const desk = entry.desks.get(key);
    if (desk) return this.#local(entry, desk.seat);
    const room = roomOf(entry.template, kind ?? "lobby") ?? roomOf(entry.template, "lobby");
    if (!room) return null;
    return { room: roomId(slug, room.kind), cell: { x: Math.floor(room.layout.grid.width / 2), z: room.layout.grid.depth - 2 } };
  }

  /** Approach cells of every prop with `tag` in a building (optionally one model room, resolved to its hall), in template order. */
  spots(slug: string, tag: string, kind?: RoomKind): Location[] {
    const entry = this.#entries.get(slug);
    if (!entry) return [];
    const out: Location[] = [];
    const only = kind ? roomOf(entry.template, kind) : undefined;
    if (kind && !only) return [];
    for (const room of entry.template.rooms) {
      if (only && room !== only) continue;
      for (const prop of room.layout.props) {
        const def = this.definitions[prop.definitionId];
        if (!def?.tags.includes(tag)) continue;
        for (const a of def.approaches) {
          const cell = { x: prop.cell.x + a.x, z: prop.cell.z + a.z };
          if (this.#walkable(roomId(entry.slug, room.kind), cell)) out.push({ room: roomId(entry.slug, room.kind), cell });
        }
      }
    }
    return out;
  }

  /**
   * The approach cells of `tag` props in one room that a walker can actually reach from `from` (the agent's seat, or
   * the lobby when it has none): what the director asks before it sends someone there.
   */
  reachableSpots(slug: string, tag: string, kind: RoomKind, from: Location | null = this.lobby(slug)): Location[] {
    if (!from) return [];
    return this.spots(slug, tag, kind).filter((spot) => this.canReach(from, spot));
  }

  /** True when a route exists between two open cells (doors included, other walkers ignored). */
  canReach(from: Location, to: Location): boolean {
    return this.graph.planRoute(from, to) !== null;
  }

  /** The tags of the props in a room that have at least one open approach cell, in template order. */
  tags(slug: string, kind: RoomKind): string[] {
    const entry = this.#entries.get(slug);
    const room = entry && roomOf(entry.template, kind);
    if (!entry || !room) return [];
    const out = new Set<string>();
    for (const prop of room.layout.props) {
      const def = this.definitions[prop.definitionId];
      if (!def) continue;
      const open = def.approaches.some((a) => this.#walkable(roomId(slug, room.kind), { x: prop.cell.x + a.x, z: prop.cell.z + a.z }));
      if (open) for (const tag of def.tags) out.add(tag);
    }
    return [...out];
  }

  /**
   * Open cells right next to the props with `tag` in a room (a ring around the meeting table), never a desk seat,
   * in a fixed order: where gathered agents stand.
   */
  around(slug: string, tag: string, kind: RoomKind): Location[] {
    const entry = this.#entries.get(slug);
    const room = entry && roomOf(entry.template, kind);
    if (!entry || !room) return [];
    const id = roomId(slug, room.kind);
    const seen = new Set<string>();
    const out: Location[] = [];
    for (const prop of room.layout.props) {
      const def = this.definitions[prop.definitionId];
      if (!def?.tags.includes(tag)) continue;
      const { width, depth } = def.footprint;
      for (let z = -1; z <= depth; z++)
        for (let x = -1; x <= width; x++) {
          const edge = x === -1 || z === -1 || x === width || z === depth;
          const corner = (x === -1 || x === width) && (z === -1 || z === depth);
          if (!edge || corner) continue;
          const cell = { x: prop.cell.x + x, z: prop.cell.z + z };
          const key = `${cell.x},${cell.z}`;
          if (seen.has(key) || !this.#walkable(id, cell) || this.#isSeat(entry, id, cell)) continue;
          seen.add(key);
          out.push({ room: id, cell });
        }
    }
    return out;
  }

  /**
   * The prop with `tag` that someone at `location` stands at (on one of its approach cells or right beside it): its
   * definition, its footprint's centre in building cells and its model's turn about y.
   */
  standsAt(location: Location, tag: string): { definitionId: string; x: number; z: number; rotation: number } | null {
    const parsed = parseRoomId(location.room);
    const entry = parsed && this.#entries.get(parsed.slug);
    const room = entry && parsed ? roomOf(entry.template, parsed.kind) : undefined;
    if (!room) return null;
    for (const prop of room.layout.props) {
      const def = this.definitions[prop.definitionId];
      if (!def?.tags.includes(tag)) continue;
      const turned = prop.rotation % 2 === 1;
      const halfX = (turned ? def.footprint.depth : def.footprint.width) / 2,
        halfZ = (turned ? def.footprint.width : def.footprint.depth) / 2;
      const pose = { x: prop.cell.x + halfX, z: prop.cell.z + halfZ, rotationY: -prop.rotation * (Math.PI / 2) };
      const dx = Math.abs(location.cell.x + 0.5 - pose.x) - halfX,
        dz = Math.abs(location.cell.z + 0.5 - pose.z) - halfZ;
      // Beside the footprint, not on it and not across a corner.
      if (Math.max(dx, dz) > 0 && Math.max(dx, dz) < 1 && Math.min(dx, dz) < 0) return { definitionId: prop.definitionId, x: room.origin.x + pose.x, z: room.origin.z + pose.z, rotation: pose.rotationY };
    }
    return null;
  }

  /** Open cells beside an agent's seat (west, east, then north and south), never another desk's seat. */
  beside(slug: string, key: AgentKey, kind: RoomKind | null): Location[] {
    const entry = this.#entries.get(slug);
    const seat = this.home(slug, key, kind);
    if (!entry || !seat) return [];
    const out: Location[] = [];
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const cell = { x: seat.cell.x + dx, z: seat.cell.z + dz };
      if (this.#walkable(seat.room, cell) && !this.#isSeat(entry, seat.room, cell)) out.push({ room: seat.room, cell });
    }
    return out;
  }

  #isSeat(entry: Entry, room: string, cell: Cell): boolean {
    for (const desk of entry.desks.values()) {
      const seat = this.#local(entry, desk.seat);
      if (seat && seat.room === room && seat.cell.x === cell.x && seat.cell.z === cell.z) return true;
    }
    return false;
  }

  /** The lobby cell inside the front door. */
  lobby(slug: string): Location | null {
    const entry = this.#entries.get(slug);
    const door = entry?.template.doors.find((d) => d.b.room === "town");
    return entry && door ? { room: roomId(slug, "lobby"), cell: { x: door.a.cell.x, z: door.a.cell.z - 1 } } : null;
  }
  /** The town cell in front of a building's door. */
  front(slug: string): Location | null {
    const entry = this.#entries.get(slug);
    return entry ? { room: townRoomId(slotOfLot(entry.cell)), cell: frontCell(entry.cell) } : null;
  }

  /**
   * The bus between districts, as the simplest honest thing: a figure that moves to a building in another district
   * is not walked across the region (a district is some two hundred units wide). It steps off where the district
   * road enters the destination's district (the stop at its gate; the one nearest to where it came from) and walks
   * on from there. Null when both buildings stand in one district, or the destination's district has no road yet.
   */
  arrival(to: string, from: string): Location | null {
    const there = this.front(to),
      here = this.front(from);
    if (!there || !here || there.room === here.room) return null;
    const origin = this.toWorld(here),
      at = { x: 0, z: 0 };
    let best: Location | null = null,
      bestDistance = Infinity;
    for (const cell of this.#portalCells.get(there.room) ?? []) {
      // The stop is the road's own cell on this side of the border: open ground, and a door cell of the graph.
      const state = this.graph.room(there.room);
      if (!state || state.blocked[cell.z * state.layout.grid.width + cell.x] !== -1) continue;
      this.toWorld({ room: there.room, cell }, at);
      const distance = Math.abs(at.x - origin.x) + Math.abs(at.z - origin.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { room: there.room, cell };
      }
    }
    return best;
  }

  /** World position (x, z) of a location's cell centre. */
  toWorld(location: Location, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
    const slot = townRoomSlot(location.room);
    if (slot) {
      const c = townCellCentre(location.cell, slot);
      out.x = c.x;
      out.z = c.z;
      return out;
    }
    const parsed = parseRoomId(location.room);
    const entry = parsed && this.#entries.get(parsed.slug);
    const room = entry && parsed ? roomOf(entry.template, parsed.kind) : undefined;
    if (!entry || !room) {
      out.x = 0;
      out.z = 0;
      return out;
    }
    const o = buildingOrigin(entry.cell);
    out.x = o.x + (room.origin.x + location.cell.x + 0.5) * BUILDING_CELL;
    out.z = o.z + (room.origin.z + location.cell.z + 0.5) * BUILDING_CELL;
    return out;
  }

  /** The room IDs of one building. */
  rooms(slug: string): string[] {
    const entry = this.#entries.get(slug);
    return entry ? entry.template.rooms.map((r) => roomId(slug, r.kind)) : [];
  }

  #local(entry: Entry, buildingCell: Cell): Location | null {
    for (const room of entry.template.rooms) {
      const x = buildingCell.x - room.origin.x,
        z = buildingCell.z - room.origin.z;
      if (x >= 0 && z >= 0 && x < room.layout.grid.width && z < room.layout.grid.depth) return { room: roomId(entry.slug, room.kind), cell: { x, z } };
    }
    return null;
  }

  #walkable(room: string, cell: Cell): boolean {
    const state = this.graph.room(room);
    if (!state) return false;
    const { width, depth } = state.layout.grid;
    if (cell.x < 0 || cell.z < 0 || cell.x >= width || cell.z >= depth) return false;
    return state.blocked[cell.z * width + cell.x] === -1 && !this.graph.isDoorCell({ room, cell });
  }

  /**
   * The town rooms: one per district in use and per district a road passes through. A new district gets its room
   * and the road's portal; a district whose paving or buildings changed has its room updated in place.
   */
  #syncTown(plan: TownPlan, walkways: readonly Bounds[]): boolean {
    let settled = true;
    const slots = new Map<string, DistrictSlot>(plan.districts.map((d) => [slotKey(d.slot), d.slot]));
    const portals = plan.roads.map(portal);
    for (const road of plan.roads) for (const slot of [road.from, road.to]) slots.set(slotKey(slot), slot);
    // A portal's cells stay open from now on, whatever a later plan paves.
    for (const door of portals)
      for (const side of [door.a, door.b]) {
        const cells = this.#portalCells.get(side.room) ?? [];
        if (!cells.some((c) => c.x === side.cell.x && c.z === side.cell.z)) this.#portalCells.set(side.room, [...cells, side.cell]);
      }
    for (const slot of slots.values()) {
      const id = townRoomId(slot);
      const layout = this.#townLayout(plan, slot, walkways);
      if (!layout) continue;
      const key = JSON.stringify(layout.props);
      if (!this.graph.room(id)) this.graph.addRoom({ id, layout });
      // A walker standing where a new building goes blocks the update; the next sync tries again.
      else if (this.#townKeys.get(id) === key) continue;
      else if (!this.sim.updateRoom(id, layout).ok) {
        settled = false;
        continue;
      }
      this.#townKeys.set(id, key);
    }
    for (const door of portals)
      if (this.graph.door(door.id)) continue;
      else if (this.#walkable(door.a.room, door.a.cell) && this.#walkable(door.b.room, door.b.cell)) this.graph.addDoor({ id: door.id, a: door.a, b: door.b });
      else settled = false;
    return settled;
  }

  /** A district room's layout for a plan, or null when nothing in it is paved. */
  #townLayout(plan: TownPlan, slot: DistrictSlot, walkways: readonly Bounds[]): WorldLayout | null {
    const props: WorldProp[] = [];
    const block = (id: string, r: Rect) => {
      const width = r.x1 - r.x0 + 1,
        depth = r.z1 - r.z0 + 1;
      const definitionId = `block-${width}x${depth}`;
      this.definitions[definitionId] ??= {
        id: definitionId,
        label: "Off the path",
        footprint: { width, depth },
        blocksMovement: true,
        tags: ["town"],
        approaches: [],
      };
      props.push({ id, definitionId, cell: { x: r.x0, z: r.z0 }, rotation: 0 });
    };
    // Closed cells in as few rectangles as a greedy sweep finds: runs along x, grown down z while they match.
    const open = townOpenCells(plan, slot, walkways);
    const key = slotKey(slot);
    for (const lot of plan.lots) if (!lot.archived && slotKey(slotOfLot(lot.cell)) === key) for (const r of [buildingRect(lot.cell), truckRect(lot.cell)]) closeRect(open, r);
    for (const lot of plan.lots) {
      if (lot.archived || slotKey(slotOfLot(lot.cell)) !== key) continue;
      const e = entranceCell(lot.cell);
      open[e.z * TOWN_GRID.width + e.x] = 1;
    }
    for (const cell of this.#portalCells.get(townRoomId(slot)) ?? []) open[cell.z * TOWN_GRID.width + cell.x] = 1;
    // A building that still stands in the graph keeps its door cell open until its rooms are taken out.
    for (const entry of this.#entries.values()) {
      if (slotKey(slotOfLot(entry.cell)) !== key) continue;
      const e = entranceCell(entry.cell);
      open[e.z * TOWN_GRID.width + e.x] = 1;
    }
    const { width, depth } = TOWN_GRID;
    const done = new Uint8Array(width * depth);
    let n = 0;
    for (let z = 0; z < depth; z++)
      for (let x = 0; x < width; x++) {
        const i = z * width + x;
        if (open[i] || done[i]) continue;
        let x1 = x;
        while (x1 + 1 < width && !open[i + x1 + 1 - x] && !done[i + x1 + 1 - x]) x1++;
        let z1 = z;
        const rowFree = (zz: number) => {
          for (let xx = x; xx <= x1; xx++) if (open[zz * width + xx] || done[zz * width + xx]) return false;
          return true;
        };
        while (z1 + 1 < depth && rowFree(z1 + 1)) z1++;
        for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) done[zz * width + xx] = 1;
        block(`off-${n++}`, { x0: x, z0: z, x1, z1 });
      }
    // The room's entrance must be open: the post office's forecourt in the centre, any open cell elsewhere.
    let entrance = POST_OFFICE_CELL;
    if (key !== slotKey(CENTRAL_SLOT)) {
      const first = open.indexOf(1);
      if (first < 0) return null;
      entrance = { x: first % width, z: Math.floor(first / width) };
    }
    return { version: 1, grid: { ...TOWN_GRID, cellSize: TOWN_CELL }, props, entrance };
  }

  #addBuilding(entry: Entry): void {
    const { slug, template, cell } = entry;
    for (const room of template.rooms) {
      this.graph.addRoom({ id: roomId(slug, room.kind), layout: room.layout });
      entry.props.set(room.kind, propsKey(room.layout));
    }
    for (const door of template.doors) {
      if (door.a.room === "town" || door.b.room === "town") continue;
      this.graph.addDoor({ id: `${slug}/${door.id}`, a: { room: roomId(slug, door.a.room), cell: door.a.cell }, b: { room: roomId(slug, door.b.room), cell: door.b.cell } });
    }
    const entrance = template.doors.find((d) => d.b.room === "town");
    if (entrance && entrance.a.room !== "town")
      this.graph.addDoor({
        id: `${slug}/entrance`,
        a: { room: roomId(slug, entrance.a.room), cell: entrance.a.cell },
        b: { room: townRoomId(slotOfLot(cell)), cell: entranceCell(cell) },
        cost: ENTRANCE_COST,
      });
  }

  /** Takes every actor in (or stepping into) the building out, then its rooms and doors. */
  #removeBuilding(entry: Entry): Evacuee[] {
    const prefix = `${entry.slug}/`;
    const evacuees: Evacuee[] = [];
    for (const actor of this.sim.snapshot().actors) {
      const inside = actor.location.room.startsWith(prefix);
      if (!inside && !actor.next?.room.startsWith(prefix)) continue;
      evacuees.push({
        id: actor.id,
        priority: actor.priority,
        kind: inside ? (parseRoomId(actor.location.room)?.kind ?? null) : null,
        location: actor.location,
      });
      this.sim.removeActor(actor.id);
    }
    for (const room of entry.template.rooms) this.graph.removeRoom(roomId(entry.slug, room.kind));
    return evacuees;
  }

  /**
   * Puts an evacuee back where it stood when that room (or the hall now hosting it) still exists and the cell is still
   * inside it, else in the lobby; a street walker stays put.
   */
  #return(entry: Entry, e: Evacuee): void {
    let location: Location;
    const room = e.kind === null ? undefined : roomOf(entry.template, e.kind);
    if (e.kind === null) location = e.location;
    else if (room && e.location.cell.x < room.layout.grid.width && e.location.cell.z < room.layout.grid.depth) location = { room: roomId(entry.slug, room.kind), cell: e.location.cell };
    else location = this.lobby(entry.slug)!;
    this.sim.addActor({ id: e.id, priority: e.priority, location });
  }
}
