import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { occupancy, propCells, validateLayout } from "@crewhub/world-engine";
import type { Definitions, PropModel } from "@crewhub/world-engine";
import { builtinIds, createCatalogue, findFreeCell, siteLayout } from "../src/catalogue.ts";
import { describeTownDocument } from "../src/describeTown.ts";
import {
  applyEdit,
  emptyTownDocument,
  exportTownDocument,
  importTownDocument,
  validateTownDocument,
} from "../src/townDocument.ts";
import type { PlacedProp, TownContext, TownDocument, TownEdit } from "../src/townDocument.ts";

const example = (slug: string): PropModel =>
  JSON.parse(readFileSync(new URL(`../../../skills/prop-builder/references/examples/${slug}.json`, import.meta.url), "utf8"));

const BUILTINS: Definitions = {
  desk: { id: "desk", label: "Workstation", footprint: { width: 3, depth: 2 }, blocksMovement: true, tags: ["work"], approaches: [{ x: 1, z: 2 }] },
  plant: { id: "plant", label: "Bird of paradise", footprint: { width: 1, depth: 1 }, blocksMovement: true, tags: ["decoration", "greenery"], approaches: [] },
};
const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: builtinIds(BUILTINS) };

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const placement = (n: number, propId: string, extra: Partial<PlacedProp> = {}): PlacedProp => ({
  id: uuid(n),
  propId,
  at: { building: "crewhub", room: "lobby" },
  cell: { x: 1, z: 1 },
  rotation: 0,
  ...extra,
});

function edit(doc: TownDocument, e: TownEdit): TownDocument {
  const result = applyEdit(doc, e, CONTEXT);
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.doc;
}

/** A town with a local lamp, a ticket workbench, three placements, a plot and a rule off. */
function builtTown(): TownDocument {
  let doc = emptyTownDocument();
  doc = edit(doc, { type: "add-user-prop", prop: { ...example("floor-lamp"), provenance: { kind: "local" } } });
  doc = edit(doc, { type: "add-user-prop", prop: { ...example("workbench-with-lamp"), provenance: { kind: "ticket", ticketKey: "CR-41" } } });
  doc = edit(doc, { type: "place", placement: placement(1, "builtin:desk") });
  doc = edit(doc, { type: "place", placement: placement(2, "user:floor-lamp", { cell: { x: 5, z: 1 }, rotation: 2 }) });
  doc = edit(doc, {
    type: "place",
    placement: placement(3, "user:workbench-with-lamp", { at: { town: true }, attachment: { kind: "project", ref: "crewhub" } }),
  });
  doc = edit(doc, { type: "set-plot", slug: "crewhub", cell: { x: 2, z: 3 } });
  return edit(doc, { type: "set-rule", rule: "bug-jar", on: false });
}

test("a document survives export and import unchanged, as the next revision", () => {
  const doc = builtTown();
  assert.equal(doc.revision, 7);
  const current = { ...emptyTownDocument(), revision: 12 };
  const imported = importTownDocument(exportTownDocument(doc), current, CONTEXT);
  assert.ok(imported.ok);
  assert.deepEqual(imported.doc, { ...doc, revision: 13 });
  const validated = validateTownDocument(JSON.parse(exportTownDocument(doc)), CONTEXT);
  assert.ok(validated.ok);
  assert.deepEqual(validated.value, doc);
});

test("an invalid import returns the error and leaves the current document untouched", () => {
  const current = builtTown();
  const before = structuredClone(current);
  const broken = JSON.parse(exportTownDocument(current));
  broken.userProps[1].parts[1].size[0] = 9;
  const cases: [string, RegExp][] = [
    ["{ not json", /^The file is not JSON/],
    [JSON.stringify(broken), /^The town file is invalid: userProps\[1\]\.parts\[1\]\.size\[0\]: must be between/],
    [JSON.stringify({ ...current, styleId: "neon" }), /styleId: unknown style "neon"/],
  ];
  for (const [json, error] of cases) {
    const result = importTownDocument(json, current, CONTEXT);
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, error);
    assert.equal(result.doc, current);
  }
  assert.deepEqual(current, before);
});

