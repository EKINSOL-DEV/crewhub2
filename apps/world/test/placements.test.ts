import assert from "node:assert/strict";
import test from "node:test";
import { propCells, validateLayout, type Rotation } from "@crewhub/world-engine";
import { createCatalogue, emptyTownDocument, type Building, type PlacedProp, type RoomKind, type TownDocument } from "@crewhub/world-model";
import { buildingTemplate } from "../src/world/buildingTemplate.ts";
import { definitions as builtins } from "../src/world/definitions.ts";
import { cellAt, checkGhost, footprintPose, freeCellIn, freeSpots, placementDefinitions, resolveBuildingPlacements, roomSite } from "../src/world/placements.ts";

function building(): Building {
  const kinds: RoomKind[] = ["lobby", "lead-office", "storage", "planning", "review", "dispatch"];
  return {
    slug: "cr",
    key: "CR",
    name: "CrewHub",
    color: "coral",
    icon: "home",
    archived: false,
    counts: { backlog: 0, planned: 0, in_progress: 0, review: 0, done: 0 },
    lead: { id: "cr-lead", displayName: "cr-lead" },
    rooms: kinds.map((kind) => ({ id: `cr:${kind}`, kind, label: kind, present: true, emptyLabel: null })),
    objects: [],
    agents: [],
    milestones: [],
    releases: [],
    beacons: [],
    mailbox: [],
    archivedCount: 0,
  };
}

const template = buildingTemplate(building());
const doc0 = emptyTownDocument();
const defs = placementDefinitions(createCatalogue(builtins, doc0).definitions);
let n = 0;
const place = (propId: string, room: RoomKind, x: number, z: number, rotation: Rotation = 0, extra: Partial<PlacedProp> = {}): PlacedProp => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  propId,
  at: { building: "cr", room },
  cell: { x, z },
  rotation,
  ...extra,
});
const withPlacements = (...placements: PlacedProp[]): TownDocument => ({ ...doc0, placements });

test("a valid placement joins its room's engine layout; the layout still validates and its revision changes", () => {
  const lamp = place("builtin:lamp", "lobby", 3, 2);
  const before = resolveBuildingPlacements(doc0, "cr", template, defs).rooms.get("lobby")!;
  const after = resolveBuildingPlacements(withPlacements(lamp), "cr", template, defs);
  const lobby = after.rooms.get("lobby")!;
  assert.deepEqual(after.errors, []);
  assert.deepEqual(lobby.placed.map((p) => p.id), [lamp.id]);
  assert.ok(lobby.layout.props.some((p) => p.id === lamp.id && p.definitionId === "builtin:lamp"));
  assert.doesNotThrow(() => validateLayout(lobby.layout, defs));
  assert.notEqual(lobby.revision, before.revision);
});

test("placements apply in document order; the one that no longer fits becomes a labelled error, never dropped", () => {
  const first = place("builtin:table", "lobby", 2, 2);
  const second = place("builtin:lamp", "lobby", 3, 3);
  const result = resolveBuildingPlacements(withPlacements(first, second), "cr", template, defs);
  assert.deepEqual(result.rooms.get("lobby")!.placed.map((p) => p.id), [first.id]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]!.placement.id, second.id);
  assert.equal(result.errors[0]!.room, "lobby");
  assert.match(result.errors[0]!.reason, /overlaps/);
});

test("a door cell stays open: a prop on it, or one that walls it off, is refused", () => {
  // The lobby's north door to the lead's office is lobby cell 4,0.
  const onDoor = checkGhost(doc0, "cr", template, defs, { id: "probe", propId: "builtin:lamp", room: "lobby", cell: { x: 4, z: 0 }, rotation: 0 });
  assert.equal(onDoor.ok, false);
  // The lobby's west door to Dispatch is lobby cell 0,3. Lamps north and south of it still leave the way in from the
  // east; a third lamp there walls the door off.
  const doc = withPlacements(place("builtin:lamp", "lobby", 0, 2), place("builtin:lamp", "lobby", 0, 4));
  assert.deepEqual(resolveBuildingPlacements(doc, "cr", template, defs).errors, []);
  const wall = checkGhost(doc, "cr", template, defs, { id: "probe", propId: "builtin:lamp", room: "lobby", cell: { x: 1, z: 3 }, rotation: 0 });
  assert.deepEqual(wall, { ok: false, reason: "It would block a door or a place someone needs to reach." });
  const beside = checkGhost(doc0, "cr", template, defs, { id: "probe", propId: "builtin:lamp", room: "lobby", cell: { x: 6, z: 1 }, rotation: 0 });
  assert.deepEqual(beside, { ok: true });
});

