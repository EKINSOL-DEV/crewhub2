/**
 * Rooms, doors and two-layer routing. A room is an independent interior grid; a
 * door is a portal between one cell in each of two rooms. The town is a room too,
 * whose door cells are building entrances. Routes are planned over door sides
 * (Dijkstra, a few hundred nodes at most) using cached intra-room distances, and
 * only the first leg gets a local A* path.
 */
import {
  cellKey,
  findPath,
  findPathWeighted,
  inBounds,
  occupancy,
  validateLayout,
  type Cell,
  type Definitions,
  type WorldLayout,
} from "./index.ts";
import { MinHeap } from "./heap.ts";

export interface NavRoom {
  id: string;
  layout: WorldLayout;
}
export interface Location {
  room: string;
  cell: Cell;
}
export interface Door {
  id: string;
  a: Location;
  b: Location;
  /** Cost of crossing from one door cell to the other, in cells. Default 1. */
  cost?: number;
}
export interface RouteLeg {
  room: string;
  fromCell: Cell;
  toCell: Cell;
  /** The door taken at the end of this leg; null on the final leg. */
  viaDoor: string | null;
}
export interface RoutePlan {
  legs: RouteLeg[];
  /** Total cost in cells, door crossings included. */
  cost: number;
  /** Local A* path of the first leg, both ends included. */
  path: Cell[];
}
export interface NavStats {
  /** Local A* searches (plain and weighted). */
  localSearches: number;
  /** Door-to-door distance lookups answered from the cache. */
  cacheHits: number;
  /** Distance fields computed on a cache miss (one breadth-first fill each). */
  cacheMisses: number;
  /** Portal-graph searches. */
  routePlans: number;
}
export interface RoomState {
  readonly id: string;
  readonly layout: WorldLayout;
  /** Bumped by every `updateRoom`. */
  readonly revision: number;
  /** Static occupancy, as returned by `occupancy`. */
  readonly blocked: Int32Array;
}
export interface LocalPathOptions {
  /** Cells other actors hold; forbidden unless `reservedCost` is given. */
  reserved?: ReadonlySet<string>;
  /** Makes reserved cells cost this much to enter instead of forbidding them. */
  reservedCost?: number;
}

interface MutableRoom {
  id: string;
  layout: WorldLayout;
  revision: number;
  blocked: Int32Array;
  /** Distance fields from each door side in this room, valid for `fieldsRevision`. */
  fields: Map<number, Int32Array>;
  fieldsRevision: number;
}

const doorCost = (d: Door) => d.cost ?? 1;
const sameLocation = (a: Location, b: Location) =>
  a.room === b.room && a.cell.x === b.cell.x && a.cell.z === b.cell.z;

export class NavGraph {
  readonly definitions: Definitions;
  readonly stats: NavStats = {
    localSearches: 0,
    cacheHits: 0,
    cacheMisses: 0,
    routePlans: 0,
  };
  /** Bumped whenever a door or room is added or removed. */
  topologyRevision = 0;
  #rooms = new Map<string, MutableRoom>();
  #doors: Door[] = [];

  constructor(definitions: Definitions) {
    this.definitions = definitions;
  }

