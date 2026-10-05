import assert from "node:assert/strict";
import test from "node:test";
import { isTownRoom, NavWorld, POST_OFFICE_CELL, standalonePlan, TOWN_GRID, TOWN_ROOM, TOWN_HALL_CELL, townLocationAt, townRoomId, townRoomSlot, parseRoomId, roomId } from "../src/world/navigation.ts";
import { districtLots, lotCentre } from "../src/world/settlement.ts";
import { agent, building } from "./fixtures.ts";

const town = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    building(`p${i}`, [
      ...Array.from({ length: (i % 4) + 1 }, (_, w) => agent(`p${i}/dev-${w}`, "workers")),
      ...(i % 3 === 0 ? [agent(`p${i}-analyst-1`, "analyst"), agent(`p${i}-design-1`, "design")] : []),
    ], [], i % 5 === 0 ? ["meeting"] : []),
  );

test("the town graph reaches every room of every building from the post office", () => {
  const nav = new NavWorld();
  nav.sync(town(12));
  const post = { room: TOWN_ROOM, cell: POST_OFFICE_CELL };
  let rooms = 0;
  for (const slug of nav.slugs()) {
    for (const id of nav.rooms(slug)) {
      const state = nav.graph.room(id)!;
      const { width, depth } = state.layout.grid;
      // Any open, non-door cell of the room will do as a goal.
      let goal = null;
      for (let i = 0; i < width * depth && !goal; i++) {
        const cell = { x: i % width, z: Math.floor(i / width) };
        if (state.blocked[i] === -1 && !nav.graph.isDoorCell({ room: id, cell })) goal = cell;
      }
      assert.ok(goal, `${id} has an open cell`);
      const plan = nav.graph.planRoute(post, { room: id, cell: goal });
      assert.ok(plan, `${id} is reachable from the post office`);
      // The route leaves the town through this building's own front door.
      assert.ok(plan.legs.some((leg) => leg.viaDoor === `${slug}/entrance`), `${id} is entered through its lobby`);
      rooms++;
    }
    // Home seats, the lobby and the street in front are valid places to walk to.
    for (const location of [nav.lobby(slug)!, nav.front(slug)!, nav.home(slug, `${slug}-lead`, "lead-office")!])
      assert.ok(nav.graph.planRoute(post, location), `${location.room} ${JSON.stringify(location.cell)} is reachable`);
  }
  assert.equal(nav.slugs().length, 12);
  assert.ok(rooms >= 12 * 7);
  assert.ok(nav.graph.planRoute(post, { room: TOWN_ROOM, cell: TOWN_HALL_CELL }), "the town hall is reachable");
});

test("every door joins two open cells, and the town doors are the buildings' front doors", () => {
  const nav = new NavWorld();
  nav.sync(town(12));
  const open = (room: string, cell: { x: number; z: number }) => {
    const state = nav.graph.room(room);
    if (!state) return false;
    const { width, depth } = state.layout.grid;
    return cell.x >= 0 && cell.z >= 0 && cell.x < width && cell.z < depth && state.blocked[cell.z * width + cell.x] === -1;
  };
  const townDoors = new Set<string>();
  for (const door of nav.graph.doors()) {
    assert.ok(open(door.a.room, door.a.cell), `${door.id} side a is open`);
    assert.ok(open(door.b.room, door.b.cell), `${door.id} side b is open`);
    assert.notEqual(door.a.room, door.b.room);
    if (door.b.room === TOWN_ROOM) {
      assert.equal(parseRoomId(door.a.room)?.kind, "lobby", `${door.id} opens into a lobby`);
      townDoors.add(door.id);
    }
  }
  assert.equal(townDoors.size, 12);
});

test("a grown room rebuilds its building and keeps the actors inside; an unchanged shape touches nothing", () => {
  const nav = new NavWorld();
  const small = building("cr", [agent("cr/dev-1", "workers")]);
  nav.sync([small]);
  const seat = nav.home("cr", "cr/dev-1", "workers")!;
  assert.ok(nav.sim.addActor({ id: "cr/dev-1", location: seat }).ok);
  const topology = nav.graph.topologyRevision;

  // Five workers need a second module column: the workers room is replaced, its actor stays where it stood.
  const grown = building("cr", Array.from({ length: 5 }, (_, i) => agent(`cr/dev-${i + 1}`, "workers")));
  const result = nav.sync([grown]);
  assert.deepEqual(result.rebuilt, ["cr"]);
  assert.ok(nav.graph.topologyRevision > topology);
  assert.equal(nav.graph.room(roomId("cr", "workers"))!.layout.grid.width, 12);
  assert.deepEqual(nav.sim.actor("cr/dev-1")!.location, seat);

  // The same shape again touches nothing.
  const before = nav.graph.topologyRevision;
  assert.deepEqual(nav.sync([grown]), { rebuilt: [], removed: [] });
  assert.equal(nav.graph.topologyRevision, before);

  // Archiving the building removes its rooms and the actors in them.
  nav.sync([{ ...grown, archived: true }]);
  assert.equal(nav.graph.room(roomId("cr", "lobby")), undefined);
  assert.equal(nav.sim.actor("cr/dev-1"), undefined);
});

