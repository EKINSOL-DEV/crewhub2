import assert from "node:assert/strict";
import test from "node:test";
import { occupancy, validateLayout, type Cell } from "@crewhub/world-engine";
import type { AgentPlacement, Building, RoomKind } from "@crewhub/world-model";
import {
  buildingTemplate,
  DEPTH,
  deskZone,
  doorCell,
  doorOpenings,
  dressingZones,
  ENTRANCE,
  hallOf,
  interiorDefinitions,
  LOADING,
  MAX_WIDTH,
  MODULE,
  roomOf,
  wallRuns,
  type TemplateRoom,
} from "../src/world/buildingTemplate.ts";
import { ADMIN, ADMIN_DOOR, floorCapacity, floorColumns, HALL_HOSTS, OFFICE, OFFICE_DOOR, RACKS, RACK_SHELVES, RACK_SLOTS } from "../src/world/threeRoomTemplate.ts";
import { assignDesks, pileCapacity, placeObjects, roomNeighbor, firstRoom } from "../src/world/interiorLayout.ts";
import { DRESS_PREFIX } from "../src/world/roomDressing.ts";
import { NavWorld, POST_OFFICE_CELL, roomId, TOWN_ROOM } from "../src/world/navigation.ts";
import { Walks } from "../src/world/walks.ts";
import { freeCellIn, resolveBuildingPlacements, placementDefinitions } from "../src/world/placements.ts";
import { emptyTownDocument } from "@crewhub/world-model";
import { agent, building as fixtureBuilding, object, world } from "./fixtures.ts";

const ALL_KINDS: RoomKind[] = ["lobby", "lead-office", "workers", "analyst", "design", "storage", "planning", "review", "dispatch", "meeting"];

/** A building with `n` agents per role room (the lead in the office), every classic room present. */
function team(workers: number, analysts = 0, designers = 0, extra: RoomKind[] = []): Building {
  const agents: AgentPlacement[] = [
    ...Array.from({ length: workers }, (_, i) => agent(`cr/dev-${String(i).padStart(2, "0")}`, "workers")),
    ...Array.from({ length: analysts }, (_, i) => agent(`cr-analyst-${String(i).padStart(2, "0")}`, "analyst")),
    ...Array.from({ length: designers }, (_, i) => agent(`cr-design-${String(i).padStart(2, "0")}`, "design")),
  ];
  return fixtureBuilding("cr", agents, [], extra);
}
const three = (b: Building) => buildingTemplate(b, "three-rooms");