  addRoom(room: NavRoom): void {
    if (!room.id || this.#rooms.has(room.id))
      throw new Error("Rooms need unique IDs.");
    const layout = validateLayout(room.layout, this.definitions);
    this.#rooms.set(room.id, {
      id: room.id,
      layout,
      revision: 0,
      blocked: occupancy(layout, this.definitions),
      fields: new Map(),
      fieldsRevision: 0,
    });
    this.topologyRevision++;
  }

  /**
   * Replaces a room's layout and bumps its revision. Door cells must stay open.
   * Returns the cell indices whose blocked state changed.
   */
  updateRoom(id: string, layout: WorldLayout): number[] {
    const room = this.#rooms.get(id);
    if (!room) throw new Error(`Unknown room: ${id}`);
    const next = validateLayout(layout, this.definitions);
    const blocked = occupancy(next, this.definitions);
    if (
      next.grid.width !== room.layout.grid.width ||
      next.grid.depth !== room.layout.grid.depth
    )
      throw new Error("Room growth is not supported by updateRoom yet.");
    for (const side of this.#sidesIn(id))
      if (blocked[this.#index(room, side.cell)] !== -1)
        throw new Error("Keep door cells open.");
    const changed: number[] = [];
    for (let i = 0; i < blocked.length; i++)
      if ((blocked[i] === -1) !== (room.blocked[i] === -1)) changed.push(i);
    room.layout = next;
    room.blocked = blocked;
    room.revision++;
    return changed;
  }

  /** Removes a room and every door that touches it. */
  removeRoom(id: string): void {
    if (!this.#rooms.delete(id)) return;
    this.#doors = this.#doors.filter((d) => d.a.room !== id && d.b.room !== id);
    for (const room of this.#rooms.values()) room.fields.clear();
    this.topologyRevision++;
  }

  addDoor(door: Door): void {
    if (!door.id || this.#doors.some((d) => d.id === door.id))
      throw new Error("Doors need unique IDs.");
    if (door.a.room === door.b.room)
      throw new Error("A door joins two different rooms.");
    const cost = doorCost(door);
    if (!Number.isFinite(cost) || cost < 1 || cost > 1000)
      throw new Error("Door cost must be between 1 and 1000.");
    for (const side of [door.a, door.b]) {
      const room = this.#rooms.get(side.room);
      if (!room) throw new Error(`Unknown room: ${side.room}`);
      if (
        !inBounds(room.layout.grid, side.cell) ||
        room.blocked[this.#index(room, side.cell)] !== -1
      )
        throw new Error("Door cells must be open cells inside their room.");
    }
    this.#doors.push(structuredClone(door));
    for (const room of this.#rooms.values()) room.fields.clear();
    this.topologyRevision++;
  }

  removeDoor(id: string): void {
    const before = this.#doors.length;
    this.#doors = this.#doors.filter((d) => d.id !== id);
    if (this.#doors.length === before) return;
    for (const room of this.#rooms.values()) room.fields.clear();
    this.topologyRevision++;
  }

  room(id: string): RoomState | undefined {
    return this.#rooms.get(id);
  }
  roomIds(): string[] {
    return [...this.#rooms.keys()];
  }
  doors(): readonly Door[] {
    return this.#doors;
  }
  door(id: string): Door | undefined {
    return this.#doors.find((d) => d.id === id);
  }
  /** True when the cell is one end of any door. */
  isDoorCell(location: Location): boolean {
    return this.#doors.some(
      (d) => sameLocation(d.a, location) || sameLocation(d.b, location),
    );
  }

  /** Local A* inside one room over static occupancy; counted in `stats`. */
  localPath(
    roomId: string,
    from: Cell,
    to: Cell,
    options: LocalPathOptions = {},
  ): Cell[] | null {
    const room = this.#rooms.get(roomId);
    if (!room) return null;
    this.stats.localSearches++;
    const reserved = options.reserved;
    if (!reserved || !reserved.size)
      return findPath(room.layout.grid, room.blocked, from, to);
    if (options.reservedCost === undefined)
      return findPath(room.layout.grid, room.blocked, from, to, reserved);
    const expensive = options.reservedCost;
    return findPathWeighted(room.layout.grid, room.blocked, from, to, (c) =>
      reserved.has(cellKey(c)) ? expensive : 1,
    );
  }

  /**
   * Plans a route between two locations. Door-to-door distances come from the
   * per-revision cache; only the first leg runs local A*. Other actors are not
   * considered here, except through `firstLeg` for the first leg's local path
   * (forbidden reserved cells, falling back to the static path).
   */
  planRoute(
    from: Location,
    to: Location,
    firstLeg: LocalPathOptions = {},
  ): RoutePlan | null {
    const start = this.#rooms.get(from.room),
      goal = this.#rooms.get(to.room);
    if (
      !start ||
      !goal ||
      !inBounds(start.layout.grid, from.cell) ||
      !inBounds(goal.layout.grid, to.cell) ||
      start.blocked[this.#index(start, from.cell)] !== -1 ||
      goal.blocked[this.#index(goal, to.cell)] !== -1
    )
      return null;
    this.stats.routePlans++;
    const doors = this.#doors;
    const sideCount = doors.length * 2;
    const START = sideCount,
      GOAL = sideCount + 1;
    const side = (i: number): Location => {
      const d = doors[i >> 1]!;
      return i & 1 ? d.b : d.a;
    };
    const sidesByRoom = new Map<string, number[]>();
    for (let i = 0; i < sideCount; i++) {
      const list = sidesByRoom.get(side(i).room) ?? [];
      list.push(i);
      sidesByRoom.set(side(i).room, list);
    }
    let direct: Cell[] | null = null;
    if (from.room === to.room) {
      direct = this.localPath(from.room, from.cell, to.cell);
      if (direct && direct.length === 1)
        return {
          legs: [
            {
              room: from.room,
              fromCell: { ...from.cell },
              toCell: { ...to.cell },
              viaDoor: null,
            },
          ],
          cost: 0,
          path: direct,
        };
    }
    const dist = new Float64Array(sideCount + 2).fill(Infinity),
      previous = new Int32Array(sideCount + 2).fill(-1),
      done = new Uint8Array(sideCount + 2),
      heap = new MinHeap();
    dist[START] = 0;
    heap.push(0, START, START);
    const relax = (node: number, next: number, weight: number) => {
      if (!Number.isFinite(weight) || done[next]) return;
      const candidate = dist[node]! + weight;
      if (candidate < dist[next]!) {
        dist[next] = candidate;
        previous[next] = node;
        heap.push(candidate, next, next);
      }
    };
    while (heap.size) {
      const node = heap.pop();
      if (done[node]) continue;
      done[node] = 1;
      if (node === GOAL) break;
      if (node === START) {
        if (direct) relax(START, GOAL, direct.length - 1);
        for (const s of sidesByRoom.get(from.room) ?? [])
          relax(START, s, this.#distance(s, side(s), from.cell));
        continue;
      }
      const here = side(node);
      relax(node, node ^ 1, doorCost(doors[node >> 1]!));
      for (const s of sidesByRoom.get(here.room) ?? [])
        if (s !== node) relax(node, s, this.#distance(node, here, side(s).cell));
      if (here.room === to.room)
        relax(node, GOAL, this.#distance(node, here, to.cell));
    }
    if (!Number.isFinite(dist[GOAL]!)) return null;
    const chain: number[] = [];
    for (let n = previous[GOAL]!; n !== START; n = previous[n]!) chain.push(n);
    chain.reverse();
    const legs: RouteLeg[] = [];
    let cursor: Location = from;
    for (let i = 0; i < chain.length; i += 2) {
      const exit = chain[i]!,
        entry = chain[i + 1]!;
      legs.push({
        room: cursor.room,
        fromCell: { ...cursor.cell },
        toCell: { ...side(exit).cell },
        viaDoor: doors[exit >> 1]!.id,
      });
      cursor = side(entry);
    }
    legs.push({
      room: to.room,
      fromCell: { ...cursor.cell },
      toCell: { ...to.cell },
      viaDoor: null,
    });
    const first = legs[0]!;
    const path =
      legs.length === 1 && direct && !firstLeg.reserved?.size
        ? direct
        : this.#firstPath(first, firstLeg);
    if (!path) return null;
    return { legs, cost: dist[GOAL]!, path };
  }

  #firstPath(leg: RouteLeg, options: LocalPathOptions): Cell[] | null {
    if (options.reserved?.size) {
      const avoiding = this.localPath(leg.room, leg.fromCell, leg.toCell, {
        reserved: options.reserved,
        ...(options.reservedCost === undefined
          ? {}
          : { reservedCost: options.reservedCost }),
      });
      if (avoiding) return avoiding;
    }
    return this.localPath(leg.room, leg.fromCell, leg.toCell);
  }

  /** Cached steps from door side `sideIndex` to `cell` in the same room. */
  #distance(sideIndex: number, side: Location, cell: Cell): number {
    const room = this.#rooms.get(side.room)!;
    if (room.fieldsRevision !== room.revision) {
      room.fields.clear();
      room.fieldsRevision = room.revision;
    }
    let field = room.fields.get(sideIndex);
    if (field) this.stats.cacheHits++;
    else {
      this.stats.cacheMisses++;
      field = distanceField(room, side.cell);
      room.fields.set(sideIndex, field);
    }
    const d = field[this.#index(room, cell)]!;
    return d < 0 ? Infinity : d;
  }

  #sidesIn(roomId: string): Location[] {
    const sides: Location[] = [];
    for (const d of this.#doors)
      for (const s of [d.a, d.b]) if (s.room === roomId) sides.push(s);
    return sides;
  }

  #index(room: MutableRoom, c: Cell): number {
    return c.z * room.layout.grid.width + c.x;
  }
}

/** Breadth-first step counts from `origin` over static occupancy; -1 is unreachable. */
function distanceField(room: MutableRoom, origin: Cell): Int32Array {
  const { width, depth } = room.layout.grid;
  const field = new Int32Array(width * depth).fill(-1),
    queue = new Int32Array(width * depth);
  const first = origin.z * width + origin.x;
  if (room.blocked[first] !== -1) return field;
  field[first] = 0;
  queue[0] = first;
  let read = 0,
    write = 1;
  while (read < write) {
    const id = queue[read++]!,
      x = id % width,
      z = (id - x) / width,
      d = field[id]! + 1;
    if (z > 0) visit(id - width);
    if (x < width - 1) visit(id + 1);
    if (z < depth - 1) visit(id + width);
    if (x > 0) visit(id - 1);
    function visit(n: number) {
      if (field[n] === -1 && room.blocked[n] === -1) {
        field[n] = d;
        queue[write++] = n;
      }
    }
  }
  return field;
}
