/* Room dressing: the homely props that make a room lived-in (sofas, rugs, shelving, pendant lamps, pictures, plants).
   Pure: no Three.js, no DOM. Deterministic and seeded per building, so neighbouring buildings vary a little.

   Two halves:
   - `dressRooms` adds the blocking pieces (a sofa, shelving, a coffee counter) to the room layouts as `WorldProp`s, so
     collision and navigation know them. It is the one hook `buildingTemplate(...)` calls. Every candidate spot is
     checked against the room's grid: doors, door approaches, seats, pile approaches, pallet spots and signal spots stay
     free, and everything that was reachable from the room's entrance stays reachable.
   - `roomDecor` lists the pieces that never block (rugs, wall art, clocks, pendant lamps, things on desks). The
     entered building draws them; nothing else reads them.

   Everything is placed relative to each room's rectangle, its doors, its existing furniture and the template's
   dressing zones, never against fixed coordinates, so the dressing follows the template when it changes. */
import { approachCells, cellKey, occupancy, propCells, type Cell, type Definitions, type PropDefinition, type Rotation, type WorldProp } from "@crewhub/world-engine";
import type { RoomKind } from "@crewhub/world-model";
import type { ModelKey } from "@crewhub/world-style";
import type { BuildingTemplate, DressingZone, TemplateRoom } from "./buildingTemplate.ts";

/** Id prefix of the blocking dressing props in a room layout. */
export const DRESS_PREFIX = "dress-";

const piece = (id: string, label: string, width: number, depth: number): PropDefinition => ({
  id,
  label,
  footprint: { width, depth },
  blocksMovement: true,
  // Only "dressing": the director never sends anyone to a dressing piece.
  tags: ["dressing"],
  approaches: [],
});

/** The blocking dressing furniture, drawn by the style as `furniture.<id>`. */
export const dressingDefinitions: Definitions = {
  "lounge-sofa": piece("lounge-sofa", "Lounge sofa", 2, 1),
  "coffee-table": piece("coffee-table", "Coffee table", 1, 1),
  bookshelf: piece("bookshelf", "Bookshelf", 2, 1),
  "floor-lamp": piece("floor-lamp", "Floor lamp", 1, 1),
  "reading-lamp": piece("reading-lamp", "Reading lamp", 1, 1),
  armchair: piece("armchair", "Armchair", 1, 1),
  "side-table": piece("side-table", "Side table", 1, 1),
  "storage-shelf": piece("storage-shelf", "Storage shelving", 2, 1),
  "filing-cabinet": piece("filing-cabinet", "Filing cabinet", 1, 1),
  "water-cooler": piece("water-cooler", "Water cooler", 1, 1),
  "umbrella-stand": piece("umbrella-stand", "Umbrella stand", 1, 1),
  "coffee-counter": piece("coffee-counter", "Coffee corner", 2, 1),
  "roller-shelf": piece("roller-shelf", "Roller shelf", 2, 1),
  "hand-truck": piece("hand-truck", "Hand truck", 1, 1),
  "board-stand": piece("board-stand", "Whiteboard on a stand", 2, 1),
  "chart-easel": piece("chart-easel", "Chart easel", 1, 1),
  "mood-board": piece("mood-board", "Mood board", 2, 1),
};

/** A seeded number per building: the same slug always dresses the same way. */
export function dressingSeed(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 16777619);
  return h >>> 0;
}

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roomSeed = (seed: number, kind: RoomKind) => dressingSeed(`${seed}:${kind}`);

/* ── Room facts ───────────────────────────────────────────────────────── */

type Side = "north" | "west" | "south" | "east";
/** The quarter turn that puts a piece's back against a wall, its front (+z) facing into the room. */
const FACING: Record<Side, Rotation> = { north: 0, east: 1, south: 2, west: 3 };

interface RoomFacts {
  room: TemplateRoom;
  width: number;
  depth: number;
  /** Door cells of this room (room cells). */
  doors: Cell[];
  /** Room cells along the tall outer back walls (north and west), without door cells. */
  tall: { north: Set<number>; west: Set<number> };
  zones: DressingZone[];
}