/** Cells of a room reachable from `from` on the room's own (dressed) occupancy. */
function reachable(room: TemplateRoom, from: Cell): Set<string> {
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

const variants: [string, Building][] = [
  ["no agents", team(0)],
  ["small team", team(3, 1, 1, ["meeting"])],
  ["full house", team(9, 5, 4)],
  ["past capacity", team(30, 6, 6)],
];

test("the shape: three halls at the addendum's origins, the doors between them, the front and loading doors", () => {
  for (const [name, b] of variants) {
    const t = three(b);
    assert.equal(t.plan, "three-rooms", name);
    assert.deepEqual(t.rooms.map((r) => r.kind), ["lead-office", "workers", "lobby"], name);
    for (const room of t.rooms) validateLayout(room.layout, interiorDefinitions);
    const office = roomOf(t, "lead-office")!,
      floor = roomOf(t, "workers")!,
      admin = roomOf(t, "lobby")!;
    assert.deepEqual([office.origin, office.layout.grid.width, office.layout.grid.depth], [{ x: 0, z: 0 }, OFFICE.width, OFFICE.depth], `${name}: office`);
    assert.deepEqual([floor.origin, floor.layout.grid.depth], [{ x: OFFICE.width, z: 0 }, 3 * MODULE], `${name}: floor`);
    assert.equal(floor.layout.grid.width % MODULE, 0, `${name}: the floor is whole modules wide`);
    assert.deepEqual([admin.origin, admin.layout.grid.width, admin.layout.grid.depth], [{ x: 0, z: OFFICE.depth }, ADMIN.width, ADMIN.depth], `${name}: administration`);
    assert.equal(ADMIN.z + ADMIN.depth, DEPTH);
    assert.equal(t.size.depth, DEPTH);
    assert.equal(t.size.width, Math.max(ADMIN.width, OFFICE.width + floor.layout.grid.width), name);
    // Doors: office to floor, floor to administration, the front door at ENTRANCE; the loading door at LOADING.
    const byId = new Map(t.doors.map((d) => [d.id, d]));
    assert.deepEqual(byId.get("office-floor"), { id: "office-floor", a: { room: "lead-office", cell: OFFICE_DOOR.office }, b: { room: "workers", cell: OFFICE_DOOR.floor } });
    assert.deepEqual(byId.get("floor-admin"), { id: "floor-admin", a: { room: "workers", cell: ADMIN_DOOR.floor }, b: { room: "lobby", cell: ADMIN_DOOR.admin } });
    assert.deepEqual(doorCell(t, byId.get("entrance")!.b), ENTRANCE);
    assert.deepEqual(doorCell(t, byId.get("entrance")!.a), { x: ENTRANCE.x, z: DEPTH - 1 });
    for (const d of t.doors) {
      if (d.b.room === "town") continue;
      const a = doorCell(t, d.a)!,
        c = doorCell(t, d.b)!;
      assert.equal(Math.abs(a.x - c.x) + Math.abs(a.z - c.z), 1, `${name}: ${d.id} joins neighbouring cells`);
    }
    const openings = doorOpenings(t);
    const loading = openings.find((o) => o.id === "loading")!;
    assert.deepEqual([loading.x1, loading.x2, loading.z1], [LOADING.x1, LOADING.x2, DEPTH], `${name}: loading door`);
    // Walls stand only between halls and on the outline, with a gap at every door.
    const runs = wallRuns(t);
    for (const door of t.doors) {
      const a = doorCell(t, door.a)!,
        c = doorCell(t, door.b)!;
      const mx = (a.x + c.x + 1) / 2,
        mz = (a.z + c.z + 1) / 2;
      assert.equal(
        runs.some((r) => (r.z1 === r.z2 ? r.z1 === mz && mx > r.x1 && mx < r.x2 : r.x1 === mx && mz > r.z1 && mz < r.z2)),
        false,
        `${name}: ${door.id} has its gap`,
      );
    }
    const inner = runs.filter((r) => r.side === "inner");
    assert.ok(inner.every((r) => (r.z1 === r.z2 && r.z1 === OFFICE.depth) || (r.x1 === r.x2 && r.x1 === OFFICE.width)), `${name}: inner walls only on the hall lines`);
    // The racks stand against Administration's north wall at x 1, 5, 9 and 13, tagged with their model room.
    for (const rack of RACKS) {
      const p = admin.layout.props.find((q) => q.id === rack.id)!;
      assert.deepEqual(p.cell, { x: rack.x, z: 0 }, `${name}: ${rack.id}`);
      assert.deepEqual(interiorDefinitions[p.definitionId]!.tags, [rack.room, "pile"]);
    }
    assert.ok(admin.layout.props.some((p) => p.definitionId === "mailbox") && admin.layout.props.some((p) => p.definitionId === "archive-counter"), `${name}: mailbox and counter`);
    assert.ok(floor.layout.props.some((p) => p.definitionId === "huddle-table"), `${name}: the huddle`);
    assert.equal(office.layout.props.filter((p) => p.definitionId === "workdesk").length, 2, `${name}: two side desks`);
    assert.equal(office.layout.props.filter((p) => p.definitionId === "lead-desk").length, 1, `${name}: the lead's desk`);
  }
});

test("every door, seat, rack approach and huddle place is reachable inside its hall, and the halls join through the doors", () => {
  for (const [name, b] of variants) {
    const t = three(b);
    const visited = new Set<RoomKind>(["lobby"]);
    const queue: RoomKind[] = ["lobby"];
    while (queue.length) {
      const kind = queue.shift()!;
      const room = roomOf(t, kind)!;
      const inside = reachable(room, room.layout.entrance);
      for (const prop of room.layout.props) {
        if (prop.id.startsWith(DRESS_PREFIX)) continue;
        for (const a of interiorDefinitions[prop.definitionId]!.approaches) {
          const c = { x: prop.cell.x + a.x, z: prop.cell.z + a.z };
          assert.ok(inside.has(`${c.x},${c.z}`), `${name}: ${kind} ${prop.id} approach ${c.x},${c.z} is reachable`);
        }
      }
      for (const door of t.doors)
        for (const [here, there] of [
          [door.a, door.b],
          [door.b, door.a],
        ] as const) {
          if (here.room !== kind) continue;
          assert.ok(inside.has(`${here.cell.x},${here.cell.z}`), `${name}: ${door.id} is open in ${kind}`);
          if (there.room === "town" || visited.has(there.room)) continue;
          visited.add(there.room);
          queue.push(there.room);
        }
    }
    assert.deepEqual([...visited].sort(), ["lead-office", "lobby", "workers"], name);
    // The huddle has places all round it, every one free.
    const floor = roomOf(t, "workers")!;
    const huddle = floor.layout.props.find((p) => p.definitionId === "huddle-table")!;
    assert.equal(interiorDefinitions["huddle-table"]!.approaches.length, 8, `${name}: eight places round the huddle`);
    const open = reachable(floor, floor.layout.entrance);
    assert.ok(interiorDefinitions["huddle-table"]!.approaches.every((a) => open.has(`${huddle.cell.x + a.x},${huddle.cell.z + a.z}`)), `${name}: huddle places free`);
  }
});

test("desks by role: each agent sits at a desk of its own room kind, roles contiguous in fill order", () => {
  const b = team(3, 2, 1);
  const t = three(b);
  const desks = assignDesks(b, t);
  assert.equal(desks.get("cr-lead")?.definitionId, "lead-desk");
  for (const a of b.agents) {
    if (a.key === "cr-lead") continue;
    const slot = desks.get(a.key);
    assert.ok(slot, `${a.key} has a desk`);
    assert.equal(deskZone({ id: slot!.propId }), a.room, `${a.key} sits in its zone`);
    assert.equal(slot!.room, a.room);
  }
  // Fill order on the floor: the workers' modules first, then the analysts', then design; a role's desks contiguous.
  const floor = roomOf(t, "workers")!;
  const order = floor.layout.props.filter((p) => p.definitionId === "workdesk").map((p) => deskZone(p));
  assert.deepEqual(order, ["workers", "workers", "workers", "workers", "analyst", "analyst", "design", "design"]);
  // Two agents of one role sit at desks of one module: the first two desks are the first module's.
  const firstModule = floor.layout.props.filter((p) => deskZone(p) === "workers").slice(0, 2);
  assert.ok(firstModule.every((p) => p.cell.x < MODULE && p.cell.z < MODULE), "the first module is the back-west one");
  // A role room the model has keeps a module even without an agent; one it lacks gets none.
  const empty = three(fixtureBuilding("cr", [agent("cr/dev-0", "workers")], [], ["design"]));
  const zones = roomOf(empty, "workers")!.layout.props.filter((p) => p.definitionId === "workdesk").map((p) => deskZone(p));
  assert.deepEqual(zones, ["workers", "workers", "design", "design"]);
  // Classic desks and the office's side desks carry no zone of their own.
  assert.equal(deskZone({ id: "desk-0" }), null);
  assert.equal(deskZone({ id: "side-desk-1" }), null);
});

test("capacity: two, three and four columns hold 10, 16 and 22 desks; an agent past that gets no desk", () => {
  assert.deepEqual([2, 3, 4].map(floorCapacity), [10, 16, 22]);
  const cases: [number, number][] = [
    [9, 2],
    [11, 3],
    [17, 4],
    [30, 4],
  ];
  for (const [workers, columns] of cases) {
    const b = team(workers);
    assert.equal(floorColumns(b), columns, `${workers} workers`);
    const t = three(b);
    assert.equal(roomOf(t, "workers")!.layout.grid.width, columns * MODULE, `${workers} workers: width`);
    const desks = assignDesks(b, t);
    const seated = b.agents.filter((a) => a.room === "workers" && desks.has(a.key)).length;
    assert.equal(seated, Math.min(workers, floorCapacity(columns)), `${workers} workers seated`);
  }
});

test("the footprint is never wider than MAX_WIDTH and keeps the classic depth; a small team's building is 21 wide", () => {
  assert.equal(three(team(0)).size.width, 21);
  assert.equal(three(team(3, 1, 1)).size.width, 21);
  for (const [name, b] of variants) {
    const t = three(b);
    assert.ok(t.size.width <= MAX_WIDTH, `${name}: ${t.size.width} <= ${MAX_WIDTH}`);
    assert.equal(t.size.depth, DEPTH, name);
    for (const room of t.rooms) {
      assert.ok(room.origin.x + room.layout.grid.width <= t.size.width, `${name}: ${room.kind} fits the width`);
      assert.ok(room.origin.z + room.layout.grid.depth <= t.size.depth, `${name}: ${room.kind} fits the depth`);
    }
  }
  assert.equal(three(team(30, 6, 6)).size.width, MAX_WIDTH);
});

test("roomOf resolves every RoomKind to its hall, and the classic template is untouched", () => {
  const t = three(team(2, 1, 1, ["meeting"]));
  const expected: Record<RoomKind, RoomKind> = {
    lobby: "lobby",
    storage: "lobby",
    planning: "lobby",
    review: "lobby",
    dispatch: "lobby",
    workers: "workers",
    analyst: "workers",
    design: "workers",
    meeting: "workers",
    "lead-office": "lead-office",
  };
  for (const kind of ALL_KINDS) {
    assert.equal(roomOf(t, kind)?.kind, expected[kind], kind);
    assert.equal(hallOf(t, kind), expected[kind], kind);
  }
  for (const room of t.rooms) assert.deepEqual(room.hosts, HALL_HOSTS[room.kind as keyof typeof HALL_HOSTS], room.kind);
  const classic = buildingTemplate(team(2, 1, 1, ["meeting"]));
  assert.equal(classic.plan, "classic");
  assert.equal(classic.rooms.length, 10);
  for (const room of classic.rooms) assert.deepEqual(room.hosts, []);
  for (const kind of ALL_KINDS) assert.equal(roomOf(classic, kind)?.kind, kind);
  assert.equal(hallOf(classic, "meeting"), "meeting");
  assert.equal(hallOf(buildingTemplate(team(1)), "meeting"), null);
  // Keyboard focus moves between the halls; the first focus is Administration, where you come in.
  assert.equal(firstRoom(t), "lobby");
  assert.equal(roomNeighbor(t, "lobby", "ArrowUp"), "workers");
  assert.equal(roomNeighbor(t, "workers", "ArrowLeft"), "lead-office");
  assert.equal(roomNeighbor(t, "lead-office", "ArrowDown"), "lobby");
});

test("piles: a rack per status with three slots on four shelves, a counted pallet in front past twelve, and landing slots", () => {
  const backlog = Array.from({ length: 14 }, (_, i) => object(`b${i}`, "storage", { position: i }));
  const review = [2, 0, 1].map((p) => object(`r${p}`, "review", { position: p }));
  const flying = object("f1", "planning", { position: 9, transit: { fromRoom: "planning", toRoom: "review", toDeskOf: null, startedAt: 0, until: 1 } });
  const onDesk = object("d1", "workers", { status: "in_progress", deskOf: "cr/dev-00" });
  const b = fixtureBuilding("cr", [agent("cr/dev-00", "workers")], [...backlog, ...review, flying, onDesk]);
  const t = three(b);
  for (const rack of RACKS) assert.equal(pileCapacity(rack.room, t.piles), RACK_SLOTS * RACK_SHELVES, rack.room);
  const admin = roomOf(t, "lobby")!;
  const layout = placeObjects(b, t, assignDesks(b, t));
  // Twelve fit on the rack; the rest goes to the pallet in front of it.
  const shown = backlog.filter((o) => layout.placements.has(o.ticketId));
  assert.equal(shown.length, RACK_SLOTS * RACK_SHELVES);
  for (const o of shown) {
    const p = layout.placements.get(o.ticketId)!;
    assert.equal(p.surface, "shelf");
    assert.equal(p.room, "storage");
    assert.ok(p.level >= 0 && p.level < RACK_SHELVES, `${o.ticketId} on a shelf`);
    assert.ok(p.x >= admin.origin.x + 1 && p.x <= admin.origin.x + 4 && Math.abs(p.z - (admin.origin.z + 0.5)) < 1e-9, `${o.ticketId} on the backlog rack`);
  }
  assert.deepEqual(
    layout.placements.get("b0"),
    { room: "storage", x: admin.origin.x + 1.5, z: admin.origin.z + 0.5, surface: "shelf", level: 0, slot: "storage:0" },
    "the first object: first slot, bottom shelf",
  );
  assert.equal(layout.placements.get("b3")!.level, 1, "the fourth object starts the second shelf");
  const pallet = layout.pallets.find((p) => p.room === "storage")!;
  assert.equal(pallet.count, backlog.length - shown.length);
  assert.deepEqual([pallet.x, pallet.z], [admin.origin.x + 1 + 1.5, admin.origin.z + 2.5], "the pallet stands in front of the backlog rack");
  // Board order on the review rack; a flight lands on the least stacked review slot; a desk ticket lies on its desk.
  assert.equal(layout.placements.get("r0")!.slot, "review:0");
  assert.equal(layout.placements.get("r2")!.slot, "review:2");
  assert.equal(layout.targets.get("f1")?.room, "review");
  assert.equal(layout.targets.get("f1")?.surface, "shelf");
  assert.equal(layout.placements.get("d1")?.surface, "desk");
  // The classic piles are the classic template's own.
  const classic = buildingTemplate(b);
  assert.equal(pileCapacity("review", classic.piles), pileCapacity("review"));
  assert.equal(placeObjects(b, classic, assignDesks(b, classic)).placements.get("b0")!.surface, "rack");
});

test("dressing zones lie on free floor of their hall and keep every door and approach reachable", () => {
  for (const [name, b] of variants) {
    const dressed = three(b);
    const t = { ...dressed, rooms: dressed.rooms.map((r) => ({ ...r, layout: { ...r.layout, props: r.layout.props.filter((p) => !p.id.startsWith(DRESS_PREFIX)) } })) };
    const zones = dressingZones(t);
    for (const kind of ["lobby", "lead-office", "workers"] as const) assert.ok(zones.some((z) => z.room === kind), `${name}: ${kind} has a zone`);
    for (const room of t.rooms) {
      const blocked = occupancy(room.layout, interiorDefinitions);
      const { width, depth } = room.layout.grid;
      const needed = new Set(t.doors.flatMap((d) => [d.a, d.b]).filter((s) => s.room === room.kind).map((s) => `${s.cell.x},${s.cell.z}`));
      for (const prop of room.layout.props) for (const a of interiorDefinitions[prop.definitionId]!.approaches) needed.add(`${prop.cell.x + a.x},${prop.cell.z + a.z}`);
      const zoned: Cell[] = [];
      for (const z of zones.filter((q) => q.room === room.kind))
        for (let dz = 0; dz < z.depth; dz++)
          for (let dx = 0; dx < z.width; dx++) {
            const x = z.x - room.origin.x + dx,
              cz = z.z - room.origin.z + dz;
            assert.ok(x >= 0 && cz >= 0 && x < width && cz < depth, `${name}: ${room.kind} zone "${z.use}" inside`);
            assert.equal(blocked[cz * width + x], -1, `${name}: ${room.kind} zone "${z.use}" on free floor`);
            assert.ok(!needed.has(`${x},${cz}`), `${name}: ${room.kind} zone "${z.use}" keeps doors and approaches free`);
            zoned.push({ x, z: cz });
          }
      const walled = { ...room, layout: { ...room.layout, props: [...room.layout.props, ...zoned.map((c, i) => ({ id: `zone-${i}`, definitionId: "mailbox", cell: c, rotation: 0 as const }))] } };
      const inside = reachable(walled, room.layout.entrance);
      for (const cell of needed) {
        const [x, z] = cell.split(",").map(Number) as [number, number];
        if (x < 0 || z < 0 || x >= width || z >= depth) continue;
        assert.ok(inside.has(cell), `${name}: ${room.kind} ${cell} stays reachable with the zones dressed`);
      }
    }
  }
});

test("determinism: the same building gives the same template, and the cache keys on the plan", () => {
  const a = three(team(4, 2, 1)),
    b = three(team(4, 2, 1));
  assert.deepEqual(a, b);
  assert.equal(a, b, "the same inputs share one template");
  assert.notEqual(buildingTemplate(team(4, 2, 1)).plan, a.plan);
  assert.deepEqual(three(team(4, 2, 1)), a);
});

test("navigation: three halls joined by doors, reachable from the street; hosted kinds resolve for spots, home and the huddle", () => {
  const nav = new NavWorld();
  const b = team(3, 2, 1, ["meeting"]);
  nav.sync([b], undefined, undefined, "three-rooms");
  assert.deepEqual(nav.rooms("cr").sort(), ["cr/lead-office", "cr/lobby", "cr/workers"]);
  const post = { room: TOWN_ROOM, cell: POST_OFFICE_CELL };
  for (const id of nav.rooms("cr")) {
    const state = nav.graph.room(id)!;
    const { width } = state.layout.grid;
    const i = state.blocked.findIndex((v, j) => v === -1 && !nav.graph.isDoorCell({ room: id, cell: { x: j % width, z: Math.floor(j / width) } }));
    assert.ok(nav.graph.planRoute(post, { room: id, cell: { x: i % width, z: Math.floor(i / width) } }), `${id} is reachable from the post office`);
  }
  const analyst = nav.home("cr", "cr-analyst-00", "analyst")!;
  assert.equal(analyst.room, "cr/workers", "an analyst's seat is on the floor");
  assert.ok(nav.canReach(nav.lobby("cr")!, analyst));
  assert.ok(nav.spots("cr", "pile", "review").length > 0, "the review rack is approached in Administration");
  assert.equal(nav.spots("cr", "pile", "review")[0]!.room, "cr/lobby");
  assert.equal(nav.spots("cr", "pile", "meeting").length, 0, "no pile on the floor");
  assert.ok(nav.around("cr", "gather", "meeting").length >= 8, "places round the huddle for a gather in the meeting room");
  assert.ok(nav.reachableSpots("cr", "pile", "storage", analyst).length > 0, "the backlog rack is reachable from a desk");
  // Switching the plan rebuilds the building: the classic rooms come back.
  nav.sync([b], undefined, undefined, "classic");
  assert.equal(nav.rooms("cr").length, 10);
});

test("placements in a hosted model room land in its hall; one that no longer fits is dropped with the usual notice", () => {
  const b = team(2, 1, 0);
  const t = three(b);
  const definitions = placementDefinitions({});
  const floorCell = freeCellIn(resolveBuildingPlacements(emptyTownDocument(), "cr", t, definitions).rooms.get("workers")!, definitions, "fixed:plant")!;
  const doc = {
    ...emptyTownDocument(),
    placements: [
      { id: "p1", propId: "fixed:plant", at: { building: "cr", room: "analyst" as const }, cell: floorCell, rotation: 0 as const },
      { id: "p2", propId: "fixed:plant", at: { building: "cr", room: "storage" as const }, cell: { x: 2, z: 0 }, rotation: 0 as const },
    ],
  };
  const resolved = resolveBuildingPlacements(doc, "cr", t, definitions);
  assert.deepEqual([...resolved.rooms.keys()], ["lead-office", "workers", "lobby"]);
  assert.ok(resolved.rooms.get("workers")!.placed.some((p) => p.id === "p1"), "the analyst placement stands on the floor");
  assert.equal(resolved.errors.length, 1);
  assert.equal(resolved.errors[0]!.placement.id, "p2", "on the backlog rack: refused");
  assert.equal(resolved.errors[0]!.room, "storage");
});

test("walks under the three-room plan: the hand-over walk crosses the floor's door to the review rack and comes back; a plan switch keeps the walker", () => {
  const T = 5_000_000;
  const walks = new Walks();
  const run = (seconds: number, until?: () => boolean) => {
    for (let i = 0; i < seconds * 30; i++) {
      walks.tick(1 / 30, T + i * 33);
      if (until?.()) return i / 30;
    }
    return seconds;
  };
  const where = (key: string) => walks.nav.sim.actor(key)?.location.room;
  const onDesk = object("t1", "analyst", { key: "CR-1", deskOf: "cr-analyst-1" });
  const model = (o = onDesk) => world([fixtureBuilding("cr", [agent("cr/dev-1", "workers"), agent("cr-analyst-1", "analyst")], [o]), fixtureBuilding("ops")]);
  const options = { entered: "cr", reducedMotion: false, ambient: "off" as const, buildingPlan: "three-rooms" as const };
  walks.update(model(), options);
  run(1);
  const seat = walks.nav.sim.actor("cr-analyst-1")!.location;
  assert.equal(seat.room, roomId("cr", "workers"), "the analyst sits on the floor");
  walks.update(model({ ...onDesk, transit: { fromRoom: "analyst", toRoom: "review", toDeskOf: null, startedAt: T, until: T + 3000 } }), options);
  const reached = run(30, () => where("cr-analyst-1") === roomId("cr", "lobby"));
  assert.ok(reached < 30, "reaches Administration through the floor's door");
  run(40, () => !walks.moving);
  assert.deepEqual(walks.nav.sim.actor("cr-analyst-1")!.location, seat, "back at the desk");
  // Switching the plan rebuilds the building around its walkers: a walker whose cell is gone starts again from the
  // lobby and walks to its desk of the new plan; nobody is lost.
  walks.update(model(), { ...options, buildingPlan: "classic" });
  assert.ok(where("cr-analyst-1")?.startsWith("cr/"), "still inside after the switch to classic");
  assert.ok(run(30, () => where("cr-analyst-1") === roomId("cr", "analyst")) < 30, "walks to the classic analyst room");
  walks.update(model(), options);
  assert.ok(where("cr-analyst-1")?.startsWith("cr/"), "still inside after the switch back");
  assert.ok(run(30, () => where("cr-analyst-1") === roomId("cr", "workers")) < 30, "walks to the floor");
  assert.equal(walks.nav.rooms("cr").length, 3);
});
