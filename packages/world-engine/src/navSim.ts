/**
 * Movement across rooms and doors. Generalises `WorldSimulation` to a `NavGraph`:
 * the same reservations (current and next cell), speed and tick cap, plus
 * single-occupancy doors with a FIFO queue, a wait budget with a weighted replan
 * and a step-aside, event-driven replanning and per-room detail levels.
 */
import {
  cellKey,
  occupancy,
  validateLayout,
  type Cell,
  type Placement,
  type WorldLayout,
} from "./index.ts";
import type { Door, Location, NavGraph, NavStats, RouteLeg } from "./nav.ts";

export type Detail = "full" | "offscreen";
export type NavActorStatus =
  | "idle"
  | "moving"
  | "waiting"
  | "arrived"
  | "unreachable";
export interface NavActorInput {
  id: string;
  /** Higher wins when two actors block each other. Default 0. */
  priority?: number;
  location: Location;
}
export interface NavActorSnapshot {
  id: string;
  priority: number;
  location: Location;
  /** The reserved cell the actor is moving into; may be in another room while crossing a door. */
  next: Location | null;
  /** 0..1 along the current segment. */
  progress: number;
  destination: Location | null;
  status: NavActorStatus;
  /** Seconds stalled on the wait budget (see `WAIT_REPLAN_SECONDS`). */
  waiting: number;
  /** Rooms still to enter after the current one. */
  remainingRooms: string[];
}
export interface NavSimStats extends NavStats {
  /** Actors moved straight to their destination because they were offscreen. */
  teleports: number;
  /** Weighted replans after `WAIT_REPLAN_SECONDS`. */
  waitReplans: number;
  /** Step-asides (wait budget and door right of way). */
  stepAsides: number;
  /** Replans caused by a destination change, a room revision or a failed leg. */
  triggerReplans: number;
  /** Largest wait-budget value seen, in seconds. */
  maxWait: number;
}

export const SPEED_CELLS_PER_SECOND = 2.8;
export const MAX_TICK_SECONDS = 0.1;
export const WAIT_REPLAN_SECONDS = 1.5;
export const WAIT_STEP_ASIDE_SECONDS = 5;
/** Entering a reserved cell costs this much in a wait-budget replan. */
export const RESERVED_CELL_COST = 8;

interface SimActor {
  id: string;
  index: number;
  priority: number;
  room: string;
  cell: Cell;
  next: Location | null;
  /** Length of the current segment in cells (door cost when crossing). */
  segment: number;
  progress: number;
  /** True while the current segment crosses a door into the next leg's room. */
  crossing: boolean;
  destination: Location | null;
  unreachable: boolean;
  legs: RouteLeg[];
  /** Remaining cells of the current leg, excluding the current cell. */
  path: Cell[];
  /** Walking to a step-aside cell; replans on arrival. */
  aside: boolean;
  wait: number;
  /** Fewest remaining steps reached since the last plan; only beating it resets `wait`. */
  best: number;
  replanned: boolean;
  moved: boolean;
  blocker: { actor: number } | { group: number } | null;
  queuedOn: number;
}
interface DoorGroup {
  doors: string[];
  holder: number;
  queue: number[];
}
type Replan = "leg" | "route";

const locationKey = (room: string, c: Cell) => `${room}|${c.x},${c.z}`;
const same = (a: Cell, b: Cell) => a.x === b.x && a.z === b.z;
const copy = (l: Location): Location => ({ room: l.room, cell: { ...l.cell } });

export class NavSimulation {
  readonly graph: NavGraph;
  readonly stats: NavSimStats;
  #actors: SimActor[] = [];
  #byId = new Map<string, SimActor>();
  #detail = new Map<string, Detail>();
  /** Per room: actor index holding each cell (current or next), -1 when free. */
  #holders = new Map<string, Int32Array>();
  #groups: DoorGroup[] = [];
  #groupOf = new Map<string, number>();
  #topology = -1;
  #known = new Map<string, { revision: number; blocked: Int32Array }>();
  #pending = new Map<number, Replan>();

