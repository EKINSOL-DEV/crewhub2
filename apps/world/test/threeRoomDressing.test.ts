/* The dressing of the three-room plan (spec addendum "three rooms per building"): the halls are dressed without
   blocking a rack, a desk, the huddle's ring, the mailbox's letters or a door; the lamps show the lane; the racks and
   halls have their words. Until the three-room template lands, the fixture here is the addendum's floor plan by hand. */
import assert from "node:assert/strict";
import test from "node:test";
import { approachCells, occupancy, validateLayout, type Cell, type Definitions, type WorldLayout, type WorldProp } from "@crewhub/world-engine";
import type { RoomKind } from "@crewhub/world-model";
import { interiorDefinitions, LOADING, type BuildingTemplate, type DressingZone, type TemplateRoom } from "../src/world/buildingTemplate.ts";
import { deskZoneOf, DRESS_PREFIX, dressingSeed, dressRooms, isThreeRoom, lampLane, RACKS, roomDecor } from "../src/world/roomDressing.ts";
import { agent } from "./fixtures.ts";

/** The addendum's pieces, as the template defines them (threeRoomTemplate.ts); here until that file lands. */
const rack = (id: string, room: RoomKind) => ({ id, label: id, footprint: { width: 3, depth: 1 }, blocksMovement: true, tags: [room, "pile"], approaches: [{ x: 1, z: 1 }] });
const definitions: Definitions = {
  ...interiorDefinitions,
  "rack-backlog": interiorDefinitions["rack-backlog"] ?? rack("rack-backlog", "storage"),
  "rack-planning": interiorDefinitions["rack-planning"] ?? rack("rack-planning", "planning"),
  "rack-review": interiorDefinitions["rack-review"] ?? rack("rack-review", "review"),
  "rack-done": interiorDefinitions["rack-done"] ?? rack("rack-done", "dispatch"),
  "huddle-table": interiorDefinitions["huddle-table"] ?? {
    id: "huddle-table",
    label: "Huddle table",
    footprint: { width: 2, depth: 2 },
    blocksMovement: true,
    tags: ["gather"],
    approaches: [{ x: 0, z: -1 }, { x: 1, z: -1 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 0, z: 2 }, { x: 1, z: 2 }, { x: -1, z: 0 }, { x: -1, z: 1 }],
  },
  "archive-counter": interiorDefinitions["archive-counter"] ?? { id: "archive-counter", label: "Archive counter", footprint: { width: 3, depth: 1 }, blocksMovement: true, tags: ["archive", "counter"], approaches: [{ x: 1, z: -1 }] },
};

const prop = (id: string, definitionId: string, x: number, z: number): WorldProp => ({ id, definitionId, cell: { x, z }, rotation: 0 });
const layout = (width: number, depth: number, entrance: Cell, props: WorldProp[]) => ({ version: 1 as const, grid: { width, depth, cellSize: 0.6 }, props, entrance });

/** The addendum's floor plan with `columns` module columns on the floor (2 to 4). */
function threeRooms(columns: number): BuildingTemplate & { plan: string } {
  const floorWidth = 6 * columns;
  const desks: WorldProp[] = [];
  const roles = ["workers", "analyst", "design"] as const;
  let n = 0;
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < columns; column++) {
      if (row === 2 && column === 0) continue; // the huddle's module
      const role = roles[Math.min(2, Math.floor(n / 2))]!;
      const x = column * 6,
        z = row * 6;
      desks.push(prop(`desk-${role}-${desks.length}`, "workdesk", x + 1, z + 2), prop(`desk-${role}-${desks.length + 1}`, "workdesk", x + 3, z + 4));
      n++;
    }
  const rooms: TemplateRoom[] = [
    { kind: "lead-office", hosts: [], origin: { x: 0, z: 0 }, layout: layout(9, 18, { x: 8, z: 14 }, [prop("lead-desk", "lead-desk", 3, 2), prop("side-desk-0", "workdesk", 5, 8), prop("side-desk-1", "workdesk", 5, 11)]) },
    { kind: "workers", hosts: ["analyst", "design", "meeting"], origin: { x: 9, z: 0 }, layout: layout(floorWidth, 18, { x: 0, z: 14 }, [...desks, prop("huddle", "huddle-table", 2, 14)]) },
    {
      kind: "lobby",
      // Administration hosts the status rooms (and the model's lobby): `TemplateRoom.hosts` of the three-room template.
      hosts: ["storage", "planning", "review", "dispatch"],
      origin: { x: 0, z: 18 },
      layout: layout(21, 10, { x: 15, z: 9 }, [
        ...RACKS.map((r, i) => prop(r.definitionId, r.definitionId, 1 + i * 4, 0)),
        prop("mailbox", "mailbox", 8, 7),
        prop("counter", "archive-counter", 11, 7),
      ]),
    },
  ];
  return {
    plan: "three-rooms",
    size: { width: Math.max(21, 9 + floorWidth), depth: 28 },
    rooms,
    doors: [
      { id: "entrance", a: { room: "lobby", cell: { x: 15, z: 9 } }, b: { room: "town", cell: { x: 15, z: 28 } } },
      { id: "office-floor", a: { room: "lead-office", cell: { x: 8, z: 14 } }, b: { room: "workers", cell: { x: 0, z: 14 } } },
      { id: "admin-floor", a: { room: "lobby", cell: { x: 18, z: 0 } }, b: { room: "workers", cell: { x: 9, z: 17 } } },
    ],
    piles: piles as BuildingTemplate["piles"],
  };
}

