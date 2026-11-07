/* Round 22: `validateLayout` (world-engine) marks the taken cells in one byte each and reads the entrance on the way,
   where it kept a Set of "x,z" strings per call and computed the occupancy once more. Its verdicts must be the ones
   it gave: the same clone for every valid layout (every room of 72 dressed templates, both plans), and the same error,
   in the same words, for every broken one; the old road is kept here as the reference. */
import assert from "node:assert/strict";
import test from "node:test";
import { cellKey, inBounds, occupancy, propCells, validateLayout, type Definitions, type WorldLayout, type WorldProp } from "@crewhub/world-engine";
import { buildingTemplate, interiorDefinitions, type BuildingPlan } from "../src/world/buildingTemplate.ts";
import { agent, building } from "./fixtures.ts";

/** validateLayout as it was before round 22. */
function reference(value: unknown, defs: Definitions): WorldLayout {
  if (!value || typeof value !== "object") throw new Error("A layout must be an object.");
  const l = value as WorldLayout;
  if (
    l.version !== 1 ||
    !l.grid ||
    !Number.isInteger(l.grid.width) ||
    !Number.isInteger(l.grid.depth) ||
    l.grid.width < 1 ||
    l.grid.depth < 1 ||
    l.grid.width > 256 ||
    l.grid.depth > 256 ||
    !Number.isFinite(l.grid.cellSize) ||
    l.grid.cellSize < 0.1 ||
    l.grid.cellSize > 10 ||
    !Array.isArray(l.props) ||
    !l.entrance ||
    !inBounds(l.grid, l.entrance)
  )
    throw new Error("Invalid grid or layout version.");
  const ids = new Set<string>(),
    occupied = new Set<string>();
  for (const p of l.props) {
    if (!p || typeof p.id !== "string" || !p.id || ids.has(p.id) || !Object.hasOwn(defs, p.definitionId) || ![0, 1, 2, 3].includes(p.rotation) || !p.cell || !inBounds(l.grid, p.cell)) throw new Error("Invalid prop identity or definition.");
    ids.add(p.id);
    for (const c of propCells(p, defs)) {
      if (!inBounds(l.grid, c) || occupied.has(cellKey(c))) throw new Error("Props overlap or extend beyond the grid.");
      occupied.add(cellKey(c));
    }
  }
  if (occupancy(l, defs)[l.entrance.z * l.grid.width + l.entrance.x] !== -1) throw new Error("Keep the entrance open.");
  return structuredClone(l);
}

const outcome = (f: (v: unknown, d: Definitions) => WorldLayout, v: unknown, d: Definitions) => {
  try {
    return { ok: f(v, d) };
  } catch (e) {
    return { error: (e as Error).message };
  }
};

const variants = [0, 1, 3, 8].flatMap((n) => ["cr", "ops", "launch-marketing"].map((slug) => building(`${slug}${n}`, Array.from({ length: n }, (_, i) => agent(`${slug}${n}/dev-${i}`, "workers")), [], n % 2 ? ["meeting"] : [])));

test("every room of 24 dressed templates validates to the same clone as before (a copy, not the layout itself)", () => {
  let rooms = 0;
  for (const plan of ["classic", "three-rooms"] as BuildingPlan[])
    for (const b of variants)
      for (const room of buildingTemplate(b, plan).rooms) {
        const a = validateLayout(room.layout, interiorDefinitions);
        const e = reference(room.layout, interiorDefinitions);
        assert.deepEqual(a, e, `${plan} ${b.slug} ${room.kind}`);
        assert.notEqual(a, room.layout);
        assert.notEqual(a.props, room.layout.props);
        rooms++;
      }
  assert.ok(rooms >= 100, `${rooms} rooms`);
});

const defs: Definitions = {
  block: { id: "block", label: "Block", footprint: { width: 1, depth: 1 }, blocksMovement: true, tags: [], approaches: [] },
  desk: { id: "desk", label: "Desk", footprint: { width: 3, depth: 2 }, blocksMovement: true, tags: [], approaches: [{ x: 1, z: 2 }] },
  rug: { id: "rug", label: "Rug", footprint: { width: 2, depth: 2 }, blocksMovement: false, tags: [], approaches: [] },
};
const prop = (id: string, definitionId: string, x: number, z: number, rotation = 0): WorldProp => ({ id, definitionId, cell: { x, z }, rotation: rotation as 0 });
const room = (props: WorldProp[], width = 8, depth = 8, entrance = { x: 0, z: 7 }): WorldLayout => ({ version: 1, grid: { width, depth, cellSize: 1 }, props, entrance });

test("every broken layout fails the same way as before, in the same words; a rug on the entrance passes as before", () => {
  const cases: unknown[] = [
    null,
    "layout",
    {},
    { ...room([]), version: 2 },
    { ...room([]), grid: { width: 257, depth: 8, cellSize: 1 } },
    { ...room([]), grid: { width: 8, depth: 0, cellSize: 1 } },
    { ...room([]), grid: { width: 8, depth: 8, cellSize: NaN } },
    { ...room([]), entrance: { x: 8, z: 0 } },
    { ...room([]), props: "none" },
    room([prop("a", "block", 2, 2), prop("b", "block", 2, 2)]),
    room([prop("a", "block", 2, 2), prop("a", "block", 3, 2)]),
    room([prop("a", "block", -1, 0)]),
    room([prop("a", "block", 7, 7)]),
    room([prop("a", "desk", 6, 0)]),
    room([prop("a", "desk", 0, 7)]),
    room([prop("a", "desk", 6, 6, 1)]),
    room([prop("a", "desk", 0, 0, 4)]),
    room([prop("a", "toString", 0, 0)]),
    room([{ ...prop("a", "block", 0, 0), id: "" }]),
    room([{ ...prop("a", "block", 0, 0), cell: null as unknown as { x: number; z: number } }]),
    room([null as unknown as WorldProp]),
    room([prop("a", "block", 0, 7)]),
    room([prop("a", "desk", 0, 6)]),
    room([prop("a", "rug", 0, 6)]),
    room([prop("a", "rug", 0, 6), prop("b", "block", 0, 7)]),
    room([prop("a", "rug", 0, 6), prop("b", "block", 1, 6)]),
    room([prop("a", "block", 2, 2), prop("b", "desk", 1, 1)]),
    room([prop("a", "block", 2, 2), prop("b", "block", 9, 9), prop("c", "block", 2, 2)]),
    room([prop("a", "block", 0, 7), prop("b", "block", 0, 7)]),
    room([prop("a", "desk", 0, 0, 1), prop("b", "desk", 2, 0, 3)], 5, 5, { x: 4, z: 4 }),
    room([prop("a", "desk", 0, 0, 2), prop("b", "rug", 3, 3)], 6, 6, { x: 5, z: 5 }),
  ];
  let errors = 0, fine = 0;
  for (const [i, value] of cases.entries()) {
    const a = outcome(validateLayout, value, defs), e = outcome(reference, value, defs);
    assert.deepEqual(a, e, `case ${i}: ${JSON.stringify(value)?.slice(0, 120)}`);
    if ("error" in a) errors++;
    else fine++;
  }
  assert.ok(errors >= 20 && fine >= 4, `${errors} errors, ${fine} fine`);
});