  constructor(graph: NavGraph, actors: readonly NavActorInput[]) {
    this.graph = graph;
    const stats = graph.stats as NavSimStats;
    Object.assign(stats, {
      teleports: 0,
      waitReplans: 0,
      stepAsides: 0,
      triggerReplans: 0,
      maxWait: 0,
    });
    this.stats = stats;
    this.#syncTopology();
    for (const input of actors) {
      const c = input.location.cell;
      if (
        !input.id ||
        this.#byId.has(input.id) ||
        !graph.room(input.location.room) ||
        !this.#open(input.location.room, c) ||
        this.#holder(input.location.room, c) !== -1 ||
        this.#groupOf.has(locationKey(input.location.room, c))
      )
        throw new Error(
          "Actors need unique IDs and open, unoccupied, non-door cells.",
        );
      this.#insert(input, c);
    }
  }

  /**
   * Adds an actor at runtime on the free, non-door cell nearest to `input.location`
   * (a worker walking in, a room rebuilt around its actors).
   */
  addActor(input: NavActorInput): Placement {
    if (!input.id || this.#byId.has(input.id))
      return { ok: false, reason: "Actors need unique IDs." };
    this.#syncTopology();
    const landing = this.#landing(input.location);
    if (!landing) return { ok: false, reason: "No free cell in that room." };
    this.#insert({ ...input, location: { room: input.location.room, cell: landing } }, landing);
    return { ok: true };
  }

  /** Removes an actor and frees its cells, door lock and queue place. */
  removeActor(id: string): boolean {
    const a = this.#byId.get(id);
    if (!a) return false;
    this.#leaveQueue(a);
    this.#setHolder(a.room, a.cell, -1);
    if (a.next) this.#setHolder(a.next.room, a.next.cell, -1);
    const gone = a.index;
    const shift = (i: number) => (i > gone ? i - 1 : i);
    this.#actors.splice(gone, 1);
    this.#byId.delete(id);
    // Indices are positions in #actors: renumber every reference past the removed one.
    for (const holders of this.#holders.values())
      for (let i = 0; i < holders.length; i++)
        if (holders[i]! > gone) holders[i]!--;
    for (const g of this.#groups) {
      g.holder = g.holder === gone ? -1 : shift(g.holder);
      g.queue = g.queue.filter((i) => i !== gone).map(shift);
    }
    this.#actors.forEach((b, i) => {
      b.index = i;
      if (b.blocker && "actor" in b.blocker)
        b.blocker = b.blocker.actor === gone ? null : { actor: shift(b.blocker.actor) };
    });
    const pending = [...this.#pending];
    this.#pending.clear();
    for (const [i, kind] of pending) if (i !== gone) this.#pending.set(shift(i), kind);
    return true;
  }

  /**
   * Moves an actor at once to the free, non-door cell nearest to `location` (a reset,
   * reduced motion, a swap between offscreen buildings). A set destination replans.
   */
  place(id: string, location: Location): Placement {
    const a = this.#byId.get(id);
    if (!a) return { ok: false, reason: "Unknown actor." };
    this.#syncTopology();
    const landing = this.#landing(location, a.index);
    if (!landing) return { ok: false, reason: "No free cell in that room." };
    this.#leaveQueue(a);
    const old: Location[] = [{ room: a.room, cell: a.cell }];
    if (a.next) old.push(a.next);
    for (const l of old) this.#setHolder(l.room, l.cell, -1);
    a.room = location.room;
    a.cell = landing;
    a.next = null;
    a.progress = 0;
    a.crossing = false;
    a.legs = [];
    a.path = [];
    a.aside = false;
    a.wait = 0;
    a.best = Infinity;
    a.replanned = false;
    for (const l of old) this.#releaseGroup(l, a);
    this.#setHolder(a.room, a.cell, a.index);
    if (a.destination) this.#request(a.index, "route");
    return { ok: true };
  }

  #insert(input: NavActorInput, c: Cell): void {
    const actor: SimActor = {
      id: input.id,
      index: this.#actors.length,
      priority: input.priority ?? 0,
      room: input.location.room,
      cell: { ...c },
      next: null,
      segment: 1,
      progress: 0,
      crossing: false,
      destination: null,
      unreachable: false,
      legs: [],
      path: [],
      aside: false,
      wait: 0,
      best: Infinity,
      replanned: false,
      moved: false,
      blocker: null,
      queuedOn: -1,
    };
    this.#actors.push(actor);
    this.#byId.set(actor.id, actor);
    this.#setHolder(actor.room, actor.cell, actor.index);
  }