const zonesOf = (t: BuildingTemplate): DressingZone[] => {
  const out: DressingZone[] = [];
  const floor = t.rooms.find((r) => r.kind === "workers")!;
  for (let z = 0; z < 18; z += 6)
    for (let x = 0; x < floor.layout.grid.width; x += 6) {
      out.push({ room: "workers", use: "plants between desks", x: floor.origin.x + x + 4, z: floor.origin.z + z, width: 2, depth: 2 });
      out.push({ room: "workers", use: "plants between desks", x: floor.origin.x + x, z: floor.origin.z + z + 4, width: 2, depth: 2 });
    }
  out.push({ room: "lead-office", use: "sofa corner: sofa, coffee table, floor lamp", x: 1, z: 13, width: 3, depth: 3 });
  out.push({ room: "lead-office", use: "bookshelf along the back wall", x: 1, z: 0, width: 3, depth: 1 });
  return out;
};
const piles = {
  storage: { pallet: { x: 2.5, z: 2.5 } },
  planning: { pallet: { x: 6.5, z: 2.5 } },
  review: { pallet: { x: 10.5, z: 2.5 } },
  dispatch: { pallet: { x: 14.5, z: 2.5 } },
};

function reachable(l: WorldLayout): (c: Cell) => boolean {
  const { width, depth } = l.grid;
  const blocked = occupancy(l, definitions);
  const seen = new Uint8Array(width * depth);
  const queue = [l.entrance];
  seen[l.entrance.z * width + l.entrance.x] = 1;
  while (queue.length) {
    const c = queue.pop()!;
    for (const n of [{ x: c.x - 1, z: c.z }, { x: c.x + 1, z: c.z }, { x: c.x, z: c.z - 1 }, { x: c.x, z: c.z + 1 }]) {
      const i = n.z * width + n.x;
      if (n.x < 0 || n.z < 0 || n.x >= width || n.z >= depth || seen[i] || blocked[i] !== -1) continue;
      seen[i] = 1;
      queue.push(n);
    }
  }
  return (c) => c.x >= 0 && c.z >= 0 && c.x < width && c.z < depth && seen[c.z * width + c.x] === 1;
}