function factsOf(template: BuildingTemplate, room: TemplateRoom, zones: readonly DressingZone[], loading: { x1: number; x2: number } | null): RoomFacts {
  const owned = new Set<string>();
  for (const r of template.rooms)
    for (let z = 0; z < r.layout.grid.depth; z++) for (let x = 0; x < r.layout.grid.width; x++) owned.add(`${r.origin.x + x},${r.origin.z + z}`);
  const { width, depth } = room.layout.grid;
  const doors: Cell[] = [];
  for (const d of template.doors) for (const side of [d.a, d.b]) if (side.room === room.kind) doors.push(side.cell);
  // The loading door is an opening in the south wall (outside cells are building cells).
  if (loading && room.origin.z + depth === template.size.depth)
    for (let x = loading.x1; x < loading.x2; x++) if (x >= room.origin.x && x < room.origin.x + width) doors.push({ x: x - room.origin.x, z: depth - 1 });
  const door = new Set(doors.map(cellKey));
  const north = new Set<number>(),
    west = new Set<number>();
  for (let x = 0; x < width; x++) if (!owned.has(`${room.origin.x + x},${room.origin.z - 1}`) && !door.has(`${x},0`)) north.add(x);
  for (let z = 0; z < depth; z++) if (!owned.has(`${room.origin.x - 1},${room.origin.z + z}`) && !door.has(`0,${z}`)) west.add(z);
  return {
    room,
    width,
    depth,
    doors,
    tall: { north, west },
    zones: zones.filter((zone) => zone.room === room.kind).map((zone) => ({ ...zone, x: zone.x - room.origin.x, z: zone.z - room.origin.z })),
  };
}

/** The centre of the first zone whose use mentions `word`, in room cells. */
function zoneCentre(facts: RoomFacts, word: string): { x: number; z: number } | null {
  const zone = facts.zones.find((z) => z.use.includes(word));
  return zone ? { x: zone.x + zone.width / 2, z: zone.z + zone.depth / 2 } : null;
}

/* ── Blocking pieces ──────────────────────────────────────────────────── */

interface Want {
  def: string;
  /** "wall": back against a room edge, front into the room; "free": anywhere, unturned. */
  at: "wall" | "free";
  /** Where it would like to be, in room cells; null takes the camera-facing walls first. */
  anchor: { x: number; z: number } | null;
  /** Walls to use, best first; the default prefers the north and west walls (their fronts face the camera). */
  sides?: Side[];
}

const SIDE_COST: Record<Side, number> = { north: 0, west: 0.5, east: 3, south: 4 };

class Planner {
  readonly props: WorldProp[];
  readonly #defs: Definitions;
  readonly #facts: RoomFacts;
  readonly #keep = new Set<string>();
  #reach: Cell[] = [];
  readonly #rand: () => number;
  #n = 0;

