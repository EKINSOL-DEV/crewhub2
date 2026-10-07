import assert from "node:assert/strict";
import test from "node:test";
import { occupancy, validateLayout, type Cell } from "@crewhub/world-engine";
import type { AgentPlacement, Building, RoomKind, WorkObject } from "@crewhub/world-model";
import {
  BUILDING_CELL,
  buildingTemplate as templateOf,
  DEPTH,
  doorCell,
  doorOpenings,
  dressingZones,
  interiorDefinitions,
  MAX_WIDTH,
  MODULE,
  PLOT_MARGIN,
  roomOf,
  wallRuns,
  type BuildingTemplate,
} from "../src/world/buildingTemplate.ts";
import { PLOT_SIZE } from "../src/world/townLayout.ts";
import { DRESS_PREFIX } from "../src/world/roomDressing.ts";
import { assignDesks, pileCapacity, placeObjects, roomNeighbor } from "../src/world/interiorLayout.ts";

/** These tests mean the classic template, whatever plan is the default. */
const buildingTemplate = (b: Building) => templateOf(b, "classic");

const agent = (key: string, room: RoomKind, extra: Partial<AgentPlacement> = {}): AgentPlacement => ({
  key,
  name: key,
  displayName: key,
  registered: false,
  role: room === "lead-office" ? "lead" : room === "design" ? "design" : room === "analyst" ? "analyst" : "worker",
  roleSource: "name-rule",
  building: "cr",
  room,
  presence: "real",
  workingIn: null,
  locationInferred: false,
  laneStatus: "working",
  posture: "focused",
  caption: null,
  deskTicketKey: null,
  alerts: [],
  ...extra,
});

const object = (id: string, room: RoomKind, extra: Partial<WorkObject> = {}): WorkObject => ({
  ticketId: id,
  key: `CR-${id}`,
  title: id,
  kind: "task",
  look: "folder",
  status: room === "storage" ? "backlog" : room === "planning" ? "planned" : room === "review" ? "review" : room === "dispatch" ? "done" : "in_progress",
  room,
  deskOf: null,
  deskInferred: false,
  position: 0,
  priorityTag: null,
  blocked: false,
  sealed: false,
  stall: null,
  nameTag: null,
  waitingOnHuman: false,
  milestone: null,
  labels: [],
  speechMarkUntil: null,
  celebrateUntil: null,
    rejected: null,
    turnedDownUntil: null,
  transit: null,
  ...extra,
});

function building(agents: AgentPlacement[], extraRooms: RoomKind[] = [], objects: WorkObject[] = []): Building {
  const kinds = new Set<RoomKind>(["lobby", "lead-office", "storage", "planning", "review", "dispatch", ...extraRooms]);
  for (const a of agents) if (a.room) kinds.add(a.room);
  return {
    slug: "cr",
    zoneId: "default",
    key: "CR",
    name: "CrewHub",
    color: "coral",
    icon: "home",
    archived: false,
    counts: { backlog: 0, planned: 0, in_progress: 0, review: 0, done: 0 },
    lead: { id: "cr-lead", displayName: "cr-lead" },
    rooms: [...kinds].map((kind) => ({ id: `cr:${kind}`, kind, label: kind, present: true, emptyLabel: null })),
    objects,
    agents: [agent("cr-lead", "lead-office"), ...agents],
    milestones: [],
    releases: [],
    beacons: [],
    mailbox: [],
    archivedCount: 0,
  };
}

const workers = (n: number, room: RoomKind = "workers") => Array.from({ length: n }, (_, i) => agent(`cr-dev-${i + 1}`, room));

function reachable(room: BuildingTemplate["rooms"][number], from: Cell): Set<string> {
  const blocked = occupancy(room.layout, interiorDefinitions);
  const { width, depth } = room.layout.grid;
  const seen = new Set<string>([`${from.x},${from.z}`]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = { x: c.x + dx, z: c.z + dz };
      if (n.x < 0 || n.z < 0 || n.x >= width || n.z >= depth || blocked[n.z * width + n.x] !== -1 || seen.has(`${n.x},${n.z}`)) continue;
      seen.add(`${n.x},${n.z}`);
      queue.push(n);
    }
  }
  return seen;
}

