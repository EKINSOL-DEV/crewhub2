/* The navigation world: one portal graph for the whole town. The town is a room on its own coarse grid (plots,
   streets, the post office and the town hall); every building adds its rooms from the building template, joined by
   the template's doors, and its lobby door joins the town cell just outside the building's entrance. The graph and
   the simulation live together here so a rebuilt building can take its actors out and put them back. Pure: no
   Three.js, no DOM, so it runs under `node --test`.

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
import type { AgentKey, Building, RoomKind } from "@crewhub/world-model";
import { BUILDING_CELL, buildingTemplate, DEPTH, ENTRANCE, interiorDefinitions, LOADING, MAX_WIDTH, PLOT_MARGIN, roomOf, type BuildingTemplate } from "./buildingTemplate.ts";
import { assignDesks, type DeskSlot } from "./interiorLayout.ts";
import { civicCenter, PLOT_SIZE, plotCenter, TOWN_CAPACITY, townBounds } from "./townLayout.ts";

export const TOWN_ROOM = "town";
/** World units per town cell: two building cells, so a walk across the town stays short. */
export const TOWN_CELL = 1.2;
/** Crossing a building's front door costs this many cells: the step down to the street. */
const ENTRANCE_COST = 2;
/** The postman has right of way on the street. */
export const POSTMAN_PRIORITY = 10;

const BOUNDS = townBounds();
export const TOWN_GRID = {
  width: Math.ceil((BOUNDS.maxX - BOUNDS.minX) / TOWN_CELL),
  depth: Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / TOWN_CELL),
};

export const roomId = (slug: string, kind: RoomKind) => `${slug}/${kind}`;
export function parseRoomId(id: string): { slug: string; kind: RoomKind } | null {
  const at = id.lastIndexOf("/");
  return at < 0 ? null : { slug: id.slice(0, at), kind: id.slice(at + 1) as RoomKind };
}

/**
 * World position of building cell (0, 0) on plot `index`: the north-west corner, which never moves (BuildingView). The
 * widest building is centred east to west; the north wall keeps `PLOT_MARGIN` from the plot edge, so the front yard
 * (path, step and the truck's apron) lies between the south wall and the street.
 */
export function buildingOrigin(index: number): { x: number; z: number } {
  const c = plotCenter(index);
  return { x: c.x - (MAX_WIDTH * BUILDING_CELL) / 2, z: c.z - PLOT_SIZE / 2 + PLOT_MARGIN };
}

