/* Work places: what the world tells a cast's figure about the surface it works at (workPlaces.ts). */
import assert from "node:assert/strict";
import test from "node:test";
import type { WorkSurface } from "@crewhub/world-style";
import { deskItems } from "../src/world/roomDressing.ts";
import { deskClutter, HOME_VIEW, templateWorkPlaces, workPlace } from "../src/world/workPlaces.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const desk: WorkSurface = { height: 0.6, half: [0.5, 0.3], screen: [0, 0.8, -0.1], spots: [{ x: -0.3, z: 0.15, radius: 0.14 }, { x: 0.3, z: 0.15, radius: 0.1 }] };
const table: WorkSurface = { height: 0.5, half: [1, 0.4] };

test("a desk turned to its seat: the figure faces it squarely, the screen ahead and facing back at it", () => {
  // As in a building: the desk's model turned half round, the seat to the north and a little east of the middle.
  const { place, heading } = workPlace("desk", desk, { x: 10, z: 20, rotation: Math.PI }, { x: 10.3, z: 19.4 }, 0.62);
  assert.ok(near(heading, 0), "it looks south, over the desk");
  assert.ok(near(place.edge, 0.3), "the top's edge is 0.3 ahead");
  assert.equal(place.height, 0.6);
  assert.ok(near(place.focus[0], -0.3) && near(place.focus[1], 0.8) && near(place.focus[2], 0.7), `the screen's middle in the figure's frame (${place.focus})`);
  assert.ok(near(place.screen![0], 0) && near(place.screen![1], -1), "the screen faces the figure");
});

test("a sitter gets the style's first free place that is wide enough and clear of what the renderer set there", () => {
  const at = { x: 0, z: 0, rotation: Math.PI };
  const stand = { x: 0.3, z: -0.6 };
  const free = workPlace("desk", desk, at, stand, 0.62);
  // The first spot is at the model's (-0.3, 0.15): east and north of the middle once the desk is turned, ahead of the seat.
  const spot = free.place.spot(0.12)!;
  assert.ok(near(spot.x, 0) && near(spot.z, 0.45), `${spot.x}, ${spot.z}`);
  assert.deepEqual({ x: +free.taken!.x.toFixed(6), z: +free.taken!.z.toFixed(6), radius: free.taken!.radius }, { x: 0.3, z: -0.15, radius: 0.12 });
  // A ticket on that place: the next one, if the sitter fits it.
  const ticket = workPlace("desk", desk, at, stand, 0.62, [{ x: 0.3, z: -0.1, radius: 0.1 }]);
  const second = ticket.place.spot(0.1)!;
  assert.ok(near(second.x, -0.6) && near(second.z, 0.45), "the other side of the desk");
  assert.equal(ticket.place.spot(0.12), null, "too wide for the second place: the top is full");
  assert.equal(workPlace("desk", desk, at, stand, 0.62).place.spot(0.2), null, "wider than any place the style offers");
});

test("with two free places a sitter takes the one where it faces the camera; without a choice, or a camera, the style's first", () => {
  // Two places wide enough, either side of the screen. The desk is turned as in a building: the model's +x is the west.
  const wide: WorkSurface = { ...desk, spots: [{ x: -0.3, z: 0.15, radius: 0.14 }, { x: 0.3, z: 0.15, radius: 0.14 }] };
  const at = { x: 0, z: 0, rotation: Math.PI };
  const stand = { x: 0.3, z: -0.6 };
  const plain = workPlace("desk", wide, at, stand, 0.62);
  plain.place.spot(0.12);
  assert.ok(near(plain.taken!.x, 0.3), "no camera: the first place, east of the screen");
  // From the west place the screen is to the south-east, where the camera is: the sitter shows its face.
  const seen = workPlace("desk", wide, at, stand, 0.62, [], HOME_VIEW);
  const spot = seen.place.spot(0.12)!;
  assert.ok(near(seen.taken!.x, -0.3) && near(seen.taken!.z, -0.15), `${seen.taken!.x}, ${seen.taken!.z}`);
  const turned = { x: seen.place.focus[0] - spot.x, z: seen.place.focus[2] - spot.z };
  assert.ok(turned.z > 0 && Math.abs(Math.atan2(turned.x, turned.z)) < (75 * Math.PI) / 180, "still turned to the screen within reading angle");
  // A camera on the other side: the east place again.
  const other = workPlace("desk", wide, at, stand, 0.62, [], { x: -HOME_VIEW.x, z: HOME_VIEW.z });
  other.place.spot(0.12);
  assert.ok(near(other.taken!.x, 0.3));
  // The camera's side taken by a ticket: the other one. And a sitter too wide for it never gets it.
  const ticket = workPlace("desk", wide, at, stand, 0.62, [{ x: -0.3, z: -0.1, radius: 0.1 }], HOME_VIEW);
  ticket.place.spot(0.12);
  assert.ok(near(ticket.taken!.x, 0.3), "the side that is free");
  const narrow = workPlace("desk", desk, at, stand, 0.62, [], HOME_VIEW);
  narrow.place.spot(0.12);
  assert.ok(near(narrow.taken!.x, 0.3), "the only place wide enough");
});