const onEdge = (room: BuildingTemplate["rooms"][number], c: Cell) =>
  c.x === 0 || c.z === 0 || c.x === room.layout.grid.width - 1 || c.z === room.layout.grid.depth - 1;

const variants: [string, Building][] = [
  ["no workers", building([])],
  ["every room", building([...workers(3), agent("cr-analyst-1", "analyst"), agent("cr-design-1", "design")], ["meeting"])],
  ["grown rooms", building([...workers(7), ...workers(3, "analyst").map((a, i) => ({ ...a, key: `cr-analyst-${i}` }))])],
];

test("every layout validates, every door is an open edge cell and every room is reachable from the entrance", () => {
  for (const [name, b] of variants) {
    const template = buildingTemplate(b);
    for (const room of template.rooms) validateLayout(room.layout, interiorDefinitions);
    const entrance = template.doors.filter((d) => d.b.room === "town");
    assert.equal(entrance.length, 1, name);
    assert.equal(entrance[0]!.a.room, "lobby");
    // Rooms joined through doors whose cells are open and connected inside each room.
    const visited = new Set<RoomKind>(["lobby"]);
    const queue: RoomKind[] = ["lobby"];
    while (queue.length) {
      const kind = queue.shift()!;
      const room = roomOf(template, kind)!;
      const inside = reachable(room, room.layout.entrance);
      for (const door of template.doors) {
        for (const [here, there] of [
          [door.a, door.b],
          [door.b, door.a],
        ] as const) {
          if (here.room !== kind) continue;
          assert.ok(onEdge(room, here.cell), `${name}: ${door.id} is on the edge of ${kind}`);
          assert.ok(inside.has(`${here.cell.x},${here.cell.z}`), `${name}: ${door.id} is open and reachable in ${kind}`);
          if (there.room === "town" || visited.has(there.room)) continue;
          const a = doorCell(template, here)!,
            b = doorCell(template, there)!;
          assert.equal(Math.abs(a.x - b.x) + Math.abs(a.z - b.z), 1, `${name}: ${door.id} joins neighbouring cells`);
          visited.add(there.room);
          queue.push(there.room);
        }
      }
    }
    assert.deepEqual([...visited].sort(), template.rooms.map((r) => r.kind).sort(), name);
  }
});

test("role rooms grow east in modules and keep their origin; the template is deterministic", () => {
  const small = buildingTemplate(building(workers(3)));
  const grown = buildingTemplate(building(workers(6)));
  const a = roomOf(small, "workers")!,
    b = roomOf(grown, "workers")!;
  assert.deepEqual(a.origin, b.origin);
  assert.equal(a.layout.grid.width, MODULE);
  assert.equal(b.layout.grid.width, 2 * MODULE);
  assert.ok(grown.size.width > small.size.width);
  assert.deepEqual(buildingTemplate(building(workers(6))), grown);
});

test("walls leave a gap at every door", () => {
  const template = buildingTemplate(variants[1]![1]);
  const runs = wallRuns(template);
  for (const door of template.doors) {
    const a = doorCell(template, door.a)!,
      b = doorCell(template, door.b)!;
    // The door's edge lies between the two cells: no wall run may cover its midpoint.
    const mx = (a.x + b.x + 1) / 2,
      mz = (a.z + b.z + 1) / 2;
    const covered = runs.some((r) =>
      r.z1 === r.z2 ? r.z1 === mz && mx > r.x1 && mx < r.x2 : r.x1 === mx && mz > r.z1 && mz < r.z2,
    );
    assert.equal(covered, false, door.id);
  }
});

test("desks go by agent key, the lead sits at the lead's desk", () => {
  const b = building([agent("cr-dev-2", "workers"), agent("cr-dev-1", "workers")]);
  const desks = assignDesks(b, buildingTemplate(b));
  assert.equal(desks.get("cr-lead")?.definitionId, "lead-desk");
  assert.equal(desks.get("cr-dev-1")?.propId, "desk-0");
  assert.equal(desks.get("cr-dev-2")?.propId, "desk-1");
});