test("the three halls are dressed, deterministically, and every rack, desk, huddle place, mailbox and door stays reachable", () => {
  for (const columns of [2, 3, 4])
    for (const slug of ["cr", "ops", "lab"]) {
      const template = threeRooms(columns);
      assert.ok(isThreeRoom(template));
      const options = { definitions, seed: dressingSeed(slug), zones: zonesOf(template), loading: LOADING, piles };
      const rooms = dressRooms(template, options);
      assert.deepEqual(dressRooms(template, options), rooms, "the same building dresses the same way");
      for (const room of rooms) {
        const pieces = room.layout.props.filter((p) => p.id.startsWith(DRESS_PREFIX));
        assert.ok(pieces.length > 0, `${slug}/${room.kind} with ${columns} columns is dressed`);
        assert.doesNotThrow(() => validateLayout(room.layout, definitions), `${slug}/${room.kind}: no overlaps, inside the hall`);
        const bare = template.rooms.find((r) => r.kind === room.kind)!;
        const before = reachable(bare.layout),
          after = reachable(room.layout);
        for (const d of template.doors.flatMap((d) => [d.a, d.b]).filter((s) => s.room === room.kind)) assert.ok(after(d.cell), `${slug}/${room.kind}: door ${d.cell.x},${d.cell.z} stays reachable`);
        for (const p of bare.layout.props) for (const a of approachCells(p, definitions)) if (before(a)) assert.ok(after(a), `${slug}/${room.kind}: ${p.id}'s approach ${a.x},${a.z} stays reachable`);
        // The racks' overflow pallets and the letters east of the mailbox keep their floor.
        const blocked = occupancy(room.layout, definitions);
        const free = (x: number, z: number) => blocked[z * room.layout.grid.width + x] === -1;
        if (room.kind === "lobby") {
          for (const pile of Object.values(piles)) assert.ok(free(Math.floor(pile.pallet.x), Math.floor(pile.pallet.z)), `${slug}: the pallet spot at ${pile.pallet.x},${pile.pallet.z} is free`);
          const mailbox = bare.layout.props.find((p) => p.definitionId === "mailbox")!;
          for (const dx of [1, 2]) assert.ok(free(mailbox.cell.x + dx, mailbox.cell.z), `${slug}: the letters' floor east of the mailbox is free`);
        }
      }
      // The decor: a rug and a pendant at the huddle, the office window on the east wall, a runner from the front door.
      const decor = roomDecor(template, options);
      assert.ok(decor.some((d) => d.room === "workers" && d.key === "decor.rug-round"), "a rug under the huddle");
      assert.ok(decor.some((d) => d.room === "workers" && d.key === "decor.pendant-lamp"), "a pendant over the huddle");
      const window = decor.find((d) => d.key === "decor.office-window");
      assert.ok(window && Math.abs(window.x - 9) < 1e-9 && window.z > 0 && window.z < 18, "the office window stands in the east wall");
      assert.ok(decor.some((d) => d.room === "lobby" && d.key === "decor.rug-runner"), "a runner inside the front door");
      assert.ok(!decor.some((d) => d.key === "decor.station-clock"), "no station clock: that is the classic lobby's");
      for (const pile of Object.values(piles)) assert.ok(decor.some((d) => d.key === "decor.floor-bay" && d.x === pile.pallet.x && d.z === 18 + pile.pallet.z), "a painted bay at each rack's pallet");
    }
});

test("the classic template is not a three-room one, and its dressing is untouched by the plan check", () => {
  assert.equal(isThreeRoom({ rooms: [{ kind: "lobby", hosts: [], origin: { x: 0, z: 0 }, layout: layout(3, 3, { x: 0, z: 0 }, [prop("mailbox", "mailbox", 1, 1)]) }] }), false);
});

test("the racks' signs and the desks' zones", () => {
  assert.deepEqual(RACKS.map((r) => r.definitionId), ["rack-backlog", "rack-planning", "rack-review", "rack-done"]);
  assert.deepEqual(RACKS.map((r) => r.sign), ["Backlog", "Planning", "Review", "Done"]);
  assert.deepEqual(RACKS.map((r) => r.room), ["storage", "planning", "review", "dispatch"]);
  assert.equal(deskZoneOf({ id: "desk-analyst-3" }), "analyst");
  assert.equal(deskZoneOf({ id: "desk-design-0" }), "design");
  assert.equal(deskZoneOf({ id: "desk-workers-11" }), "workers");
  assert.equal(deskZoneOf({ id: "desk-0" }), null);
  assert.equal(deskZoneOf({ id: "side-desk-1" }), null);
});

test("the desk lamp shows the lane: green working, amber waiting, grey idle, off when gone, dim when stalled", () => {
  const working = agent("a", "workers");
  assert.equal(lampLane(working, false, false), "working");
  assert.equal(lampLane({ ...working, posture: "relaxed", laneStatus: "working" }, false, false), "working");
  assert.equal(lampLane(working, true, false), "waiting");
  assert.equal(lampLane({ ...working, posture: "raised-hand", laneStatus: "blocked" }, false, false), "waiting");
  assert.equal(lampLane({ ...working, posture: "relaxed", laneStatus: "idle" }, false, false), "idle");
  assert.equal(lampLane({ ...working, posture: "relaxed", laneStatus: "done" }, false, false), "idle");
  assert.equal(lampLane({ ...working, posture: "greyed", laneStatus: "unknown" }, false, false), "idle");
  assert.equal(lampLane({ ...working, presence: "proxy" }, false, false), "idle");
  assert.equal(lampLane(null, false, false), "off");
  assert.equal(lampLane(working, true, true), "dim");
});