test("a placement in a room the building does not have now is an error, with the reason", () => {
  const result = resolveBuildingPlacements(withPlacements(place("builtin:plant", "design", 1, 1)), "cr", template, defs);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]!.room, null);
  assert.match(result.errors[0]!.reason, /design is not in this building now/);
});

test("props riding on a ticket or sitting on an agent's desk take no cells", () => {
  const sticker = place("builtin:plant", "lobby", 4, 0, 0, { attachment: { kind: "ticket", ref: "CR-12" } });
  const mascot = place("builtin:lamp", "lobby", 4, 0, 0, { attachment: { kind: "agent", ref: "cr-dev-1" } });
  const result = resolveBuildingPlacements(withPlacements(sticker, mascot), "cr", template, defs);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rooms.get("lobby")!.placed, []);
});

test("moving a placed prop is checked against everything but itself", () => {
  const table = place("builtin:table", "lobby", 2, 2);
  const doc = withPlacements(table);
  assert.deepEqual(checkGhost(doc, "cr", template, defs, { id: table.id, propId: table.propId, room: "lobby", cell: { x: 2, z: 3 }, rotation: 0 }), { ok: true });
  const other = checkGhost(doc, "cr", template, defs, { id: "new", propId: table.propId, room: "lobby", cell: { x: 2, z: 3 }, rotation: 0 });
  assert.equal(other.ok, false);
});

test("the first free cell of a room is one the engine accepts", () => {
  const lobby = resolveBuildingPlacements(doc0, "cr", template, defs).rooms.get("lobby")!;
  const cell = freeCellIn(lobby, defs, "builtin:sofa");
  assert.ok(cell);
  assert.deepEqual(checkGhost(doc0, "cr", template, defs, { id: "x", propId: "builtin:sofa", room: "lobby", cell, rotation: 0 }), { ok: true });
});

test("a point in building cells maps to its room and room cell", () => {
  const lobby = roomSite(template, "lobby")!;
  assert.deepEqual(cellAt(template, lobby.origin.x + 2.4, lobby.origin.z + 0.1), { room: "lobby", cell: { x: 2, z: 0 } });
  assert.equal(cellAt(template, -0.5, 3), null);
  assert.equal(cellAt(template, template.size.width + 1, 3), null);
});

test("a turned footprint's pose is the centre of the cells the engine blocks", () => {
  const def = defs["builtin:desk"]!;
  for (const rotation of [0, 1, 2, 3] as const) {
    const cells = propCells({ id: "d", definitionId: "builtin:desk", cell: { x: 4, z: 1 }, rotation }, defs);
    const cx = cells.reduce((s, c) => s + c.x + 0.5, 0) / cells.length;
    const cz = cells.reduce((s, c) => s + c.z + 0.5, 0) / cells.length;
    const pose = footprintPose(def, { x: 4, z: 1 }, rotation);
    assert.ok(Math.abs(pose.x - cx) < 1e-9 && Math.abs(pose.z - cz) < 1e-9, `rotation ${rotation}`);
  }
  // A quarter turn carries the model's +x edge onto +z, as the engine turns the footprint.
  const r = footprintPose(def, { x: 0, z: 0 }, 1).rotationY;
  assert.ok(Math.abs(Math.cos(r)) < 1e-9 && Math.abs(-Math.sin(r) - 1) < 1e-9);
});

test("free spots for error crates start at the camera side and skip furniture and doors", () => {
  const storage = resolveBuildingPlacements(doc0, "cr", template, defs).rooms.get("storage")!;
  const spots = freeSpots(storage, defs, 3);
  assert.equal(spots.length, 3);
  const { width, depth } = storage.layout.grid;
  assert.equal(spots[0]!.z, depth - 1);
  const taken = new Set(storage.layout.props.flatMap((p) => propCells(p, defs)).map((c) => `${c.x},${c.z}`));
  for (const spot of spots) assert.ok(spot.x < width && spot.z < depth && !taken.has(`${spot.x},${spot.z}`), `${spot.x},${spot.z}`);
  // The storage door (3, 4) carries a marker, so it is never a spot.
  assert.ok(taken.has("3,4"));
});