test("director reachability: a room's visitable tags have reachable approach cells, other rooms have none", () => {
  const nav = new NavWorld();
  nav.sync([building("cr", [agent("cr/dev-1", "workers")], [], ["meeting"])]);
  const seat = nav.home("cr", "cr/dev-1", "workers")!;
  const lobby = nav.tags("cr", "lobby");
  for (const tag of ["coffee", "rest", "greenery", "mail"]) {
    assert.ok(lobby.includes(tag), `the lobby offers ${tag}`);
    assert.ok(nav.reachableSpots("cr", tag, "lobby", seat).length > 0, `${tag} is reachable from the workers' desk`);
  }
  assert.deepEqual(nav.reachableSpots("cr", "coffee", "workers", seat), []);
  assert.ok(nav.around("cr", "gather", "meeting").length >= 4, "room around the meeting table");
  assert.ok(nav.beside("cr", "cr/dev-1", "workers").every((c) => !(c.cell.x === seat.cell.x && c.cell.z === seat.cell.z)));
});

test("a region is walked district by district: every district is a room, and the roads join them", () => {
  const nav = new NavWorld();
  // Twenty buildings in four zones: four districts, the centre and three around it.
  const buildings = town(20).map((b, i) => ({ ...b, zoneId: `zone-${i % 4}` }));
  const plan = standalonePlan(buildings);
  assert.equal(plan.districts.length, 4);
  nav.sync(buildings, plan);
  assert.deepEqual(nav.townRooms().sort(), plan.districts.map((d) => townRoomId(d.slot)).sort());
  for (const id of nav.townRooms()) {
    const { width, depth } = nav.graph.room(id)!.layout.grid;
    assert.deepEqual({ width, depth }, TOWN_GRID, "every town room has the same grid");
    assert.ok(isTownRoom(id) && townRoomSlot(id));
  }
  assert.ok(TOWN_GRID.width <= 256 && TOWN_GRID.depth <= 256, "inside the engine's bound");
  const post = { room: TOWN_ROOM, cell: POST_OFFICE_CELL };
  assert.equal(nav.slugs().length, 20);
  for (const slug of nav.slugs()) {
    const front = nav.front(slug)!;
    const route = nav.graph.planRoute(post, front);
    assert.ok(route, `${slug} is reachable from the post office`);
    const lot = plan.lots.find((l) => l.slug === slug)!;
    assert.equal(front.room, townRoomId(lot.slot), "a building's front is in its own district's room");
    // A walk into another district crosses a road's portal, never thin air.
    if (front.room !== TOWN_ROOM) assert.ok(route.legs.some((leg) => leg.viaDoor?.startsWith("road/")), `${slug} is reached by road`);
    const at = nav.toWorld(front);
    assert.ok(Math.abs(at.x - lot.centre.x) < 12 && at.z > lot.centre.z && at.z < lot.centre.z + 15, "the front is on the building's own plot, south of it");
    assert.deepEqual(townLocationAt(at.x, at.z), front);
  }
  assert.equal(nav.graph.doors().filter((d) => d.id.startsWith("road/")).length, plan.roads.length);
  // The same plan again touches nothing.
  const topology = nav.graph.topologyRevision;
  nav.sync(buildings, plan);
  assert.equal(nav.graph.topologyRevision, topology);
});

test("a growing town only adds: a building keeps its rooms when neighbours and districts arrive", () => {
  const nav = new NavWorld();
  const all = town(24).map((b, i) => ({ ...b, zoneId: i < 18 ? "default" : "labs" }));
  nav.sync(all.slice(0, 1), standalonePlan(all.slice(0, 1)));
  const lobby = nav.lobby("p0")!;
  assert.ok(nav.sim.addActor({ id: "p0-lead", location: lobby }).ok);
  for (const count of [2, 5, 10, 17, 24]) {
    const result = nav.sync(all.slice(0, count), standalonePlan(all.slice(0, count)));
    assert.deepEqual(result, { rebuilt: [], removed: [] }, `at ${count} buildings nothing that stood is rebuilt`);
    assert.deepEqual(nav.sim.actor("p0-lead")?.location, lobby);
    assert.equal(nav.slugs().length, count);
  }
  // The default zone outgrew the centre (sixteen lots) and opened a district; labs has its own.
  assert.equal(nav.townRooms().length, 3);
  const far = districtLots({ x: 1, z: 0 })[0]!;
  assert.ok(nav.groundAt(lotCentre(far).x, lotCentre(far).z) > nav.groundAt(lotCentre(far).x + 15, lotCentre(far).z), "a used plot is a lawn, the street beside it is not");
  const post = { room: TOWN_ROOM, cell: POST_OFFICE_CELL };
  for (const slug of nav.slugs()) assert.ok(nav.graph.planRoute(post, nav.front(slug)!), `${slug} is reachable`);
});

test("an archived building has no rooms; a moved building is rebuilt on its new lot", () => {
  const nav = new NavWorld();
  const [a, b] = town(2);
  const plan = standalonePlan([a!, b!]);
  nav.sync([a!, { ...b!, archived: true }], plan);
  assert.deepEqual(nav.slugs(), ["p0"]);
  nav.sync([a!, b!], plan);
  assert.deepEqual(nav.slugs().sort(), ["p0", "p1"]);
  const before = nav.toWorld(nav.front("p1")!);
  const moved = { ...plan, lots: plan.lots.map((l) => (l.slug === "p1" ? { ...l, cell: { x: 66, z: 64 }, centre: lotCentre({ x: 66, z: 64 }) } : l)) };
  const result = nav.sync([a!, b!], moved);
  assert.deepEqual(result.removed, ["p1"]);
  assert.ok(nav.entry("p1"), "it stands again at once");
  assert.equal(Math.round(nav.toWorld(nav.front("p1")!).x - before.x), 30);
});