test("piles fill in board order, overflow onto a counted pallet, and flights get a landing slot", () => {
  const planned = [3, 1, 2].map((p) => object(`p${p}`, "planning", { position: p }));
  const review = Array.from({ length: pileCapacity("review") + 5 }, (_, i) => object(`r${i}`, "review", { position: i }));
  const inbox = object("i1", "lead-office", { status: "in_progress" });
  const flying = object("f1", "planning", {
    position: 9,
    transit: { fromRoom: "planning", toRoom: "review", toDeskOf: null, startedAt: 0, until: 1 },
  });
  const b = building(workers(1), [], [...planned, ...review, inbox, flying]);
  const template = buildingTemplate(b);
  const layout = placeObjects(b, template, assignDesks(b, template));
  const front = layout.placements.get("p1")!,
    second = layout.placements.get("p2")!;
  assert.ok(front.x > second.x, "next up lies at the front of the table");
  const pallet = layout.pallets.find((p) => p.room === "review");
  assert.equal(pallet?.count, 5 + 4, "the last slot's stack and the overflow go on the pallet");
  assert.equal(layout.placements.has(`r${review.length - 1}`), false);
  assert.equal(layout.placements.get("i1")?.slot, "inbox");
  assert.equal(layout.targets.get("f1")?.room, "review");
});

test("arrow keys move between neighbouring rooms", () => {
  const template = buildingTemplate(variants[1]![1]);
  assert.equal(roomNeighbor(template, "lobby", "ArrowUp"), "lead-office");
  assert.equal(roomNeighbor(template, "lobby", "ArrowLeft"), "dispatch");
  assert.equal(roomNeighbor(template, "lead-office", "ArrowUp"), "meeting");
  assert.equal(roomNeighbor(template, "storage", "ArrowUp"), "storage");
});

test("the largest building fits 20 x 18 world units with a margin on its plot, and a one-agent room is roomy", () => {
  assert.ok(MAX_WIDTH * BUILDING_CELL <= 20, "at most 20 units wide");
  assert.ok(DEPTH * BUILDING_CELL <= 18, "at most 18 units deep");
  assert.ok((PLOT_SIZE - MAX_WIDTH * BUILDING_CELL) / 2 >= 2, "2 units east and west");
  assert.ok(PLOT_SIZE - PLOT_MARGIN - DEPTH * BUILDING_CELL >= 2 && PLOT_MARGIN >= 2, "2 units north and south");
  const largest = buildingTemplate(building([...workers(8), ...workers(4, "analyst"), ...workers(4, "design")].map((a, i) => ({ ...a, key: `cr-${a.room}-${i}` })), ["meeting"]));
  assert.equal(largest.size.width, MAX_WIDTH);
  const one = roomOf(buildingTemplate(building(workers(1))), "workers")!;
  assert.ok(one.layout.grid.width * BUILDING_CELL >= 3.5 && one.layout.grid.depth * BUILDING_CELL >= 7, "a one-agent workers room is no cupboard");
});