test("validation is strict and names the exact path", () => {
  const doc = JSON.parse(exportTownDocument(builtTown()));
  const errorsOf = (mutate: (d: Record<string, any>) => void) => {
    const copy = structuredClone(doc);
    mutate(copy);
    const result = validateTownDocument(copy, CONTEXT);
    return result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`);
  };
  assert.match(errorsOf((d) => (d.theme = "dark")).join(), /^theme: unknown key/);
  assert.match(errorsOf((d) => (d.placements[0].colour = "red")).join(), /^placements\[0\]\.colour: unknown key/);
  assert.match(errorsOf((d) => (d.placements[0].at.floor = 2)).join(), /^placements\[0\]\.at\.floor: unknown key/);
  assert.match(errorsOf((d) => (d.userProps[0].glow = true)).join(), /^userProps\[0\]\.glow: unknown key/);
  assert.match(errorsOf((d) => (d.rules.confetti = true)).join(), /^rules\.confetti: unknown key/);
  assert.match(errorsOf((d) => (d.plots[0].styleId = "neon")).join(), /^plots\[0\]\.styleId: unknown style "neon"/);
  assert.match(errorsOf((d) => (d.placements[1].propId = "user:sofa")).join(), /^placements\[1\]\.propId: unknown prop "user:sofa"/);
  assert.match(errorsOf((d) => (d.placements[0].propId = "builtin:throne")).join(), /unknown prop "builtin:throne"/);
  assert.match(errorsOf((d) => (d.placements[2].id = d.placements[0].id)).join(), /^placements\[2\]\.id: duplicate placement id/);
  assert.match(errorsOf((d) => d.userProps.push(d.userProps[0])).join(), /^userProps\[2\]\.id: duplicate user prop "user:floor-lamp"/);
  assert.match(errorsOf((d) => delete d.userProps[0].provenance).join(), /^userProps\[0\]\.provenance: is required/);
  assert.match(errorsOf((d) => (d.placements[0].rotation = 4)).join(), /^placements\[0\]\.rotation/);
  assert.match(errorsOf((d) => (d.placements[0].attachment = { kind: "desk", ref: "x" })).join(), /^placements\[0\]\.attachment\.kind/);
  assert.match(errorsOf((d) => delete d.rules["bug-jar"]).join(), /^rules\.bug-jar: is required/);
  assert.match(errorsOf((d) => (d.format = "crewhub-town/2")).join(), /^format: must be "crewhub-town\/1"/);
});

test("edits return a new document with revision + 1 and never mutate", () => {
  const doc = builtTown();
  const frozen = structuredClone(doc);
  const moved = edit(doc, { type: "move", id: uuid(2), cell: { x: 6, z: 2 }, at: { building: "crewhub", room: "review" } });
  const rotated = edit(moved, { type: "rotate", id: uuid(2), rotation: 1 });
  const attached = edit(rotated, { type: "attach", id: uuid(2), attachment: { kind: "agent", ref: "cr-lead" } });
  const deleted = edit(attached, { type: "delete", id: uuid(1) });
  assert.deepEqual(doc, frozen);
  assert.deepEqual([moved.revision, rotated.revision, attached.revision, deleted.revision], [8, 9, 10, 11]);
  const lamp = deleted.placements.find((p) => p.id === uuid(2));
  assert.deepEqual(lamp, {
    ...placement(2, "user:floor-lamp"),
    at: { building: "crewhub", room: "review" },
    cell: { x: 6, z: 2 },
    rotation: 1,
    attachment: { kind: "agent", ref: "cr-lead" },
  });
  assert.equal(deleted.placements.some((p) => p.id === uuid(1)), false);

  // Removing a user prop removes its placements; unknown ids and bad targets are refused with a reason.
  const removed = edit(doc, { type: "remove-user-prop", propId: "user:floor-lamp" });
  assert.deepEqual(removed.placements.map((p) => p.id), [uuid(1), uuid(3)]);
  const refuse = (e: TownEdit, reason: RegExp) => {
    const result = applyEdit(doc, e, CONTEXT);
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, reason);
  };
  refuse({ type: "place", placement: placement(9, "user:sofa") }, /unknown prop "user:sofa"/);
  refuse({ type: "place", placement: placement(1, "builtin:plant") }, /already exists/);
  refuse({ type: "move", id: uuid(9), cell: { x: 0, z: 0 } }, /No placed prop/);
  refuse({ type: "move", id: uuid(2), cell: { x: -1, z: 0 } }, /cell\.x: must be an integer/);
  refuse({ type: "set-plot", slug: "loops", cell: { x: 2, z: 3 } }, /another plot already stands on 2,3/);
  const badProp = { ...example("stool"), parts: [] } as PropModel;
  refuse({ type: "add-user-prop", prop: { ...badProp, provenance: { kind: "local" } } }, /cannot be added: parts: must have 1 to 64 parts/);
  refuse({ type: "add-user-prop", prop: example("stool") }, /provenance: is required/);
});

test("a user prop's engine definition blocks exactly its declared footprint", () => {
  // The workbench's parts include a lamp arm and overhangs; only its 3 x 2 footprint may block the grid.
  const doc = builtTown();
  const catalogue = createCatalogue(BUILTINS, doc);
  const grid = { width: 8, depth: 6, cellSize: 0.6 };
  const moved = edit(doc, {
    type: "move",
    id: uuid(3),
    at: { building: "crewhub", room: "workers" },
    cell: { x: 2, z: 1 },
  });
  const rotated = edit(moved, { type: "rotate", id: uuid(3), rotation: 1 });
  const site = { building: "crewhub", room: "workers" } as const;
  for (const [town, expected] of [
    [moved, ["2,1", "3,1", "4,1", "2,2", "3,2", "4,2"]],
    [rotated, ["2,1", "3,1", "2,2", "3,2", "2,3", "3,3"]],
  ] as const) {
    const layout = validateLayout(siteLayout(town, site, grid, { x: 0, z: 5 }), catalogue.definitions);
    const blocked = occupancy(layout, catalogue.definitions);
    const cells = [...blocked.keys()].filter((i) => blocked[i] !== -1).map((i) => `${i % grid.width},${Math.floor(i / grid.width)}`);
    assert.deepEqual(cells.sort(), [...expected].sort());
  }
  assert.deepEqual(catalogue.definitionFor("user:workbench-with-lamp")?.footprint, { width: 3, depth: 2 });
  assert.equal(catalogue.definitionFor("user:nothing"), null);

  // A free cell for another workbench avoids the first one and keeps its approach cell reachable.
  const layout = siteLayout(moved, site, grid, { x: 0, z: 5 });
  const free = findFreeCell(layout, catalogue.definitions, "user:workbench-with-lamp");
  assert.ok(free);
  const taken = new Set(propCells(layout.props[0]!, catalogue.definitions).map((c) => `${c.x},${c.z}`));
  const next = propCells({ id: "n", definitionId: "user:workbench-with-lamp", cell: free, rotation: 0 }, catalogue.definitions);
  assert.equal(next.some((c) => taken.has(`${c.x},${c.z}`)), false);
});

test("the catalogue has one registry with a Mine group and provenance", () => {
  const catalogue = createCatalogue(BUILTINS, builtTown());
  assert.deepEqual(
    catalogue.groups().map((g) => [g.label, g.entries.map((e) => e.id)]),
    [
      ["Mine", ["user:floor-lamp", "user:workbench-with-lamp"]],
      ["Work", ["builtin:desk", "user:workbench-with-lamp"]],
      ["Light", ["user:floor-lamp"]],
      ["Decoration", ["builtin:plant"]],
    ],
  );
  assert.deepEqual(catalogue.get("user:workbench-with-lamp")?.provenance, { kind: "ticket", ticketKey: "CR-41" });
  assert.equal(catalogue.get("builtin:desk")?.definition.id, "builtin:desk");
  assert.deepEqual(catalogue.get("builtin:plant")?.tags, ["greenery"]);
});

test("the text view lists placements, user props with provenance and failed requests", () => {
  const doc = builtTown();
  const text = describeTownDocument(doc, createCatalogue(BUILTINS, doc), {
    invalidRequests: [{ ticketKey: "CR-38", slug: "crewhub", error: "prop CR-38 is invalid: parts[1].position[0]: outside" }],
  }).map((l) => l.text);
  assert.ok(text.includes("Floor lamp (user:floor-lamp) in crewhub, Lobby at cell 5,1, turned half."));
  assert.ok(text.includes("Workbench with a lamp (user:workbench-with-lamp) in the town square at cell 1,1, not turned, attached to project crewhub."));
  assert.ok(text.some((t) => t.startsWith("Workbench with a lamp (user:workbench-with-lamp), work, 3 by 2 cells, from ticket CR-41, placed 1 time")));
  assert.ok(text.some((t) => t.startsWith("Floor lamp (user:floor-lamp), light, 1 by 1 cells, made locally")));
  assert.ok(text.includes("Switched off: bug-jar."));
  assert.ok(text.includes("Error object in crewhub: prop CR-38 is invalid: parts[1].position[0]: outside."));
});

test("zones, assignments and districts are additive: a document without them stays valid, with them it round-trips", () => {
  const plain = builtTown();
  assert.ok(!("zones" in plain) && !("assignments" in plain) && !("districts" in plain));
  let doc = edit(plain, { type: "set-zone", zone: { id: "studio", name: "Studio", order: 1, color: "coral", emblem: "spark", look: { styleOptions: { season: "spring" }, castId: "potlings" } } });
  doc = edit(doc, { type: "allocate", plots: [{ slug: "alpha", cell: { x: 64, z: 64 } }, { slug: "beta", cell: { x: 71, z: 63 }, zoneId: "studio" }], districts: [{ zoneId: "default", slot: { x: 0, z: 0 } }, { zoneId: "studio", slot: { x: 1, z: 0 } }] });
  doc = edit(doc, { type: "assign", slug: "beta", zoneId: "studio" });
  assert.deepEqual(doc.plots.map((p) => [p.slug, p.zoneId]), [["crewhub", undefined], ["alpha", undefined], ["beta", "studio"]]);
  const again = validateTownDocument(JSON.parse(exportTownDocument(doc)), CONTEXT);
  assert.ok(again.ok);
  assert.deepEqual(again.value, doc);

  const errorsOf = (mutate: (d: any) => void) => {
    const copy = JSON.parse(exportTownDocument(doc));
    mutate(copy);
    const result = validateTownDocument(copy, CONTEXT);
    return result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`);
  };
  assert.match(errorsOf((d) => (d.zones[0].color = "teal")).join(), /^zones\[0\]\.color: must be null or one of coral/);
  assert.match(errorsOf((d) => d.zones.push(d.zones[0])).join(), /zones\[1\]\.id: duplicate zone "studio"/);
  assert.match(errorsOf((d) => (d.zones[0].look.styleId = "neon")).join(), /zones\[0\]\.look\.styleId: unknown style/);
  assert.match(errorsOf((d) => (d.zones[0].look.styleOptions.season = 3)).join(), /zones\[0\]\.look\.styleOptions\.season/);
  assert.match(errorsOf((d) => (d.districts[1].slot.x = 9)).join(), /districts\[1\]\.slot\.x: must be an integer from -8 to 8/);
  assert.match(errorsOf((d) => (d.districts[1].slot = { x: 0, z: 0 })).join(), /another district already stands on slot 0,0/);
  assert.match(errorsOf((d) => (d.assignments["Not A Slug"] = "studio")).join(), /the key must be a project slug/);
  assert.match(errorsOf((d) => (d.plots[1].zoneId = "")).join(), /plots\[1\]\.zoneId: must be a zone id/);
});