test("a clear table: looked at along its middle line, sat on at the edge where the figure stands, or a little along it", () => {
  const stand = { x: 0.6, z: -1 };
  const { place, heading } = workPlace("meeting-table", table, { x: 0, z: 0, rotation: 0 }, stand, 0.62);
  assert.ok(near(heading, 0) && near(place.edge, 0.6));
  assert.deepEqual(place.focus.map((n) => +n.toFixed(6)), [0, 0.5, 1], "straight ahead, on the middle line");
  assert.equal(place.screen, undefined);
  const spot = place.spot(0.15)!;
  assert.ok(near(spot.x, 0) && near(spot.z, 0.75), "on the edge in front of it");
  // From the table's end it faces along the table.
  const end = workPlace("meeting-table", table, { x: 0, z: 0, rotation: 0 }, { x: 1.5, z: 0 }, 0.62);
  assert.ok(near(end.heading, -Math.PI / 2), "it looks west");
  assert.ok(near(end.place.focus[0], 0) && near(end.place.focus[2], 0.9), "at the near end of the middle line");
  // A pile in the way: the place slides along the edge.
  const pile = workPlace("planning-table", table, { x: 0, z: 0, rotation: 0 }, stand, 0.62, [{ x: 0.6, z: -0.2, radius: 0.13 }]);
  const beside = pile.place.spot(0.15)!;
  assert.ok(near(beside.z, 0.75) && Math.abs(beside.x) > 0.3, "beside the pile");
  assert.ok(Math.hypot(pile.taken!.x - 0.6, pile.taken!.z + 0.2) >= 0.28 - 1e-9);
  assert.equal(workPlace("meeting-table", { height: 0.5, half: [1, 0.1] }, { x: 0, z: 0, rotation: 0 }, stand, 0.62).place.spot(0.15), null, "a top narrower than the sitter");
});

test("the template's work places: one of every pose a style gives a top for", () => {
  const places = templateWorkPlaces({ "furniture.workdesk": desk, "furniture.meeting-table": table }, 0.62);
  assert.deepEqual(places.map((p) => p.pose), ["desk", "meeting-table"]);
  assert.ok(near(places[0]!.focus[0], -0.3), "the desk's seat is east of its screen, as in a building");
  assert.ok(places.every((p) => p.edge > 0 && p.scale === 0.62));
});

test("a desk's personal things leave the place its figure sits at", () => {
  const slot = { agentKey: "a", room: "workers" as const, definitionId: "workdesk", desk: { x: 5, z: 5 } };
  const all = deskItems([slot]);
  assert.ok(all.length >= 2);
  const first = all[0]!;
  const kept = deskItems([slot], new Map([["a", { x: first.x, z: first.z, radius: 0.2 }]]));
  assert.ok(kept.length >= 1 && kept.length < 3 + 1);
  assert.ok(kept.every((item) => Math.hypot(item.x - first.x, item.z - first.z) >= 0.3), "nothing within the sitter's radius and a thing's own width");
  assert.deepEqual(deskItems([slot], new Map([["someone-else", { x: first.x, z: first.z, radius: 0.2 }]])), all, "another desk's sitter changes nothing");
  assert.equal(deskClutter("lead-desk").length, 3, "the lead's desk also keeps its inbox tray clear");
});