  /** The free, non-door cell nearest to a location, its cell clamped into the room. */
  #landing(location: Location, self = -1): Cell | null {
    const room = this.graph.room(location.room);
    if (!room) return null;
    const { width, depth } = room.layout.grid;
    const cell = {
      x: Math.min(width - 1, Math.max(0, Math.round(location.cell.x))),
      z: Math.min(depth - 1, Math.max(0, Math.round(location.cell.z))),
    };
    return this.#nearestFree(location.room, cell, self);
  }

  /**
   * Sets or clears an actor's destination. The route is planned on the next tick,
   * so several changes in one tick cost one plan. Door cells cannot be destinations.
   */
  setDestination(id: string, destination: Location | null): Placement {
    const a = this.#byId.get(id);
    if (!a) return { ok: false, reason: "Unknown actor." };
    if (destination) {
      if (!this.#open(destination.room, destination.cell))
        return { ok: false, reason: "That cell is not an open floor cell." };
      if (this.#groupOf.has(locationKey(destination.room, destination.cell)))
        return { ok: false, reason: "Doorways cannot be destinations." };
    }
    a.destination = destination && copy(destination);
    a.unreachable = false;
    this.#request(a.index, "route");
    return { ok: true };
  }

  /** Sets rooms to "full" (cosmetic walking) or "offscreen" (move straight to destinations). */
  setDetail(roomIds: readonly string[], detail: Detail): void {
    const rooms = new Set(roomIds);
    for (const id of rooms) this.#detail.set(id, detail);
    if (detail === "offscreen")
      for (const a of this.#actors)
        if (rooms.has(a.room) && a.destination) this.#request(a.index, "route");
  }
  detail(roomId: string): Detail {
    return this.#detail.get(roomId) ?? "full";
  }

  /**
   * Replaces a room's layout unless it covers an actor's current or next cell or
   * a door cell. Affected actors replan on the next tick.
   */
  updateRoom(id: string, layout: WorldLayout): Placement {
    const room = this.graph.room(id);
    if (!room) return { ok: false, reason: "Unknown room." };
    try {
      const blocked = occupancy(
        validateLayout(layout, this.graph.definitions),
        this.graph.definitions,
      );
      for (const i of this.#occupiedIn(id))
        if (blocked[i] !== -1)
          return { ok: false, reason: "A crew member is using that cell." };
      this.graph.updateRoom(id, layout);
    } catch (e) {
      return {
        ok: false,
        reason: e instanceof Error ? e.message : "Invalid layout.",
      };
    }
    return { ok: true };
  }

  tick(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const dt = Math.min(seconds, MAX_TICK_SECONDS);
    this.#syncTopology();
    this.#collectRoomChanges();
    const pending = [...this.#pending].sort((x, y) => x[0] - y[0]);
    this.#pending.clear();
    for (const [index, kind] of pending) this.#replan(this.#actors[index]!, kind);
    for (const a of this.#actors) this.#move(a, dt);
    this.#applyWaitBudget(dt);
  }

  actor(id: string): NavActorSnapshot | undefined {
    const a = this.#byId.get(id);
    return a && this.#describe(a);
  }

  snapshot() {
    return {
      actors: this.#actors.map((a) => this.#describe(a)),
      doors: this.#groups.flatMap((g) =>
        g.doors.map((door) => ({
          id: door,
          holder: g.holder === -1 ? null : this.#actors[g.holder]!.id,
          queue: g.queue.map((i) => this.#actors[i]!.id),
        })),
      ),
      detail: Object.fromEntries(
        this.graph.roomIds().map((id) => [id, this.detail(id)]),
      ),
    };
  }

  #describe(a: SimActor): NavActorSnapshot {
    const arrived =
      !!a.destination &&
      !a.next &&
      a.room === a.destination.room &&
      same(a.cell, a.destination.cell);
    const status: NavActorStatus = a.unreachable
      ? "unreachable"
      : !a.destination
        ? "idle"
        : arrived
          ? "arrived"
          : a.moved
            ? "moving"
            : "waiting";
    return {
      id: a.id,
      priority: a.priority,
      location: { room: a.room, cell: { ...a.cell } },
      next: a.next && copy(a.next),
      progress: a.progress,
      destination: a.destination && copy(a.destination),
      status,
      waiting: a.wait,
      remainingRooms: a.legs.slice(1).map((l) => l.room),
    };
  }

  // Triggers -----------------------------------------------------------------

  #request(index: number, kind: Replan): void {
    if (this.#pending.get(index) !== "route") this.#pending.set(index, kind);
  }

  #syncTopology(): void {
    if (this.#topology === this.graph.topologyRevision) return;
    this.#topology = this.graph.topologyRevision;
    // Doors sharing a cell (a one-cell corridor between two doors) form one group
    // with one lock, so two actors can never meet head-on inside it.
    const doors = this.graph.doors();
    const parent = doors.map((_, i) => i);
    const find = (i: number): number =>
      parent[i] === i ? i : (parent[i] = find(parent[i]!));
    const firstAt = new Map<string, number>();
    doors.forEach((d, i) => {
      for (const s of [d.a, d.b]) {
        const key = locationKey(s.room, s.cell);
        const other = firstAt.get(key);
        if (other === undefined) firstAt.set(key, i);
        else parent[find(i)] = find(other);
      }
    });
    const groupIndex = new Map<number, number>();
    this.#groups = [];
    this.#groupOf.clear();
    doors.forEach((d, i) => {
      const root = find(i);
      let g = groupIndex.get(root);
      if (g === undefined) {
        g = this.#groups.length;
        groupIndex.set(root, g);
        this.#groups.push({ doors: [], holder: -1, queue: [] });
      }
      this.#groups[g]!.doors.push(d.id);
      for (const s of [d.a, d.b]) this.#groupOf.set(locationKey(s.room, s.cell), g);
    });
    this.#holders.clear();
    for (const id of this.graph.roomIds()) {
      const room = this.graph.room(id)!;
      this.#holders.set(
        id,
        new Int32Array(room.layout.grid.width * room.layout.grid.depth).fill(-1),
      );
      // A room re-added under the same ID (rebuilt with another size) starts a fresh diff.
      const known = this.#known.get(id);
      if (!known || known.blocked.length !== room.blocked.length)
        this.#known.set(id, { revision: room.revision, blocked: room.blocked });
    }
    for (const a of this.#actors) {
      a.queuedOn = -1;
      this.#setHolder(a.room, a.cell, a.index);
      this.#claimGroup(a.room, a.cell, a.index);
      if (a.next) {
        this.#setHolder(a.next.room, a.next.cell, a.index);
        this.#claimGroup(a.next.room, a.next.cell, a.index);
      }
      if (a.destination) this.#request(a.index, "route");
    }
  }

  /** Coalesced: every revision change since the last tick yields one replan per affected actor. */
  #collectRoomChanges(): void {
    for (const id of this.graph.roomIds()) {
      const room = this.graph.room(id)!;
      const known = this.#known.get(id);
      if (known && known.revision === room.revision) continue;
      const changed = new Set<number>();
      if (known)
        for (let i = 0; i < room.blocked.length; i++)
          if ((room.blocked[i] === -1) !== (known.blocked[i] === -1))
            changed.add(i);
      this.#known.set(id, { revision: room.revision, blocked: room.blocked });
      if (!changed.size) continue;
      const width = room.layout.grid.width;
      for (const a of this.#actors) {
        if (!a.destination) continue;
        const inRoom = a.room === id || a.next?.room === id;
        if (
          inRoom &&
          a.path.some((c) => changed.has(c.z * width + c.x))
        )
          this.#request(a.index, "leg");
        if (a.legs.slice(1).some((l) => l.room === id))
          this.#request(a.index, "route");
        if (
          a.destination.room === id &&
          changed.has(a.destination.cell.z * width + a.destination.cell.x)
        )
          this.#request(a.index, "route");
      }
    }
  }

  #replan(a: SimActor, kind: Replan): void {
    this.stats.triggerReplans++;
    this.#leaveQueue(a);
    a.aside = false;
    a.best = Infinity;
    const origin: Location = a.next ? a.next : { room: a.room, cell: a.cell };
    if (!a.destination) {
      a.legs = [];
      a.path = [];
      a.crossing = false;
      return;
    }
    if (
      origin.room === a.destination.room &&
      same(origin.cell, a.destination.cell)
    ) {
      a.legs = [];
      a.path = [];
      a.crossing = false;
      return;
    }
    if (this.detail(origin.room) === "offscreen") {
      // Finish an active segment first; offscreen actors never walk cosmetically.
      if (a.next) this.#pending.set(a.index, "route");
      else this.#teleport(a);
      return;
    }
    if (kind === "leg" && !a.next && a.legs.length) {
      const path = this.#legPath(a, a.legs[0]!.toCell);
      if (path) {
        a.path = path;
        return;
      }
    }
    const plan = this.graph.planRoute(origin, a.destination, {
      reserved: this.#reservedIn(origin.room, a.index),
    });
    a.crossing = false;
    if (!plan) {
      a.unreachable = true;
      a.legs = [];
      a.path = [];
      return;
    }
    a.unreachable = false;
    a.legs = plan.legs;
    a.path = plan.path.slice(1);
  }

  /** Local path from the actor's cell to `to`, avoiding reserved cells when possible. */
  #legPath(a: SimActor, to: Cell, reservedCost?: number): Cell[] | null {
    const reserved = this.#reservedIn(a.room, a.index);
    const options =
      reservedCost === undefined ? { reserved } : { reserved, reservedCost };
    const avoiding = this.graph.localPath(a.room, a.cell, to, options);
    if (avoiding) return avoiding.slice(1);
    if (reservedCost !== undefined) return null;
    return this.graph.localPath(a.room, a.cell, to)?.slice(1) ?? null;
  }

  // Movement -----------------------------------------------------------------

  #desire(a: SimActor): { location: Location; segment: number; door: boolean } | null {
    if (a.path.length)
      return { location: { room: a.room, cell: a.path[0]! }, segment: 1, door: false };
    if (a.aside) return null;
    const leg = a.legs[0];
    if (!leg || !leg.viaDoor || leg.room !== a.room || !same(a.cell, leg.toCell))
      return null;
    const door = this.graph.door(leg.viaDoor);
    if (!door) return null;
    const other = this.#otherSide(door, a.room, a.cell);
    return other && { location: other, segment: door.cost ?? 1, door: true };
  }

  #otherSide(door: Door, room: string, cell: Cell): Location | null {
    if (door.a.room === room && same(door.a.cell, cell)) return door.b;
    if (door.b.room === room && same(door.b.cell, cell)) return door.a;
    return null;
  }

  #move(a: SimActor, dt: number): void {
    let distance = dt * SPEED_CELLS_PER_SECOND;
    a.moved = false;
    a.blocker = null;
    while (distance > 1e-9) {
      if (!a.next) {
        const want = this.#desire(a);
        if (!want) break;
        const blocker = this.#canEnter(a, want.location);
        if (blocker) {
          a.blocker = blocker;
          break;
        }
        this.#leaveQueue(a);
        this.#setHolder(want.location.room, want.location.cell, a.index);
        this.#claimGroup(want.location.room, want.location.cell, a.index);
        a.next = copy(want.location);
        a.segment = want.segment;
        a.progress = 0;
        a.crossing = want.door;
        if (!want.door) a.path.shift();
      }
      const step = Math.min((1 - a.progress) * a.segment, distance);
      a.progress += step / a.segment;
      distance -= step;
      a.moved = true;
      if (a.progress >= 1 - 1e-9 && !this.#arrive(a)) break;
    }
  }

  /** Completes the current segment. Returns false when movement must stop this tick. */
  #arrive(a: SimActor): boolean {
    const next = a.next!;
    const from = { room: a.room, cell: a.cell };
    this.#setHolder(from.room, from.cell, -1);
    a.room = next.room;
    a.cell = { ...next.cell };
    a.next = null;
    a.progress = 0;
    this.#releaseGroup(from, a);
    if (a.crossing) {
      a.crossing = false;
      a.legs.shift();
      if (this.detail(a.room) === "offscreen") {
        this.#teleport(a);
        return false;
      }
      const leg = a.legs[0];
      if (!leg) {
        this.#request(a.index, "route");
        return false;
      }
      const path = this.#legPath(a, leg.toCell);
      if (!path) {
        this.#request(a.index, "route");
        return false;
      }
      a.path = path;
    }
    if (a.aside && !a.path.length) {
      a.aside = false;
      this.#request(a.index, a.legs.length ? "leg" : "route");
      return false;
    }
    if (
      a.destination &&
      !a.path.length &&
      a.room === a.destination.room &&
      same(a.cell, a.destination.cell)
    ) {
      a.legs = [];
      return false;
    }
    return true;
  }

  #canEnter(a: SimActor, target: Location): SimActor["blocker"] {
    // The door queue comes first so arrival order holds even while the door is busy.
    const g = this.#groupOf.get(locationKey(target.room, target.cell));
    if (g !== undefined) {
      const group = this.#groups[g]!;
      const free =
        group.holder === a.index ||
        (group.holder === -1 &&
          (!group.queue.length || group.queue[0] === a.index));
      if (!free) {
        if (a.queuedOn !== g) {
          this.#leaveQueue(a);
          group.queue.push(a.index);
          a.queuedOn = g;
        }
        return { group: g };
      }
    }
    const holder = this.#holder(target.room, target.cell);
    return holder !== -1 && holder !== a.index ? { actor: holder } : null;
  }

  #teleport(a: SimActor): void {
    const destination = a.destination!;
    const landing = this.#nearestFree(destination.room, destination.cell, a.index);
    this.#leaveQueue(a);
    a.legs = [];
    a.path = [];
    a.crossing = false;
    if (!landing) {
      a.unreachable = true;
      return;
    }
    if (a.room === destination.room && same(a.cell, landing)) return;
    const from = { room: a.room, cell: a.cell };
    this.#setHolder(from.room, from.cell, -1);
    a.room = destination.room;
    a.cell = landing;
    this.#releaseGroup(from, a);
    this.#setHolder(a.room, a.cell, a.index);
    this.stats.teleports++;
    if (!same(landing, destination.cell)) this.#request(a.index, "route");
  }

  /** Breadth-first search for the closest open, unheld, non-door cell. Not a path search. */
  #nearestFree(roomId: string, origin: Cell, self: number): Cell | null {
    const room = this.graph.room(roomId);
    if (!room) return null;
    const { width, depth } = room.layout.grid;
    const holders = this.#holders.get(roomId)!;
    const seen = new Uint8Array(width * depth);
    const queue = [origin.z * width + origin.x];
    seen[queue[0]!] = 1;
    for (let read = 0; read < queue.length; read++) {
      const id = queue[read]!,
        x = id % width,
        z = (id - x) / width;
      if (
        room.blocked[id] === -1 &&
        (holders[id] === -1 || holders[id] === self) &&
        !this.#groupOf.has(locationKey(roomId, { x, z }))
      )
        return { x, z };
      for (const [nx, nz] of [
        [x, z - 1],
        [x + 1, z],
        [x, z + 1],
        [x - 1, z],
      ] as const) {
        if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue;
        const n = nz * width + nx;
        if (!seen[n] && room.blocked[n] === -1) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    return null;
  }

  // Wait budget --------------------------------------------------------------

  #applyWaitBudget(dt: number): void {
    const flowing = new Int8Array(this.#actors.length).fill(-1);
    const isFlowing = (i: number, depth: number): boolean => {
      if (flowing[i] !== -1) return flowing[i] === 1;
      if (depth > this.#actors.length) return false;
      flowing[i] = 0; // cycle guard
      const a = this.#actors[i]!;
      let result = false;
      if (a.moved) result = true;
      else if (a.blocker && "group" in a.blocker) {
        const holder = this.#groups[a.blocker.group]!.holder;
        result = holder === -1 || isFlowing(holder, depth + 1);
      } else if (a.blocker) result = isFlowing(a.blocker.actor, depth + 1);
      flowing[i] = result ? 1 : 0;
      return result;
    };
    for (const a of this.#actors) {
      // Moving is not enough to reset the budget: two actors can dodge the same
      // way forever. Only getting closer than ever to the goal counts.
      const remaining = a.legs.length * 1e6 + a.path.length;
      if (!a.next && !this.#desire(a)) {
        a.wait = 0;
        a.replanned = false;
      } else if (a.moved) {
        if (remaining < a.best) {
          a.best = remaining;
          a.wait = 0;
          a.replanned = false;
        }
      } else if (!isFlowing(a.index, 0)) a.wait += dt;
    }
    for (const a of this.#actors) {
      if (a.moved || !a.blocker) continue;
      // Door right of way: an actor queued for a door steps aside at once when it
      // stands in the way of the actor currently using that door.
      if ("actor" in a.blocker) {
        const b = this.#actors[a.blocker.actor]!;
        const g = this.#groupOf.get(locationKey(a.room, a.cell));
        if (g !== undefined && this.#groups[g]!.holder === a.index && b.queuedOn === g) {
          if (this.#stepAside(b, a)) {
            a.wait = 0;
            continue;
          }
        }
      }
      if (a.wait > WAIT_REPLAN_SECONDS && !a.replanned) {
        a.replanned = true;
        const leg = a.legs[0];
        if (a.path.length && leg && leg.room === a.room) {
          const path = this.#legPath(a, leg.toCell, RESERVED_CELL_COST);
          if (path) a.path = path;
          this.stats.waitReplans++;
        }
      }
      // Resolve on the tick that would take the wait past the budget.
      if (a.wait + dt > WAIT_STEP_ASIDE_SECONDS + 1e-9) this.#resolveStall(a);
    }
    for (const a of this.#actors)
      this.stats.maxWait = Math.max(this.stats.maxWait, a.wait);
  }

  #resolveStall(a: SimActor): void {
    const blocker = a.blocker!;
    if ("group" in blocker) {
      // The door holder's own budget resolves its stall; the queue keeps its order.
      a.wait = 0;
      return;
    }
    const b = this.#actors[blocker.actor]!;
    const bIdle = !b.next && !this.#desire(b);
    const lowerFirst =
      a.priority < b.priority || (a.priority === b.priority && a.index > b.index);
    const order = bIdle ? [b, a] : lowerFirst ? [a, b] : [b, a];
    for (const yielder of order) {
      const other = yielder === a ? b : a;
      if (this.#stepAside(yielder, other)) {
        a.wait = 0;
        b.wait = 0;
        a.replanned = b.replanned = false;
        return;
      }
    }
    a.wait = 0;
  }

  /** Moves `yielder` to a free neighbouring cell off `other`'s way; deterministic N, E, S, W. */
  #stepAside(yielder: SimActor, other: SimActor): boolean {
    if (yielder.next) return false;
    const { x, z } = yielder.cell;
    const avoid = new Set(
      [other.cell, ...other.path.slice(0, 3)]
        .map((c) => cellKey(c)),
    );
    let fallback: Cell | null = null;
    for (const c of [
      { x, z: z - 1 },
      { x: x + 1, z },
      { x, z: z + 1 },
      { x: x - 1, z },
    ]) {
      if (
        !this.#open(yielder.room, c) ||
        this.#holder(yielder.room, c) !== -1 ||
        this.#groupOf.has(locationKey(yielder.room, c))
      )
        continue;
      if (!avoid.has(cellKey(c))) return this.#sendAside(yielder, c);
      fallback ??= c;
    }
    return fallback ? this.#sendAside(yielder, fallback) : false;
  }

  #sendAside(a: SimActor, cell: Cell): boolean {
    this.#leaveQueue(a);
    this.#pending.delete(a.index);
    a.path = [cell];
    a.aside = true;
    a.wait = 0;
    a.replanned = false;
    this.stats.stepAsides++;
    return true;
  }

  // Bookkeeping --------------------------------------------------------------

  #leaveQueue(a: SimActor): void {
    if (a.queuedOn === -1) return;
    const queue = this.#groups[a.queuedOn]?.queue;
    if (queue) {
      const at = queue.indexOf(a.index);
      if (at !== -1) queue.splice(at, 1);
    }
    a.queuedOn = -1;
  }

  #claimGroup(room: string, cell: Cell, index: number): void {
    const g = this.#groupOf.get(locationKey(room, cell));
    if (g !== undefined) this.#groups[g]!.holder = index;
  }

  /** Frees the door group of `from` once the actor holds none of its cells. */
  #releaseGroup(from: Location, a: SimActor): void {
    const g = this.#groupOf.get(locationKey(from.room, from.cell));
    if (g === undefined || this.#groups[g]!.holder !== a.index) return;
    const stillInside =
      this.#groupOf.get(locationKey(a.room, a.cell)) === g ||
      (a.next && this.#groupOf.get(locationKey(a.next.room, a.next.cell)) === g);
    if (!stillInside) this.#groups[g]!.holder = -1;
  }

  #open(roomId: string, c: Cell): boolean {
    const room = this.graph.room(roomId);
    if (!room) return false;
    const { width, depth } = room.layout.grid;
    return (
      Number.isInteger(c.x) &&
      Number.isInteger(c.z) &&
      c.x >= 0 &&
      c.z >= 0 &&
      c.x < width &&
      c.z < depth &&
      room.blocked[c.z * width + c.x] === -1
    );
  }

  #holder(roomId: string, c: Cell): number {
    const room = this.graph.room(roomId);
    const holders = this.#holders.get(roomId);
    if (!room || !holders) return -1;
    return holders[c.z * room.layout.grid.width + c.x] ?? -1;
  }

  #setHolder(roomId: string, c: Cell, index: number): void {
    const room = this.graph.room(roomId);
    const holders = this.#holders.get(roomId);
    if (room && holders) holders[c.z * room.layout.grid.width + c.x] = index;
  }

  #reservedIn(roomId: string, except: number): Set<string> {
    const cells = new Set<string>();
    for (const a of this.#actors) {
      if (a.index === except) continue;
      if (a.room === roomId) cells.add(cellKey(a.cell));
      if (a.next && a.next.room === roomId) cells.add(cellKey(a.next.cell));
    }
    return cells;
  }

  #occupiedIn(roomId: string): Set<number> {
    const room = this.graph.room(roomId)!;
    const width = room.layout.grid.width;
    const cells = new Set<number>();
    for (const a of this.#actors) {
      if (a.room === roomId) cells.add(a.cell.z * width + a.cell.x);
      if (a.next && a.next.room === roomId)
        cells.add(a.next.cell.z * width + a.next.cell.x);
    }
    return cells;
  }
}
