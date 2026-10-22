import assert from "node:assert/strict";
import { test } from "node:test";
import { townChanges } from "../src/townChanges.ts";
import { emptyTownDocument, type TownDocument } from "../src/townDocument.ts";

const base = (): TownDocument => ({ ...emptyTownDocument(), zones: [{ id: "east", name: "East", order: 0, color: "coral", emblem: "home" }], assignments: { web: "east" }, plots: [{ slug: "web", cell: { x: 1, z: 1 } }, { slug: "api", cell: { x: 2, z: 1 } }], placements: [{ id: "p1", propId: "builtin:plant", at: { town: true }, cell: { x: 3, z: 3 }, rotation: 0 }] });

test("the same town changes nothing; every kind of difference gets one plain line", () => {
  assert.deepEqual(townChanges(base(), base()), []);
  const after: TownDocument = {
    ...base(),
    castId: "sprouts",
    zones: [{ id: "east", name: "Eastside", order: 0, color: "mist", emblem: "home" }, { id: "west", name: "West", order: 1 }],
    assignments: { web: "west", api: "east" },
    plots: [{ slug: "web", cell: { x: 5, z: 1 } }, { slug: "ops", cell: { x: 2, z: 2 } }],
    placements: [{ id: "p1", propId: "builtin:plant", at: { town: true }, cell: { x: 4, z: 3 }, rotation: 0 }, { id: "p2", propId: "builtin:bench", at: { town: true }, cell: { x: 6, z: 3 }, rotation: 1 }],
    userProps: [{ format: "crewhub-prop/1", id: "user:nook", name: "Reading nook", description: "", category: "rest", tags: [], footprint: { width: 1, depth: 1 }, parts: [], provenance: { kind: "local" } } as unknown as TownDocument["userProps"][number]],
    rules: { ...base().rules, "bug-jar": !base().rules["bug-jar"] },
  };
  const lines = townChanges(base(), after);
  assert.deepEqual(lines, [
    "The town's cast becomes sprouts.",
    '1 zone added: "West".',
    'Zone "East" is renamed "Eastside".',
    'Zone "Eastside" gets another mark (mist, home).',
    '2 buildings assigned: web to "West" and api to "Eastside".',
    "1 plot added: ops.",
    "1 plot removed: api (a building without a plot gets one again).",
    "1 building moves to another lot or district: web.",
    "1 prop placed: builtin:bench.",
    "1 prop moved or turned: builtin:plant.",
    "1 prop joins the catalogue: Reading nook.",
    `Rule bug-jar switched ${after.rules["bug-jar"] ? "on" : "off"}.`,
  ]);
  // The other way round: removals, and a long list is cut with "and n more".
  const back = townChanges(after, base());
  assert.ok(back.includes('1 zone removed: "West".'));
  assert.ok(back.includes("1 prop taken away: builtin:bench."));
  assert.ok(back.includes("1 prop leaves the catalogue: Reading nook."));
  const many: TownDocument = { ...base(), plots: [...base().plots, ...["a", "b", "c", "d", "e"].map((slug, i) => ({ slug, cell: { x: 10 + i, z: 9 } }))] };
  assert.ok(townChanges(base(), many).includes("5 plots added: a, b, c and 2 more."));
});