  constructor(facts: RoomFacts, defs: Definitions, seed: number, piles: DressOptions["piles"]) {
    this.#facts = facts;
    this.#defs = defs;
    this.#rand = random(seed);
    this.props = [...facts.room.layout.props];
    const { width, depth } = facts;
    const keep = (x: number, z: number) => {
      if (x >= 0 && z >= 0 && x < width && z < depth) this.#keep.add(`${x},${z}`);
    };
    // Doors and the cell just inside them.
    for (const d of facts.doors) {
      keep(d.x, d.z);
      keep(d.x === 0 ? 1 : d.x === width - 1 ? width - 2 : d.x, d.z === 0 ? 1 : d.z === depth - 1 ? depth - 2 : d.z);
      this.#reach.push(d);
    }
    for (const p of this.props) {
      const def = defs[p.definitionId];
      // Seats and every other approach stay free and reachable.
      for (const a of approachCells(p, defs)) {
        keep(a.x, a.z);
        this.#reach.push(a);
      }
      // The floor in front of a desk is where the quiet clock stands; the mailbox's letters lie east of it.
      if (def?.tags.includes("desk")) for (let x = 0; x < def.footprint.width; x++) keep(p.cell.x + x, p.cell.z + def.footprint.depth);
      if (p.definitionId === "mailbox") for (const [dx, dz] of [[1, 0], [2, 0], [1, -1], [2, -1], [1, 1], [2, 1]] as const) keep(p.cell.x + dx, p.cell.z + dz);
      // The ring around the meeting table is where gathered agents stand.
      if (def?.tags.includes("gather"))
        for (let z = -1; z <= def.footprint.depth; z++) for (let x = -1; x <= def.footprint.width; x++) keep(p.cell.x + x, p.cell.z + z);
    }
    // An overflowing pile's pallet, and where an agent without a desk waits.
    const pile = piles?.[facts.room.kind];
    if (pile) for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) keep(Math.floor(pile.pallet.x + 0.5) + dx, Math.floor(pile.pallet.z + 0.5) + dz);
    const home = { x: Math.floor(width / 2), z: depth - 2 };
    for (const dx of [-1, 0, 1]) keep(home.x + dx, home.z);
    this.#reach.push(home);
    // Signal spots near the north-west corner (beacon, milestone banners) and the release crates.
    for (let x = 0; x <= 3; x++) for (let z = 0; z <= 1; z++) keep(x, z);
    for (const x of [4, 5]) for (const z of [2, 3]) keep(x, z);
    if (facts.room.kind === "lobby") for (const x of [4, 5, 6]) for (const z of [0, 1]) keep(x, z);
    // Only what is reachable now must stay reachable.
    const now = this.#reachable(this.props);
    this.#reach = this.#reach.filter((c) => c.x >= 0 && c.z >= 0 && c.x < width && c.z < depth && now[c.z * width + c.x] === 1);
  }

  /** Tries the wanted piece at its best valid spot; returns it, or null when nothing fits. */
  place(want: Want): WorldProp | null {
    const def = this.#defs[want.def];
    if (!def) return null;
    const { width, depth } = this.#facts;
    const candidates: { prop: WorldProp; score: number }[] = [];
    const sides = want.sides ?? (["north", "west", "east", "south"] as Side[]);
    const add = (cell: Cell, rotation: Rotation, sideCost: number) => {
      const turned = rotation % 2 ? { w: def.footprint.depth, d: def.footprint.width } : { w: def.footprint.width, d: def.footprint.depth };
      const centre = { x: cell.x + turned.w / 2, z: cell.z + turned.d / 2 };
      const distance = want.anchor ? Math.hypot(centre.x - want.anchor.x, centre.z - want.anchor.z) : 0;
      candidates.push({ prop: { id: "", definitionId: want.def, cell, rotation }, score: sideCost + distance + this.#rand() * 0.6 });
    };
    if (want.at === "wall")
      sides.forEach((side, i) => {
        const r = FACING[side];
        const w = r % 2 ? def.footprint.depth : def.footprint.width,
          d = r % 2 ? def.footprint.width : def.footprint.depth;
        const cost = want.sides ? i * 2 : SIDE_COST[side];
        if (side === "north" || side === "south") for (let x = 0; x + w <= width; x++) add({ x, z: side === "north" ? 0 : depth - d }, r, cost);
        else for (let z = 0; z + d <= depth; z++) add({ x: side === "west" ? 0 : width - w, z }, r, cost);
      });
    else for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) add({ x, z }, 0, 0);
    candidates.sort((a, b) => a.score - b.score);
    for (const { prop } of candidates) {
      const placed = { ...prop, id: `${DRESS_PREFIX}${want.def}-${this.#n}` };
      if (this.#fits(placed) && this.#keepsPaths(placed)) {
        this.#n++;
        this.props.push(placed);
        return placed;
      }
    }
    return null;
  }

  #fits(prop: WorldProp): boolean {
    const blocked = occupancy({ version: 1, grid: this.#grid(), props: this.props, entrance: this.#facts.room.layout.entrance }, this.#defs);
    const { width, depth } = this.#facts;
    return propCells(prop, this.#defs).every((c) => c.x >= 0 && c.z >= 0 && c.x < width && c.z < depth && blocked[c.z * width + c.x] === -1 && !this.#keep.has(cellKey(c)));
  }

  /** Every door, seat, approach and waiting spot stays reachable from the room's entrance. */
  #keepsPaths(prop: WorldProp): boolean {
    const seen = this.#reachable([...this.props, prop]);
    return this.#reach.every((c) => seen[c.z * this.#facts.width + c.x] === 1);
  }

  /** Flood fill from the room's entrance: 1 for every open cell a walker can reach. */
  #reachable(props: WorldProp[]): Uint8Array {
    const { width, depth } = this.#facts;
    const blocked = occupancy({ version: 1, grid: this.#grid(), props, entrance: this.#facts.room.layout.entrance }, this.#defs);
    const seen = new Uint8Array(width * depth);
    const start = this.#facts.room.layout.entrance;
    const queue = [start.z * width + start.x];
    if (blocked[queue[0]!] !== -1) return seen;
    seen[queue[0]!] = 1;
    while (queue.length) {
      const id = queue.pop()!;
      const x = id % width,
        z = Math.floor(id / width);
      for (const [nx, nz] of [
        [x - 1, z],
        [x + 1, z],
        [x, z - 1],
        [x, z + 1],
      ] as const) {
        if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue;
        const n = nz * width + nx;
        if (seen[n] || blocked[n] !== -1) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    return seen;
  }

  #grid() {
    return this.#facts.room.layout.grid;
  }
}

/** The centre of a placed piece and the direction its front faces, in room cells. */
function poseOf(prop: WorldProp, defs: Definitions): { x: number; z: number; front: { x: number; z: number } } {
  const def = defs[prop.definitionId]!;
  const turned = prop.rotation % 2 ? { w: def.footprint.depth, d: def.footprint.width } : { w: def.footprint.width, d: def.footprint.depth };
  const front = [
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
    { x: 1, z: 0 },
  ][prop.rotation]!;
  return { x: prop.cell.x + turned.w / 2, z: prop.cell.z + turned.d / 2, front };
}

const offset = (p: { x: number; z: number; front: { x: number; z: number } }, ahead: number, side = 0) => ({
  // `side` runs along the piece, to its right when seen from the front.
  x: p.x + p.front.x * ahead - p.front.z * side,
  z: p.z + p.front.z * ahead + p.front.x * side,
});

/** What each room wants, in order; later pieces may anchor on earlier ones. */
function plan(kind: RoomKind, facts: RoomFacts, planner: Planner, defs: Definitions, rand: () => number) {
  const place = (want: Want) => planner.place(want);
  const centre = { x: facts.width / 2, z: facts.depth / 2 };
  const plants = (n: number, word = "plant") => {
    const spots = facts.zones.filter((z) => z.use.includes(word));
    for (let i = 0; i < n; i++) {
      const zone = spots[i % Math.max(1, spots.length)];
      place({ def: "plant", at: "free", anchor: zone ? { x: zone.x + (rand() < 0.5 ? 0.5 : zone.width - 0.5), z: zone.z + (rand() < 0.5 ? 0.5 : zone.depth - 0.5) } : null });
    }
  };
  switch (kind) {
    case "lead-office": {
      const sofa = place({ def: "lounge-sofa", at: "wall", anchor: zoneCentre(facts, "sofa") ?? centre, sides: ["west", "north", "east", "south"] });
      if (sofa) {
        const p = poseOf(sofa, defs);
        place({ def: "coffee-table", at: "free", anchor: offset(p, 1.5) });
        place({ def: "floor-lamp", at: "free", anchor: offset(p, 0.2, rand() < 0.5 ? 1.6 : -1.6) });
      }
      place({ def: "bookshelf", at: "wall", anchor: zoneCentre(facts, "bookshelf"), sides: ["north", "west", "east"] });
      break;
    }
    case "lobby": {
      const machine = facts.room.layout.props.find((p) => p.definitionId === "coffee-machine");
      place({ def: "coffee-counter", at: "wall", anchor: machine ? { x: machine.cell.x - 0.5, z: machine.cell.z + 0.5 } : zoneCentre(facts, "coffee") });
      place({ def: "water-cooler", at: "wall", anchor: zoneCentre(facts, "coffee") });
      const waiting = zoneCentre(facts, "waiting") ?? centre;
      const chair = place({ def: "armchair", at: "free", anchor: { x: waiting.x - 0.6, z: waiting.z - 0.6 } });
      if (chair) place({ def: "side-table", at: "free", anchor: { x: waiting.x + 0.6, z: waiting.z - 0.6 } });
      place({ def: "armchair", at: "free", anchor: { x: waiting.x + 1.6, z: waiting.z - 0.6 } });
      const entrance = facts.room.layout.entrance;
      place({ def: "umbrella-stand", at: "free", anchor: { x: entrance.x + 2.5, z: entrance.z + 0.5 } });
      // Plants flank the way in; a reading seat by the coffee corner.
      place({ def: "plant", at: "free", anchor: { x: entrance.x - 1.5, z: entrance.z - 0.5 } });
      place({ def: "plant", at: "free", anchor: { x: entrance.x + 2.5, z: entrance.z - 1.5 } });
      const coffee = zoneCentre(facts, "coffee");
      if (coffee) place({ def: "armchair", at: "free", anchor: { x: coffee.x - 1, z: coffee.z + 0.5 } });
      plants(1, "waiting");
      break;
    }
    case "meeting":
      plants(2, "plants");
      place({ def: "water-cooler", at: "wall", anchor: zoneCentre(facts, "sideboard") });
      if (!facts.tall.north.size && !facts.tall.west.size) place({ def: "board-stand", at: "wall", anchor: zoneCentre(facts, "whiteboard") });
      break;
    case "storage":
      place({ def: "storage-shelf", at: "wall", anchor: zoneCentre(facts, "crates") });
      place({ def: "storage-shelf", at: "wall", anchor: zoneCentre(facts, "crates") });
      place({ def: "filing-cabinet", at: "wall", anchor: zoneCentre(facts, "crates") });
      break;
    case "planning":
      place({ def: "filing-cabinet", at: "wall", anchor: zoneCentre(facts, "stool") });
      plants(1, "plant");
      if (!facts.tall.west.size && !facts.tall.north.size) place({ def: "board-stand", at: "wall", anchor: zoneCentre(facts, "pinboard") });
      break;
    case "review": {
      place({ def: "bookshelf", at: "wall", anchor: zoneCentre(facts, "shelving"), sides: ["west", "north"] });
      const chair = place({ def: "armchair", at: "free", anchor: offset({ ...(zoneCentre(facts, "shelving") ?? centre), front: { x: 1, z: 0 } }, 1.5, 1) });
      if (chair) {
        place({ def: "reading-lamp", at: "free", anchor: { x: chair.cell.x - 0.5, z: chair.cell.z - 0.5 } });
        place({ def: "side-table", at: "free", anchor: { x: chair.cell.x + 1.5, z: chair.cell.z + 0.5 } });
      }
      break;
    }
    case "dispatch":
      place({ def: "roller-shelf", at: "wall", anchor: zoneCentre(facts, "boxes") });
      place({ def: "roller-shelf", at: "wall", anchor: zoneCentre(facts, "boxes") });
      place({ def: "hand-truck", at: "wall", anchor: zoneCentre(facts, "boxes") ?? centre });
      break;
    case "workers":
    case "analyst":
    case "design": {
      const modules = facts.zones.filter((z) => z.use.includes("plants")).length / 2 || 1;
      plants(Math.max(1, Math.round(modules * 1.5)), "plants");
      if (kind === "workers" && !facts.tall.north.size && !facts.tall.west.size) place({ def: "board-stand", at: "wall", anchor: null });
      if (kind === "analyst" && !facts.tall.north.size && !facts.tall.west.size) place({ def: "chart-easel", at: "wall", anchor: null, sides: ["north", "west", "east"] });
      if (kind === "design" && !facts.tall.north.size && !facts.tall.west.size) place({ def: "mood-board", at: "wall", anchor: null, sides: ["north", "west", "east"] });
      if (kind !== "workers") place({ def: "filing-cabinet", at: "wall", anchor: null, sides: ["north", "east"] });
      break;
    }
  }
}

export interface DressOptions {
  /** Interior definitions, the dressing ones included. */
  definitions: Definitions;
  seed: number;
  zones: readonly DressingZone[];
  /** The loading door's opening in the south wall, building cells. */
  loading?: { x1: number; x2: number };
  /** Status rooms' piles: where an overflowing pile's pallet stands, room cells (interiorLayout.ts). */
  piles?: Partial<Record<RoomKind, { pallet: { x: number; z: number } }>>;
}

const memo = new Map<string, TemplateRoom[]>();

/** The template's rooms with their blocking dressing added to each layout. Pure and memoised. */
export function dressRooms(template: BuildingTemplate, options: DressOptions): TemplateRoom[] {
  const key = `${options.seed}|${JSON.stringify(template)}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const rooms = template.rooms.map((room) => {
    const facts = factsOf(template, room, options.zones, options.loading ?? null);
    const seed = roomSeed(options.seed, room.kind);
    const planner = new Planner(facts, options.definitions, seed, options.piles);
    plan(room.kind, facts, planner, options.definitions, random(seed ^ 0x5bd1e995));
    return { ...room, layout: { ...room.layout, props: planner.props } };
  });
  if (memo.size > 256) memo.clear();
  memo.set(key, rooms);
  return rooms;
}

/* ── Decor (never blocks) ─────────────────────────────────────────────── */

export interface DecorItem {
  key: ModelKey;
  room: RoomKind;
  /** The model's origin, building cells. */
  x: number;
  z: number;
  /** Turn about y, radians. */
  rotation: number;
  /** What it stands on: the floor (wall and ceiling pieces carry their own height) or a desk top. */
  on: "floor" | "desk";
  /** Scale per axis; 1 when absent. */
  scale?: { x: number; y: number; z: number };
  /** Leaning against a low wall instead of hanging: lowered by `drop` world units and tipped back. */
  lean?: { drop: number };
}

/** Wall pieces: model key and width in cells. */
const WALL_ART: Partial<Record<RoomKind, [ModelKey, number][]>> = {
  "lead-office": [
    ["decor.picture-pair", 2],
    ["decor.poster-leaf", 1],
    ["decor.wall-clock", 1],
  ],
  lobby: [
    ["decor.wall-clock", 1],
    ["decor.poster-sun", 1],
    ["decor.picture-pair", 2],
  ],
  workers: [
    ["decor.whiteboard", 3],
    ["decor.wall-clock", 1],
    ["decor.window-box", 2],
    ["decor.window-box", 2],
  ],
  meeting: [
    ["decor.screen", 2],
    ["decor.whiteboard", 3],
    ["decor.window-box", 2],
  ],
  planning: [
    ["decor.pin-board", 2],
    ["decor.map-wall", 3],
    ["decor.wall-clock", 1],
  ],
  storage: [
    ["decor.wall-plant-shelf", 2],
    ["decor.window-box", 2],
  ],
  review: [
    ["decor.poster-wave", 1],
    ["decor.picture-pair", 2],
    ["decor.wall-plant-shelf", 2],
  ],
  dispatch: [
    ["decor.wall-clock", 1],
    ["decor.wall-plant-shelf", 2],
  ],
  analyst: [
    ["decor.chart-wall", 2],
    ["decor.poster-wave", 1],
  ],
  design: [
    ["decor.mood-wall", 3],
    ["decor.poster-sun", 1],
  ],
};
/** Pieces low enough to hang art above. */
const LOW = new Set(["lounge-sofa", "armchair", "side-table", "coffee-table", "bench", "workdesk", "mailbox"]);
/** Pictures that lean against a low partition when a room has no tall wall. */
const LEANING: ModelKey[] = ["decor.poster-leaf", "decor.poster-sun", "decor.poster-wave"];

/** The non-blocking dressing of every room, building cells. Deterministic for a template and seed. */
export function roomDecor(template: BuildingTemplate, options: Omit<DressOptions, "definitions"> & { definitions: Definitions }): DecorItem[] {
  const out: DecorItem[] = [];
  const defs = options.definitions;
  for (const room of template.rooms) {
    const facts = factsOf(template, room, options.zones, options.loading ?? null);
    const rand = random(roomSeed(options.seed, room.kind) ^ 0x2545f491);
    const at = (key: ModelKey, x: number, z: number, rotation = 0, extra: Partial<DecorItem> = {}) =>
      out.push({ key, room: room.kind, x: room.origin.x + x, z: room.origin.z + z, rotation, on: "floor", ...extra });
    const props = room.layout.props;
    const blockedBy = new Map<string, string>();
    for (const p of props) for (const c of propCells(p, defs)) blockedBy.set(cellKey(c), p.definitionId);

    // Pendants above every desk and table.
    for (const p of props) {
      const def = defs[p.definitionId];
      if (!def) continue;
      const pose = poseOf(p, defs);
      if (def.tags.includes("desk") || p.definitionId === "coffee-table") at("decor.pendant-lamp", pose.x, pose.z);
      if (p.definitionId === "meeting-table" || p.definitionId === "planning-table")
        for (const dx of def.footprint.width >= 4 ? [-1, 1] : [0]) at("decor.pendant-lamp", pose.x + dx, pose.z);
    }

    // Chairs all around the meeting table, tucked in.
    for (const p of props.filter((q) => q.definitionId === "meeting-table")) {
      const def = defs[p.definitionId]!;
      const pose = poseOf(p, defs);
      const half = { x: 1.83, z: 0.79 }; // the table top, in cells
      for (const dx of [-1.15, 0, 1.15]) {
        at("decor.meeting-chair", pose.x + dx, pose.z - half.z - 0.15, 0);
        at("decor.meeting-chair", pose.x + dx, pose.z + half.z + 0.15, Math.PI);
      }
      at("decor.meeting-chair", pose.x - half.x - 0.15, pose.z, Math.PI / 2);
      at("decor.meeting-chair", pose.x + half.x + 0.15, pose.z, -Math.PI / 2);
      // A long rug under the table and chairs.
      at("decor.rug-long", pose.x, pose.z, 0, { scale: { x: (def.footprint.width + 2) / 2.77, y: 1, z: (def.footprint.depth + 2) / 1.77 } });
    }

    // Rugs.
    const sofa = props.find((p) => p.definitionId === "lounge-sofa");
    if (sofa) {
      const pose = poseOf(sofa, defs);
      const c = offset(pose, 1);
      at("decor.rug-long", c.x, c.z, Math.atan2(pose.front.x, pose.front.z), { scale: { x: 1, y: 1, z: 1.1 } });
    }
    if (room.kind === "lobby") {
      const e = room.layout.entrance;
      at("decor.rug-runner", e.x + 0.5, e.z - 1, 0, { scale: { x: 1, y: 1, z: 1.2 } });
      const waiting = zoneCentre(facts, "waiting");
      if (waiting) at("decor.rug-round", waiting.x, waiting.z, 0);
      const coffee = zoneCentre(facts, "coffee");
      if (coffee) at("decor.rug-round", coffee.x - 0.5, coffee.z + 0.5, 0, { scale: { x: 0.75, y: 1, z: 0.75 } });
      // A station clock hangs over the hall when no tall wall carries the clock.
      if (!facts.tall.north.size && !facts.tall.west.size) at("decor.station-clock", facts.width / 2, facts.depth / 2 - 1.5, 0.5);
      // Two pendants over the hall.
      at("decor.pendant-lamp", facts.width / 2 - 2.5, facts.depth / 2);
      at("decor.pendant-lamp", facts.width / 2 + 2.5, facts.depth / 2);
    }
    const armchair = props.find((p) => p.definitionId === "armchair" && room.kind === "review");
    if (armchair) {
      const pose = poseOf(armchair, defs);
      at("decor.rug-round", pose.x + 0.3, pose.z + 0.3, 0, { scale: { x: 0.8, y: 1, z: 0.8 } });
    }
    if (room.kind === "design" || room.kind === "analyst") {
      const free = facts.zones.find((z) => z.use.includes("plants"));
      if (free) at(room.kind === "design" ? "decor.rug-round" : "decor.rug-long", free.x + free.width / 2 + 1, free.z + free.depth / 2 + 1, 0, { scale: { x: 0.7, y: 1, z: 0.7 } });
    }

    // Things on desks: books or a little plant on some workstations.
    for (const p of props.filter((q) => q.definitionId === "workdesk")) {
      const pose = poseOf(p, defs);
      const r = rand();
      if (r < 0.35) at("decor.desk-books", pose.x + 0.8, pose.z + 0.15, rand() - 0.5, { on: "desk" });
      else if (r < 0.6) at("decor.desk-plant", pose.x + 0.8, pose.z + 0.2, 0, { on: "desk" });
    }

    // Wall art along the tall back walls; pictures lean against a low partition where a room has none.
    const art = [...(WALL_ART[room.kind] ?? [])];
    const used = new Set<string>();
    const free = (side: "north" | "west", i: number) => {
      const cell = side === "north" ? `${i},0` : `0,${i}`;
      const under = blockedBy.get(cell);
      return facts.tall[side].has(i) && !used.has(`${side}${i}`) && (!under || LOW.has(under));
    };
    for (const side of ["west", "north"] as const) {
      const length = side === "north" ? facts.width : facts.depth;
      // Start at a seeded place along the wall so neighbours differ.
      const start = Math.floor(rand() * length);
      for (let k = 0; k < art.length; ) {
        const [key, w] = art[k]!;
        let found = -1;
        for (let j = 0; j < length && found < 0; j++) {
          const i = (start + j) % length;
          if (i + w > length) continue;
          let ok = true;
          for (let t = -1; t <= w && ok; t++) if (t >= 0 && t < w ? !free(side, i + t) : used.has(`${side}${i + t}`)) ok = false;
          if (ok) found = i;
        }
        if (found < 0) {
          k++;
          continue;
        }
        for (let t = 0; t < w; t++) used.add(`${side}${found + t}`);
        if (side === "north") at(key, found + w / 2, 0.5, 0);
        else at(key, 0.5, found + w / 2, Math.PI / 2);
        art.splice(k, 1);
      }
    }
    if (!facts.tall.north.size && !facts.tall.west.size && room.kind !== "lobby") {
      // One or two framed prints leaning against the north partition, clear of doors and furniture.
      let placed = 0;
      const want = room.kind === "lead-office" ? 2 : 1;
      const door = new Set(facts.doors.map(cellKey));
      for (let x = facts.width - 2; x >= 1 && placed < want; x--) {
        if (door.has(`${x},0`) || door.has(`${x - 1},0`) || door.has(`${x + 1},0`) || blockedBy.has(`${x},0`)) continue;
        at(LEANING[(placed + Math.floor(rand() * 3)) % 3]!, x + 0.5, 0.5, 0, { lean: { drop: 0.5 } });
        placed++;
        x--;
      }
    }

    // Dispatch's loading door gets its roller door, half open.
    if (options.loading && room.kind === "dispatch" && room.origin.z + facts.depth === template.size.depth) {
      const x1 = Math.max(options.loading.x1, room.origin.x) - room.origin.x,
        x2 = Math.min(options.loading.x2, room.origin.x + facts.width) - room.origin.x;
      if (x2 > x1) at("decor.truck-door", (x1 + x2) / 2, facts.depth - 0.5, Math.PI, { scale: { x: (x2 - x1) / 3, y: 1, z: 1 } });
    }
  }
  return out;
}
