/**
 * The placement rules through their interface (placement.ts, round 60 pk-P5): what may stand where in a layout alone,
 * what a crew adds, and the free cells in both orders. `WorldSimulation`'s placement tests (world.test.ts) and the
 * page's wrappers (apps/world/test/placements.test.ts) keep their facts over the same rules.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { type Definitions, type WorldLayout, type WorldProp, placementRules } from "../src/index.ts";

const definitions: Definitions = {
  block: { id: "block", label: "Block", footprint: { width: 1, depth: 1 }, blocksMovement: true, tags: [], approaches: [] },
  desk: { id: "desk", label: "Desk", footprint: { width: 3, depth: 2 }, blocksMovement: true, tags: ["work"], approaches: [{ x: 1, z: 2 }] },
  marker: { id: "marker", label: "Marker", footprint: { width: 1, depth: 1 }, blocksMovement: false, tags: [], approaches: [{ x: 0, z: 0 }] },
};
const prop = (id: string, definitionId: string, x: number, z: number, rotation: WorldProp["rotation"] = 0): WorldProp => ({ id, definitionId, cell: { x, z }, rotation });
const block = (id: string, x: number, z: number) => prop(id, "block", x, z);
const room = (props: WorldProp[] = [], width = 8, depth = 8): WorldLayout => ({ version: 1, grid: { width, depth, cellSize: 0.6 }, entrance: { x: 0, z: depth - 1 }, props });
const reason = (p: { ok: boolean; reason?: string }) => (p.ok ? "ok" : p.reason);

test("check: the reasons in their order; a prop replaces the one with its id", () => {
  const rules = placementRules(room([block("wall", 5, 0), prop("desk", "desk", 2, 1)]), definitions);
  assert.equal(reason(rules.check(prop("x", "nothing", 5, 5))), "Invalid prop identity or definition.");
  assert.equal(reason(rules.check(block("x", 5, 0))), "Props overlap or extend beyond the grid.");
  assert.equal(reason(rules.check(block("x", 7, 7))), "ok", "the far corner holds a 1x1");
  assert.equal(reason(rules.check(prop("x", "desk", 6, 6))), "Props overlap or extend beyond the grid.", "a 3x2 anchored there runs past the grid");
  assert.equal(reason(rules.check(block("x", 8, 0))), "Invalid prop identity or definition.", "the anchor itself out of bounds");
  assert.equal(reason(rules.check(block("x", 0, 7))), "Keep the entrance open.");
  assert.equal(reason(rules.check(block("x", 5, 5), { reserved: new Set(["5,5"]), standing: [] })), "A crew member is using that cell.");
  assert.equal(reason(rules.check(block("x", 5, 5), { reserved: new Set(), standing: [{ x: 7, z: 0 }] })), "ok", "a crew member standing somewhere still reachable");
  // The desk's approach is (3, 3): a block on it leaves the desk no reachable interaction cell.
  assert.equal(reason(rules.check(block("x", 3, 3))), "Keep workstation interaction cells reachable.");
  assert.equal(reason(rules.check(block("x", 5, 5))), "ok");
  assert.equal(reason(rules.check(block("wall", 6, 6))), "ok", "moving the wall: checked against everything but itself");
  assert.equal(reason(rules.check(prop("desk", "desk", 2, 1))), "ok", "the desk put back where it is overlaps nothing");
});

test("check: a crew member cut off from the entrance is refused before the approaches are looked at", () => {
  const rules = placementRules(room([block("top", 1, 0), block("bottom", 1, 2), block("left", 0, 1)]), definitions);
  assert.equal(reason(rules.check(block("trap", 2, 1), { reserved: new Set(), standing: [{ x: 1, z: 1 }] })), "Keep a path from every crew member to the entrance.");
  assert.equal(reason(rules.check(block("trap", 2, 1))), "ok", "no crew: the pocket may close");
});

test("the rules stand on a validated, detached copy; an invalid layout throws as validateLayout does", () => {
  const layout = room([block("a", 2, 2)]);
  const rules = placementRules(layout, definitions);
  assert.notEqual(rules.layout, layout);
  assert.deepEqual(rules.layout, layout);
  assert.throws(() => placementRules(room([block("door", 0, 7)]), definitions), /Keep the entrance open/);
  assert.throws(() => placementRules(room([block("a", 2, 2), block("b", 2, 2)]), definitions), /overlap/);
});

test("freeCells: row by row from the origin or from the far corner back, the overlaps and the unreachable left out, an unknown prop nowhere", () => {
  // A 3 by 3 room, the entrance at (0, 2), the middle column walled: the right column is out of reach.
  const rules = placementRules(room([block("a", 1, 0), block("b", 1, 1), block("c", 1, 2)], 3, 3), definitions);
  assert.deepEqual([...rules.freeCells("marker")], [{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 2 }], "a marker's approach is itself: reachable cells only, the entrance too (it blocks nothing)");
  assert.deepEqual([...rules.freeCells("marker", 0, "end")], [{ x: 0, z: 2 }, { x: 0, z: 1 }, { x: 0, z: 0 }]);
  assert.deepEqual([...rules.freeCells("block")], [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }], "a block has no approach: anywhere it overlaps nothing and is not the entrance, the cut-off column too");
  assert.deepEqual([...rules.freeCells("nothing")], []);
  const open = placementRules(room([], 4, 4), definitions);
  const flat = [...open.freeCells("desk", 0)];
  const turned = [...open.freeCells("desk", 1)];
  assert.ok(flat.length > 0 && turned.length > 0 && JSON.stringify(flat) !== JSON.stringify(turned), "a quarter turn swaps the footprint");
  for (const [rotation, cells] of [[0, flat], [1, turned]] as const) for (const cell of cells) assert.equal(reason(open.check({ id: "p", definitionId: "desk", cell, rotation })), "ok");
  // Lazy: the first cell costs one row of checks, not the grid's.
  const first = open.freeCells("block")[Symbol.iterator]().next();
  assert.deepEqual(first, { value: { x: 0, z: 0 }, done: false });
});
