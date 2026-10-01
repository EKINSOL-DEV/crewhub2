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
  "chart-board": piece("chart-board", "Chart board", 2, 1),
  "mood-board": piece("mood-board", "Mood board", 2, 1),
  "round-table": piece("round-table", "Round table", 2, 2),
  planter: piece("planter", "Big planter", 2, 2),
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
  /** Per room edge, the cells along it that back onto another room's partition, clear of its doorways. */
  partition: Record<Side, Set<number>>;
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
  // A doorway is up to two cells wide and its frame's posts stand at its ends: keep two cells clear either side.
  const nearDoor = (x: number, z: number) => doors.some((d) => Math.abs(d.x - x) <= 2 && Math.abs(d.z - z) <= 2 && (d.x === x || d.z === z));
  const partition: Record<Side, Set<number>> = { north: new Set(), west: new Set(), south: new Set(), east: new Set() };
  const across = (x: number, z: number) => owned.has(`${room.origin.x + x},${room.origin.z + z}`);
  for (let x = 0; x < width; x++) {
    if (across(x, -1) && !nearDoor(x, 0)) partition.north.add(x);
    if (across(x, depth) && !nearDoor(x, depth - 1)) partition.south.add(x);
  }
  for (let z = 0; z < depth; z++) {
    if (across(-1, z) && !nearDoor(0, z)) partition.west.add(z);
    if (across(width, z) && !nearDoor(width - 1, z)) partition.east.add(z);
  }
  return {
    room,
    width,
    depth,
    doors,
    tall: { north, west },
    partition,
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
  /** A word in the piece's id, so the decor can find a group again (a nook's armchair). */
  tag?: string;
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
      const placed = { ...prop, id: `${DRESS_PREFIX}${want.tag ? `${want.tag}-` : ""}${want.def}-${this.#n}` };
      if (this.#fits(placed) && this.#keepsPaths(placed)) {
        this.#n++;
        this.props.push(placed);
        return placed;
      }
    }
    return null;
  }

  /**
   * The centre of the emptiest `size` x `size` stretch of open floor (no furniture, door, seat or kept spot in it), in
   * room cells, or null when the room has none. The emptiest is the one with the most open floor around it as well.
   */
  bareStretch(size: number): { x: number; z: number } | null {
    const { width, depth } = this.#facts;
    const blocked = occupancy({ version: 1, grid: this.#grid(), props: this.props, entrance: this.#facts.room.layout.entrance }, this.#defs);
    const open = (x: number, z: number) => x >= 0 && z >= 0 && x < width && z < depth && blocked[z * width + x] === -1 && !this.#keep.has(`${x},${z}`);
    let best: { x: number; z: number; score: number } | null = null;
    for (let z = 0; z + size <= depth; z++)
      for (let x = 0; x + size <= width; x++) {
        let ok = true;
        for (let dz = 0; dz < size && ok; dz++) for (let dx = 0; dx < size && ok; dx++) ok = open(x + dx, z + dz);
        if (!ok) continue;
        let score = this.#rand() * 0.5;
        for (let dz = -1; dz <= size; dz++) for (let dx = -1; dx <= size; dx++) if (open(x + dx, z + dz)) score++;
        if (!best || score > best.score) best = { x: x + size / 2, z: z + size / 2, score };
      }
    return best && { x: best.x, z: best.z };
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
      // The hall's middle: a round table on a big rug west of the walkway, a large planter east of it.
      place({ def: "round-table", at: "free", anchor: { x: centre.x - 2.5, z: centre.z + 0.5 } });
      place({ def: "planter", at: "free", anchor: { x: centre.x + 2.5, z: centre.z - 1 } });
      const entrance = facts.room.layout.entrance;
      place({ def: "umbrella-stand", at: "free", anchor: { x: entrance.x + 2.5, z: entrance.z + 0.5 } });
      // Plants flank the way in; a reading seat by the coffee corner.
      place({ def: "plant", at: "free", anchor: { x: entrance.x - 1.5, z: entrance.z - 0.5 } });
      place({ def: "plant", at: "free", anchor: { x: entrance.x + 2.5, z: entrance.z - 1.5 } });
      const coffee = zoneCentre(facts, "coffee");
      if (coffee) {
        place({ def: "armchair", at: "free", anchor: { x: coffee.x - 1, z: coffee.z + 0.5 } });
        // The bigger lobby's second coffee table, with its chairs, in the coffee corner.
        place({ def: "round-table", at: "free", anchor: { x: coffee.x + 0.5, z: coffee.z + 1 } });
      }
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
      // The room's signature where no tall wall carries it: the analyst's chart board, the designer's mood board.
      if (kind === "analyst" && !facts.tall.north.size && !facts.tall.west.size) {
        // Tall boards stand on the far walls only: on the east wall they stand between the camera and a desk.
        place({ def: "chart-board", at: "wall", anchor: null, sides: ["north", "west"] });
        place({ def: "chart-easel", at: "wall", anchor: null, sides: ["north", "west", "east"] });
      }
      if (kind === "design" && !facts.tall.north.size && !facts.tall.west.size) place({ def: "mood-board", at: "wall", anchor: null, sides: ["north", "west"] });
      if (kind !== "workers") place({ def: "filing-cabinet", at: "wall", anchor: null, sides: ["north", "east"] });
      break;
    }
  }
  // Large bare floors: a reading nook (an armchair, a side table, a lamp, a rug from the decor) in the emptiest
  // stretch of a room of 60 cells or more, a big planter in storage and dispatch.
  // Not in the lobby (it has its own seats) nor the workers room, where the stretch lies between the desk rows.
  const stretch = kind !== "lobby" && kind !== "workers" && facts.width * facts.depth >= 60 ? planner.bareStretch(3) : null;
  if (!stretch) return;
  if (kind === "storage" || kind === "dispatch") {
    place({ def: "planter", at: "free", anchor: stretch, tag: "nook" });
    return;
  }
  const chair = place({ def: "armchair", at: "free", anchor: { x: stretch.x - 0.5, z: stretch.z - 0.5 }, tag: "nook" });
  if (!chair) return;
  place({ def: "side-table", at: "free", anchor: { x: chair.cell.x + 1.5, z: chair.cell.z + 0.5 }, tag: "nook" });
  place({ def: rand() < 0.5 ? "reading-lamp" : "floor-lamp", at: "free", anchor: { x: chair.cell.x - 0.5, z: chair.cell.z - 0.5 }, tag: "nook" });
  if (rand() < 0.6) place({ def: "plant", at: "free", anchor: { x: chair.cell.x + 2.5, z: chair.cell.z - 0.5 }, tag: "nook" });
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
  on: "floor" | "desk" | "lead-desk";
  /** Scale per axis; 1 when absent. */
  scale?: { x: number; y: number; z: number };
  /** The room edge a partition piece hangs on: its face is seen from that room only. */
  wall?: Side;
  /** Hung higher on a tall wall, world units. */
  raise?: number;
}