test("dressing zones lie inside their rooms on free floor, and blocking them keeps every door, seat and approach reachable", () => {
  for (const [name, b] of variants) {
    // The zones are free floor of the bare template; the room dressing (roomDressing.ts) then fills them.
    const dressed = buildingTemplate(b);
    const template = { ...dressed, rooms: dressed.rooms.map((r) => ({ ...r, layout: { ...r.layout, props: r.layout.props.filter((p) => !p.id.startsWith(DRESS_PREFIX)) } })) };
    const zones = dressingZones(template);
    for (const kind of ["lobby", "lead-office"] as const) assert.ok(zones.some((z) => z.room === kind), `${name}: ${kind} has a zone`);
    for (const room of template.rooms) {
      const own = zones.filter((z) => z.room === room.kind);
      const blocked = occupancy(room.layout, interiorDefinitions);
      const { width, depth } = room.layout.grid;
      const doors = template.doors.flatMap((d) => [d.a, d.b]).filter((s) => s.room === room.kind).map((s) => `${s.cell.x},${s.cell.z}`);
      const needed = new Set(doors);
      for (const prop of room.layout.props)
        for (const a of interiorDefinitions[prop.definitionId]!.approaches) needed.add(`${prop.cell.x + a.x},${prop.cell.z + a.z}`);
      const zoned = new Set<string>();
      for (const z of own)
        for (let dz = 0; dz < z.depth; dz++)
          for (let dx = 0; dx < z.width; dx++) {
            const x = z.x - room.origin.x + dx,
              cz = z.z - room.origin.z + dz;
            assert.ok(x >= 0 && cz >= 0 && x < width && cz < depth, `${name}: ${room.kind} zone "${z.use}" is inside the room`);
            assert.equal(blocked[cz * width + x], -1, `${name}: ${room.kind} zone "${z.use}" is free floor`);
            assert.ok(!needed.has(`${x},${cz}`), `${name}: ${room.kind} zone "${z.use}" keeps doors and approaches free`);
            zoned.add(`${x},${cz}`);
          }
      // Dress every zone with a blocking prop: the room's doors and approaches stay connected.
      const dressed = {
        ...room,
        layout: {
          ...room.layout,
          props: [
            ...room.layout.props,
            ...[...zoned].map((key, i) => {
              const [x, z] = key.split(",").map(Number) as [number, number];
              return { id: `zone-${i}`, definitionId: "mailbox", cell: { x, z }, rotation: 0 as const };
            }),
          ],
        },
      };
      const inside = reachable(dressed, room.layout.entrance);
      for (const cell of needed) {
        const [x, z] = cell.split(",").map(Number) as [number, number];
        if (x < 0 || z < 0 || x >= width || z >= depth) continue;
        assert.ok(inside.has(cell), `${name}: ${room.kind} ${cell} stays reachable with the zones dressed`);
      }
    }
  }
});

test("door openings are one or two cells wide around their door, walls merge into maximal runs, and none covers an opening", () => {
  for (const [name, b] of variants) {
    const template = buildingTemplate(b);
    const openings = doorOpenings(template);
    const runs = wallRuns(template);
    for (const door of template.doors) {
      const o = openings.find((x) => x.id === door.id)!;
      const length = o.x2 - o.x1 + (o.z2 - o.z1);
      assert.ok(o && (length === 1 || length === 2), `${name}: ${door.id} opening`);
      const a = doorCell(template, door.a)!,
        c = doorCell(template, door.b)!;
      const mx = (a.x + c.x + 1) / 2,
        mz = (a.z + c.z + 1) / 2;
      const inside = o.z1 === o.z2 ? o.z1 === mz && mx > o.x1 && mx < o.x2 : o.x1 === mx && mz > o.z1 && mz < o.z2;
      assert.ok(inside, `${name}: ${door.id} opening holds its door`);
    }
    assert.ok(openings.some((o) => o.id === "loading"), `${name}: dispatch's loading door`);
    for (const o of openings)
      for (const r of runs) {
        const overlap =
          o.z1 === o.z2
            ? r.z1 === r.z2 && r.z1 === o.z1 && Math.min(r.x2, o.x2) > Math.max(r.x1, o.x1)
            : r.x1 === r.x2 && r.x1 === o.x1 && Math.min(r.z2, o.z2) > Math.max(r.z1, o.z1);
        assert.ok(!overlap, `${name}: a wall covers opening ${o.id}`);
      }
    // No two runs of one side touch end to end on one line: they would have merged.
    for (const r of runs)
      for (const q of runs)
        if (r !== q && r.side === q.side) {
          const touching = r.z1 === r.z2 ? q.z1 === q.z2 && q.z1 === r.z1 && q.x1 === r.x2 : q.x1 === q.x2 && q.x1 === r.x1 && q.z1 === r.z2;
          assert.ok(!touching, `${name}: runs merge`);
        }
    // The back wall is one run along the whole west side.
    assert.ok(runs.some((r) => r.side === "west" && r.x1 === 0 && r.z1 === 0 && r.z2 === DEPTH), `${name}: one west wall`);
  }
});