test("the layout edits: allocate adds only, tidy re-lays in one revision, a hand move joins a zone", () => {
  let doc = edit(emptyTownDocument(), { type: "set-plot", slug: "alpha", cell: { x: 64, z: 64 }, styleId: "greenhouse", castId: "potlings" });
  const refused = applyEdit(doc, { type: "allocate", plots: [{ slug: "alpha", cell: { x: 65, z: 64 } }] }, CONTEXT);
  assert.deepEqual(refused, { ok: false, error: "alpha already has a plot." });
  const clash = applyEdit(doc, { type: "allocate", plots: [{ slug: "beta", cell: { x: 64, z: 64 } }] }, CONTEXT);
  assert.ok(!clash.ok && /another plot already stands on 64,64/.test(clash.error));
  doc = edit(doc, { type: "allocate", plots: [{ slug: "beta", cell: { x: 65, z: 64 } }], districts: [{ zoneId: "default", slot: { x: 0, z: 0 } }] });

  const before = doc.revision;
  const tidied = edit(doc, { type: "tidy", plots: [{ slug: "beta", cell: { x: 64, z: 64 } }, { slug: "alpha", cell: { x: 65, z: 64 } }], districts: [{ zoneId: "default", slot: { x: 0, z: 0 } }] });
  assert.equal(tidied.revision, before + 1, "one revision, so one undo step");
  assert.deepEqual(tidied.plots, [{ slug: "beta", cell: { x: 64, z: 64 } }, { slug: "alpha", cell: { x: 65, z: 64 }, styleId: "greenhouse", castId: "potlings" }], "a plot keeps its style and cast");

  const taken = applyEdit(tidied, { type: "move-plot", slug: "alpha", cell: { x: 64, z: 64 } }, CONTEXT);
  assert.deepEqual(taken, { ok: false, error: "beta already stands on that plot." });
  let moved = edit(tidied, { type: "move-plot", slug: "alpha", cell: { x: 66, z: 64 } });
  assert.deepEqual([moved.plots[1]?.cell, moved.plots[1]?.zoneId, moved.assignments], [{ x: 66, z: 64 }, undefined, undefined], "a move to a lot changes no zone");
  moved = edit(moved, { type: "move-plot", slug: "alpha", cell: { x: 70, z: 63 }, zoneId: "studio", districts: [{ zoneId: "studio", slot: { x: 1, z: 0 } }] });
  assert.deepEqual([moved.plots[1]?.zoneId, moved.assignments, moved.districts?.length], ["studio", { alpha: "studio" }, 2]);
  assert.equal(moved.plots[1]?.castId, "potlings");

  moved = edit(moved, { type: "set-zone", zone: { id: "studio", name: null, order: 0, color: null, emblem: null, look: {} } });
  const gone = edit(moved, { type: "remove-zone", id: "studio" });
  assert.deepEqual([gone.zones, gone.assignments, gone.plots[1]?.cell], [undefined, undefined, { x: 70, z: 63 }], "removing a zone moves nothing");
  assert.deepEqual(applyEdit(gone, { type: "assign", slug: "alpha", zoneId: null }, CONTEXT), { ok: false, error: "alpha has no manual zone." });
});