/** How far north of its seat's centre a desk chair stands, in cells. */
const CHAIR_BACK = 0.22;
/** Where a wall piece's footprint centre stands off its wall, in cells: clear of the tall walls' thickness. */
const WALL_OFFSET = 0.62;
/** How much higher than its model a piece hangs on the tall walls (they are 1.75 high), world units. */
const HANG = 0.22;

/** Wall pieces: model key, width in cells and, when not the default, how much higher it hangs. */
const WALL_ART: Partial<Record<RoomKind, [ModelKey, number, number?][]>> = {
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
  ],
  meeting: [
    ["decor.screen", 2],
    ["decor.whiteboard", 3],
  ],
  planning: [
    // The signature: the big planning board, already drawn at its height.
    ["decor.planning-board", 4, 0],
    ["decor.map-wall", 3],
    ["decor.pin-board", 2],
    ["decor.wall-clock", 1],
  ],
  storage: [
    ["decor.wall-plant-shelf", 2],
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
/** Each rug's size in cells (its model's outline), and how far it keeps from the walls. */
const RUG_SIZE: Partial<Record<ModelKey, [number, number]>> = {
  "decor.rug-grand": [4.83, 4.83],
  "decor.rug-long": [2.77, 1.77],
  "decor.rug-round": [2.67, 2.67],
  "decor.rug-runner": [1.53, 2.8],
};
const RUG_MARGIN = 0.15;
/** Pieces low enough to hang art above. */
const LOW = new Set(["lounge-sofa", "armchair", "side-table", "coffee-table", "bench", "workdesk", "mailbox"]);
/** Where a partition piece's footprint centre stands off the partition, in cells: its back against the face. */
const PARTITION_OFFSET = 0.485;
/** Small pieces for the partitions between rooms (0.6 high), by room kind, in the order a room wants them. */
const PARTITION_ART: Partial<Record<RoomKind, [ModelKey, number][]>> = {
  "lead-office": [
    ["decor.frame-trio", 2],
    ["decor.ledge-plant", 1],
    ["decor.small-clock", 1],
  ],
  lobby: [
    ["decor.frame-trio", 2],
    ["decor.ledge-plant", 1],
    ["decor.frame-hill", 1],
  ],
  workers: [
    ["decor.calendar", 1],
    ["decor.ledge-plant", 1],
    ["decor.pin-strip", 2],
    ["decor.small-clock", 1],
  ],
  meeting: [
    ["decor.small-clock", 1],
    ["decor.frame-hill", 1],
    ["decor.ledge-plant", 1],
  ],
  planning: [
    ["decor.calendar", 1],
    ["decor.pin-strip", 2],
    ["decor.small-clock", 1],
  ],
  storage: [
    ["decor.calendar", 1],
    ["decor.small-clock", 1],
  ],
  review: [
    ["decor.frame-botanical", 1],
    ["decor.ledge-plant", 1],
    ["decor.pin-strip", 2],
  ],
  dispatch: [
    ["decor.calendar", 1],
    ["decor.small-clock", 1],
    ["decor.pin-strip", 2],
  ],
  analyst: [
    ["decor.calendar", 1],
    ["decor.frame-botanical", 1],
    ["decor.ledge-plant", 1],
  ],
  design: [
    ["decor.frame-trio", 2],
    ["decor.ledge-plant", 1],
    ["decor.frame-hill", 1],
  ],
};

/** The non-blocking dressing of every room, building cells. Deterministic for a template and seed. */
export function roomDecor(template: BuildingTemplate, options: Omit<DressOptions, "definitions"> & { definitions: Definitions }): DecorItem[] {
  const out: DecorItem[] = [];
  const defs = options.definitions;
  for (const room of template.rooms) {
    const facts = factsOf(template, room, options.zones, options.loading ?? null);
    const rand = random(roomSeed(options.seed, room.kind) ^ 0x2545f491);
    const at = (key: ModelKey, x: number, z: number, rotation = 0, extra: Partial<DecorItem> = {}) =>
      out.push({ key, room: room.kind, x: room.origin.x + x, z: room.origin.z + z, rotation, on: "floor", ...extra });
    // A rug stays on the room's own floor: clear of the walls, never out over the slab's rim.
    const rug = (key: ModelKey, x: number, z: number, rotation = 0, extra: Partial<DecorItem> = {}) => {
      const [w, d] = RUG_SIZE[key] ?? [1, 1];
      const sx = extra.scale?.x ?? 1,
        sz = extra.scale?.z ?? 1;
      const c = Math.abs(Math.cos(rotation)),
        s = Math.abs(Math.sin(rotation));
      const hx = (c * w * sx + s * d * sz) / 2,
        hz = (s * w * sx + c * d * sz) / 2;
      const inside = (v: number, half: number, length: number) => (half + RUG_MARGIN > length - half - RUG_MARGIN ? length / 2 : Math.min(Math.max(v, half + RUG_MARGIN), length - half - RUG_MARGIN));
      at(key, inside(x, hx, facts.width), inside(z, hz, facts.depth), rotation, extra);
    };
    // A pendant is its shade and, drawn only up close, its cord and ceiling rose.
    const pendant = (x: number, z: number) => {
      at("decor.pendant-lamp", x, z);
      at("decor.pendant-cord", x, z);
    };
    const props = room.layout.props;
    const blockedBy = new Map<string, string>();
    for (const p of props) for (const c of propCells(p, defs)) blockedBy.set(cellKey(c), p.definitionId);

    // Pendants above every desk and table.
    for (const p of props) {
      const def = defs[p.definitionId];
      if (!def) continue;
      const pose = poseOf(p, defs);
      // Over tables only: over a desk the shade hangs between the camera and the robot at it (the desk has its lamp).
      if (p.definitionId === "coffee-table" || p.definitionId === "round-table") pendant(pose.x, pose.z);
      if (p.definitionId === "round-table") {
        // The first table gets the grand rug; a second one a smaller round rug.
        const first = props.find((q) => q.definitionId === "round-table") === p;
        rug(first ? "decor.rug-grand" : "decor.rug-round", pose.x, pose.z, 0, first ? {} : { scale: { x: 0.85, y: 1, z: 0.85 } });
      }
      // Not over the planning table: its ticket pile reads first.
      if (p.definitionId === "meeting-table") for (const dx of def.footprint.width >= 4 ? [-1, 1] : [0]) pendant(pose.x + dx, pose.z);
    }

    // A chair at every desk's seat, a little behind it: the robot at the desk stands in front of it.
    for (const p of props.filter((q) => defs[q.definitionId]?.tags.includes("desk"))) {
      const seat = approachCells(p, defs)[0];
      if (!seat) continue;
      const lead = p.definitionId === "lead-desk";
      at("decor.desk-chair", seat.x + 0.5, seat.z + 0.5 - CHAIR_BACK, (rand() - 0.5) * 0.5, lead ? { scale: { x: 1.15, y: 1.15, z: 1.15 } } : {});
    }

    // A runner under the planning table frames its pile; a painted bay where an overflowing pile's pallet stands.
    for (const p of props.filter((q) => q.definitionId === "planning-table")) {
      const def = defs[p.definitionId]!;
      const pose = poseOf(p, defs);
      rug("decor.rug-long", pose.x, pose.z, 0, { scale: { x: (def.footprint.width + 1.5) / 2.77, y: 1, z: (def.footprint.depth + 1.2) / 1.77 } });
    }
    const pallet = options.piles?.[room.kind]?.pallet;
    if (pallet) at("decor.floor-bay", pallet.x, pallet.z);

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
      rug("decor.rug-long", pose.x, pose.z, 0, { scale: { x: (def.footprint.width + 2) / 2.77, y: 1, z: (def.footprint.depth + 2) / 1.77 } });
    }

    // Rugs.
    const sofa = props.find((p) => p.definitionId === "lounge-sofa");
    if (sofa) {
      const pose = poseOf(sofa, defs);
      const c = offset(pose, 1);
      rug("decor.rug-long", c.x, c.z, Math.atan2(pose.front.x, pose.front.z), { scale: { x: 1, y: 1, z: 1.1 } });
    }
    if (room.kind === "lobby") {
      const e = room.layout.entrance;
      rug("decor.rug-runner", e.x + 0.5, e.z - 1, 0, { scale: { x: 1, y: 1, z: 1.2 } });
      const waiting = zoneCentre(facts, "waiting");
      if (waiting) rug("decor.rug-round", waiting.x, waiting.z, 0);
      const coffee = zoneCentre(facts, "coffee");
      if (coffee) rug("decor.rug-round", coffee.x - 0.5, coffee.z + 0.5, 0, { scale: { x: 0.75, y: 1, z: 0.75 } });
      // A station clock hangs over the hall when no tall wall carries the clock.
      if (!facts.tall.north.size && !facts.tall.west.size) at("decor.station-clock", facts.width / 2, facts.depth / 2 - 1.5, 0.5);
    }
    // Evening warmth: a table lamp and a candle on the review room's side table and the lead's coffee table.
    for (const p of props.filter((q) => (q.definitionId === "side-table" && room.kind === "review") || (q.definitionId === "coffee-table" && room.kind === "lead-office"))) {
      const pose = poseOf(p, defs);
      at("decor.table-lamp", pose.x - 0.15, pose.z - 0.1, rand() * Math.PI, { raise: p.definitionId === "side-table" ? 0.33 : 0.24 });
    }
    // A round rug under each reading nook's armchair and side table.
    for (const p of props.filter((q) => q.id.startsWith(`${DRESS_PREFIX}nook-armchair`))) {
      const pose = poseOf(p, defs);
      rug("decor.rug-round", pose.x + 0.5, pose.z, 0, { scale: { x: 0.8, y: 1, z: 0.7 } });
    }
    const armchair = props.find((p) => p.definitionId === "armchair" && room.kind === "review");
    if (armchair) {
      const pose = poseOf(armchair, defs);
      rug("decor.rug-round", pose.x + 0.3, pose.z + 0.3, 0, { scale: { x: 0.8, y: 1, z: 0.8 } });
    }
    if (room.kind === "design" || room.kind === "analyst") {
      const free = facts.zones.find((z) => z.use.includes("plants"));
      if (free) rug(room.kind === "design" ? "decor.rug-round" : "decor.rug-long", free.x + free.width / 2 + 1, free.z + free.depth / 2 + 1, 0, { scale: { x: 0.7, y: 1, z: 0.7 } });
    }

    // Wall art along the tall back walls.
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
        const [key, w, raise = HANG] = art[k]!;
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
        if (side === "north") at(key, found + w / 2, WALL_OFFSET, 0, { raise });
        else at(key, WALL_OFFSET, found + w / 2, Math.PI / 2, { raise });
        art.splice(k, 1);
      }
    }

    // The greenhouse glass (the tall north wall): a few blinds pulled half down, a ledge of potted plants on the knee
    // wall and plants hanging in the bays between, on the stretches that wall art and furniture leave free.
    const blinds = new Set<number>();
    const north = (x: number) => facts.tall.north.has(x) && !used.has(`north${x}`);
    for (let x = 0; x + 2 <= facts.width; x++)
      if (north(x) && north(x + 1) && rand() < 0.3) {
        at("decor.blind", x + 1, WALL_OFFSET, 0);
        blinds.add(x).add(x + 1);
        x += 2;
      }
    for (let x = 0; x < facts.width; x++) {
      if (!north(x)) continue;
      if (x + 1 < facts.width && north(x + 1) && !blockedBy.has(`${x},0`) && !blockedBy.has(`${x + 1},0`) && rand() < 0.7) {
        at("decor.glass-ledge", x + 1, WALL_OFFSET, 0);
        used.add(`north${x}`).add(`north${x + 1}`);
        x += 1;
      } else if (!blinds.has(x) && free("north", x) && rand() < 0.6) {
        at("decor.hanging-plant", x + 0.5, WALL_OFFSET, 0);
        used.add(`north${x}`);
      }
    }
    // Small art on the partitions between rooms, on both faces (the camera turns): two pieces at most on the north
    // and west edges (the faces the home camera sees), one on the others, where no furniture or seat stands before it.
    const busy = new Set(blockedBy.keys());
    for (const p of props) if (!p.id.startsWith(DRESS_PREFIX)) for (const a of approachCells(p, defs)) busy.add(cellKey(a));
    const list = PARTITION_ART[room.kind] ?? [];
    const first = Math.floor(rand() * list.length);
    const pieces = list.map((_, i) => list[(first + i) % list.length]!);
    const hung = new Set<string>();
    const edge = (side: Side, i: number, inward: number) =>
      side === "north" ? `${i},${inward}` : side === "south" ? `${i},${facts.depth - 1 - inward}` : side === "west" ? `${inward},${i}` : `${facts.width - 1 - inward},${i}`;
    const open = (side: Side, i: number) => facts.partition[side].has(i) && !hung.has(`${side}${i}`) && !busy.has(edge(side, i, 0)) && !busy.has(edge(side, i, 1));
    for (const side of ["north", "west", "south", "east"] as const) {
      const length = side === "north" || side === "south" ? facts.width : facts.depth;
      const start = Math.floor(rand() * length);
      for (let count = 0; count < (side === "north" || side === "west" ? 2 : 1) && pieces.length; ) {
        const [key, w] = pieces[0]!;
        let found = -1;
        for (let j = 0; j < length && found < 0; j++) {
          const i = (start + j) % length;
          let ok = i + w <= length && !hung.has(`${side}${i - 1}`) && !hung.has(`${side}${i + w}`);
          for (let t = 0; t < w && ok; t++) ok = open(side, i + t);
          if (ok) found = i;
        }
        if (found < 0) break;
        for (let t = 0; t < w; t++) hung.add(`${side}${found + t}`);
        const along = found + w / 2;
        if (side === "north") at(key, along, PARTITION_OFFSET, 0, { wall: side });
        else if (side === "south") at(key, along, facts.depth - PARTITION_OFFSET, Math.PI, { wall: side });
        else if (side === "west") at(key, PARTITION_OFFSET, along, Math.PI / 2, { wall: side });
        else at(key, facts.width - PARTITION_OFFSET, along, -Math.PI / 2, { wall: side });
        pieces.shift();
        count++;
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

/* ── Personal desks ───────────────────────────────────────────────────── */

/** A desk and who sits at it: the view's desk slots (interiorLayout.ts), building cells. */
export interface PersonalDesk {
  agentKey: string;
  room: RoomKind;
  definitionId: string;
  /** The desk's centre, building cells. */
  desk: { x: number; z: number };
}

const PERSONAL: ModelKey[] = ["decor.desk-mug", "decor.photo-frame", "decor.desk-plant", "decor.desk-books", "decor.sticky-notes", "decor.headphones"];
/**
 * Free spots on a desk top, in cells from its centre (the seat is north): clear of the lamp (west end), the monitor
 * (south middle), the ticket stack (east of the middle) and, on the lead's desk, the inbox tray, the bug jar and the
 * trophy.
 */
const DESK_SPOTS: Record<string, { x: number; z: number }[]> = {
  workdesk: [
    { x: 0.78, z: -0.26 },
    { x: 0.76, z: 0.3 },
    { x: -0.4, z: -0.36 },
  ],
  "lead-desk": [{ x: -0.7, z: -0.5 }],
};

/** A small personal set on every desk, seeded by the agent's key: the same agent keeps the same things. */
export function deskItems(desks: Iterable<PersonalDesk>): DecorItem[] {
  const out: DecorItem[] = [];
  for (const d of desks) {
    const spots = DESK_SPOTS[d.definitionId];
    if (!spots) continue;
    const rand = random(dressingSeed(`desk:${d.agentKey}`));
    const pool = [...PERSONAL];
    const count = Math.min(spots.length, 2 + Math.floor(rand() * 2));
    for (let i = 0; i < count; i++) {
      const key = pool.splice(Math.floor(rand() * pool.length), 1)[0]!;
      const spot = spots[i]!;
      // Photos and headphones face the seat; the rest turn a little at random.
      const rotation = key === "decor.photo-frame" ? Math.PI + (rand() - 0.5) * 0.6 : (rand() - 0.5) * 1.2;
      out.push({ key, room: d.room, x: d.desk.x + spot.x, z: d.desk.z + spot.z, rotation, on: d.definitionId === "lead-desk" ? "lead-desk" : "desk" });
    }
  }
  return out;
}
