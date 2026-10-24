/* Round 21: the room dresser's placement search computes the room's occupancy once per piece (and floods without
   allocating), not once per candidate. The dressing it gives must be the one it gave before, prop for prop: this
   fixture is the dressing of 72 building templates (six slugs, six agent counts, both plans) as the round-21 base
   (f2c3000) made it. A change here that is meant to move a piece regenerates the fixture on purpose. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildingTemplate, type BuildingPlan } from "../src/world/buildingTemplate.ts";
import { agent, building } from "./fixtures.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "roomDressing-r21.json");
const variants = [0, 1, 2, 3, 5, 8].flatMap((n) =>
  ["cr", "ops", "lab", "crewhub", "inbox", "launch-marketing"].map((slug) =>
    building(
      `${slug}${n}`,
      [
        ...Array.from({ length: n }, (_, i) => agent(`${slug}${n}/dev-${i}`, "workers")),
        ...Array.from({ length: Math.min(n, 4) }, (_, i) => agent(`${slug}${n}/analyst-${i}`, "analyst")),
        ...Array.from({ length: Math.min(n, 3) }, (_, i) => agent(`${slug}${n}/design-${i}`, "design")),
      ],
      [],
      n % 2 ? ["meeting"] : [],
    ),
  ),
);

test("the dressing of 72 templates is the one the round-21 base made, prop for prop (id, definition, cell, rotation, order)", () => {
  const expected = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, { kind: string; props: unknown[] }[]>;
  let props = 0;
  for (const plan of ["classic", "three-rooms"] as BuildingPlan[])
    for (const b of variants) {
      const key = `${plan}:${b.slug}`;
      const rooms = buildingTemplate(b, plan).rooms.map((r) => ({ kind: r.kind, props: r.layout.props }));
      assert.ok(expected[key], `fixture has ${key}`);
      assert.deepEqual(JSON.parse(JSON.stringify(rooms)), expected[key], key);
      props += rooms.reduce((n, r) => n + r.props.length, 0);
    }
  assert.equal(Object.keys(expected).length, 72);
  assert.equal(props, 5802);
});