export function townCellAt(x: number, z: number): Cell {
  return {
    x: Math.min(TOWN_GRID.width - 1, Math.max(0, Math.floor((x - BOUNDS.minX) / TOWN_CELL))),
    z: Math.min(TOWN_GRID.depth - 1, Math.max(0, Math.floor((z - BOUNDS.minZ) / TOWN_CELL))),
  };
}
export function townCellCentre(cell: Cell): { x: number; z: number } {
  return { x: BOUNDS.minX + (cell.x + 0.5) * TOWN_CELL, z: BOUNDS.minZ + (cell.z + 0.5) * TOWN_CELL };
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
/** The town cells a world rectangle touches (inclusive). */
function cover(minX: number, minZ: number, maxX: number, maxZ: number): Rect {
  const a = townCellAt(minX, minZ),
    b = townCellAt(maxX - 1e-6, maxZ - 1e-6);
  return { x0: a.x, z0: a.z, x1: b.x, z1: b.z };
}

/** A building's footprint on the town grid: the shell at its widest, the flag at the north-west corner. */
export function buildingRect(index: number): Rect {
  const o = buildingOrigin(index);
  return cover(o.x - 0.6, o.z - 0.6, o.x + MAX_WIDTH * BUILDING_CELL, o.z + DEPTH * BUILDING_CELL);
}
/** The truck on its apron outside dispatch's loading door (BuildingView: TRUCK_SPOT). */
export function truckRect(index: number): Rect {
  const o = buildingOrigin(index);
  return cover(o.x + (LOADING.x1 - 1) * BUILDING_CELL, o.z + (DEPTH + 0.3) * BUILDING_CELL, o.x + (LOADING.x2 + 2) * BUILDING_CELL, o.z + (DEPTH + 4) * BUILDING_CELL);
}

/** The town cell just outside a building's front door (the town side of the entrance door). */
export function entranceCell(index: number): Cell {
  const o = buildingOrigin(index);
  const x = townCellAt(o.x + (ENTRANCE.x + 0.5) * BUILDING_CELL, 0).x;
  return { x, z: buildingRect(index).z1 + 1 };
}
/** Where walkers stop outside a building: one step down the path from the door (door cells are no destinations). */
export function frontCell(index: number): Cell {
  const e = entranceCell(index);
  return { x: e.x, z: e.z + 1 };
}

const POST = civicCenter("post-office"),
  HALL = civicCenter("town-hall");
/** The post office's back and counter, and the town hall's steps and columns; their front lawns stay open. */
const CIVIC_RECTS: Rect[] = [
  cover(POST.x - 1.8, POST.z - 1.9, POST.x + 1.8, POST.z - 0.45),
  cover(HALL.x - 2.2, HALL.z - 1.9, HALL.x + 2.2, HALL.z + 0.6),
];
/** The postman's place in front of the post office counter. */
export const POST_OFFICE_CELL = townCellAt(POST.x - 0.5, POST.z + 1);
/** Where the postman leaves a letter for a recipient who works in no building. */
export const TOWN_HALL_CELL = townCellAt(HALL.x + 3, HALL.z + 2.2);

/** Height of the ground under a walker: the lawn of a plot or a civic lot, else the street. */
export function groundAt(x: number, z: number): number {
  const LAWN = 0.17,
    STREET = 0.02;
  for (const c of [POST, HALL]) if (Math.abs(x - c.x) <= CIVIC_LAWN / 2 && Math.abs(z - c.z) <= CIVIC_LAWN / 2) return LAWN;
  for (let i = 0; i < TOWN_CAPACITY; i++) {
    const p = plotCenter(i);
    if (Math.abs(x - p.x) <= PLOT_SIZE / 2 && Math.abs(z - p.z) <= PLOT_SIZE / 2) return LAWN;
  }
  return STREET;
}
/** The civic lots' lawn (TownScene). */
const CIVIC_LAWN = 9;

/** A building template as the graph sees it: room shapes and doors (structure) and furniture per room. */
function structureKey(t: BuildingTemplate): string {
  return JSON.stringify([t.rooms.map((r) => [r.kind, r.origin, r.layout.grid.width, r.layout.grid.depth]), t.doors]);
}
const propsKey = (layout: WorldLayout) => JSON.stringify(layout.props);

interface Entry {
  slug: string;
  index: number;
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
  #townKey = "";

  constructor() {
    this.definitions = { ...interiorDefinitions };
    this.graph = new NavGraph(this.definitions as Definitions);
    this.graph.addRoom({ id: TOWN_ROOM, layout: this.#townLayout([]) });
    this.sim = new NavSimulation(this.graph, []);
  }

  entry(slug: string): Entry | undefined {
    return this.#entries.get(slug);
  }
  slugs(): string[] {
    return [...this.#entries.keys()];
  }

  /** Brings the graph in line with the buildings (plot order = index). Only changed buildings and rooms are touched. */
  sync(buildings: readonly Building[]): NavSyncResult {
    const result: NavSyncResult = { rebuilt: [], removed: [] };
    const wanted = new Map<string, { building: Building; index: number }>();
    buildings.slice(0, TOWN_CAPACITY).forEach((building, index) => {
      if (!building.archived) wanted.set(building.slug, { building, index });
    });
    for (const [slug, entry] of this.#entries)
      if (wanted.get(slug)?.index !== entry.index) {
        this.#removeBuilding(entry);
        this.#entries.delete(slug);
        result.removed.push(slug);
      }
    const townKey = JSON.stringify([...wanted.values()].map((w) => w.index).sort((a, b) => a - b));
    if (townKey !== this.#townKey) {
      const placed = this.sim.updateRoom(TOWN_ROOM, this.#townLayout([...wanted.values()].map((w) => w.index)));
      // A walker standing where a new building goes blocks the update; the next sync tries again.
      if (placed.ok) this.#townKey = townKey;
    }
    for (const [slug, { building, index }] of wanted) {
      const template = buildingTemplate(building);
      const structure = structureKey(template);
      let entry = this.#entries.get(slug);
      if (!entry || entry.structure !== structure) {
        const evacuees = entry ? this.#removeBuilding(entry) : [];
        entry = { slug, index, template, structure, props: new Map(), desks: new Map(), building };
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

  /** Approach cells of every prop with `tag` in a building (optionally one room), in template order. */
  spots(slug: string, tag: string, kind?: RoomKind): Location[] {
    const entry = this.#entries.get(slug);
    if (!entry) return [];
    const out: Location[] = [];
    for (const room of entry.template.rooms) {
      if (kind && room.kind !== kind) continue;
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
      const open = def.approaches.some((a) => this.#walkable(roomId(slug, kind), { x: prop.cell.x + a.x, z: prop.cell.z + a.z }));
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
    const id = roomId(slug, kind);
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
    return entry ? { room: TOWN_ROOM, cell: frontCell(entry.index) } : null;
  }

  /** World position (x, z) of a location's cell centre. */
  toWorld(location: Location, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
    if (location.room === TOWN_ROOM) {
      const c = townCellCentre(location.cell);
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
    const o = buildingOrigin(entry.index);
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

  #townLayout(indices: number[]): WorldLayout {
    const props: WorldProp[] = [];
    const block = (id: string, r: Rect) => {
      const width = r.x1 - r.x0 + 1,
        depth = r.z1 - r.z0 + 1;
      const definitionId = `block-${width}x${depth}`;
      this.definitions[definitionId] ??= {
        id: definitionId,
        label: "Building footprint",
        footprint: { width, depth },
        blocksMovement: true,
        tags: ["town"],
        approaches: [],
      };
      props.push({ id, definitionId, cell: { x: r.x0, z: r.z0 }, rotation: 0 });
    };
    CIVIC_RECTS.forEach((r, i) => block(`civic-${i}`, r));
    for (const index of indices) {
      block(`plot-${index}`, buildingRect(index));
      block(`truck-${index}`, truckRect(index));
    }
    return { version: 1, grid: { ...TOWN_GRID, cellSize: TOWN_CELL }, props, entrance: POST_OFFICE_CELL };
  }

  #addBuilding(entry: Entry): void {
    const { slug, template, index } = entry;
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
        b: { room: TOWN_ROOM, cell: entranceCell(index) },
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

  /** Puts an evacuee back where it stood when that room still exists, else in the lobby; a street walker stays put. */
  #return(entry: Entry, e: Evacuee): void {
    let location: Location;
    if (e.kind === null) location = e.location;
    else if (roomOf(entry.template, e.kind)) location = { room: roomId(entry.slug, e.kind), cell: e.location.cell };
    else location = this.lobby(entry.slug)!;
    this.sim.addActor({ id: e.id, priority: e.priority, location });
  }
}
