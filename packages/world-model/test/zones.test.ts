import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectGroup } from "@crewhub/loops-client";
import { emptyMemory } from "../src/memory.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { DEFAULT_ZONE_ID, resolveZones, zoneById, zoningOf } from "../src/zones.ts";
import type { TownZoning } from "../src/zones.ts";
import { FakeSource, ManualScheduler, T0, project, snapshot } from "./helpers.ts";

const group = (id: string, order: number, extra: Partial<ProjectGroup> = {}): ProjectGroup => ({
  id,
  slug: id,
  name: id.toUpperCase(),
  order,
  color: null,
  icon: null,
  ...extra,
});

test("without any grouping there is one unnamed default zone and every building is in it", () => {
  const { zones, zoneOf, reasonOf } = resolveZones([{ slug: "cr" }, { slug: "ops", groupId: null }]);
  assert.deepEqual(zones, [{ id: DEFAULT_ZONE_ID, name: null, order: 0, color: null, emblem: null, look: {}, source: "default" }]);
  assert.deepEqual(zoneOf, { cr: DEFAULT_ZONE_ID, ops: DEFAULT_ZONE_ID });
  assert.deepEqual(reasonOf, { cr: "default", ops: "default" });
  assert.equal(resolveZones([]).zones.length, 1, "an empty town still has its one zone");
});

test("the order is: manual assignment, then the source's group, then the default zone", () => {
  const groups = [group("studio", 1), group("clients", 0, { color: "mist", icon: "users" })];
  const town: TownZoning = {
    zones: [{ id: "garden", name: "Garden", order: 5, color: "circle", emblem: "spark", look: { castId: "sprouts" } }],
    assignments: { web: "garden", api: "clients" },
  };
  const { zones, zoneOf, reasonOf } = resolveZones(
    [
      { slug: "web", groupId: "studio" }, // assigned by hand: the assignment wins over its group
      { slug: "api", groupId: "studio" }, // assigned by hand to another group's zone
      { slug: "app", groupId: "studio" },
      { slug: "lab" },
    ],
    groups,
    town,
  );
  assert.deepEqual(zoneOf, { web: "garden", api: "clients", app: "studio", lab: DEFAULT_ZONE_ID });
  assert.deepEqual(reasonOf, { web: "assignment", api: "assignment", app: "group", lab: "default" });
  assert.deepEqual(
    zones.map((z) => [z.id, z.source, z.order]),
    [
      ["clients", "group", 0],
      ["studio", "group", 1],
      ["garden", "town", 5],
      [DEFAULT_ZONE_ID, "default", 6],
    ],
  );
  assert.deepEqual(zoneById(zones, "clients"), {
    id: "clients",
    name: "CLIENTS",
    order: 0,
    color: "mist",
    emblem: "users",
    look: {},
    source: "group",
  });
  assert.deepEqual(zoneById(zones, "garden").look, { castId: "sprouts" });
});

test("an assignment or a groupId that names nothing falls through; nothing is left without a zone", () => {
  const { zoneOf, reasonOf, zones } = resolveZones(
    [
      { slug: "a", groupId: "gone" },
      { slug: "b", groupId: "studio" },
      { slug: "c", groupId: "studio" },
    ],
    [group("studio", 0)],
    { assignments: { b: "deleted-zone", c: DEFAULT_ZONE_ID } },
  );
  assert.deepEqual(zoneOf, { a: DEFAULT_ZONE_ID, b: "studio", c: DEFAULT_ZONE_ID });
  assert.deepEqual(reasonOf, { a: "default", b: "group", c: "assignment" });
  assert.deepEqual(zones.map((z) => z.id), ["studio", DEFAULT_ZONE_ID]);
});

test("the default zone is not listed when every building has another zone and nobody dressed it", () => {
  const all = resolveZones([{ slug: "a", groupId: "studio" }], [group("studio", 0)]);
  assert.deepEqual(all.zones.map((z) => z.id), ["studio"]);
  const dressed = resolveZones([{ slug: "a", groupId: "studio" }], [group("studio", 3)], {
    zones: [{ id: DEFAULT_ZONE_ID, name: "Old town", order: 0, look: { styleOptions: { season: "spring" } } }],
  });
  assert.deepEqual(dressed.zones.map((z) => [z.id, z.name, z.source]), [
    [DEFAULT_ZONE_ID, "Old town", "default"],
    ["studio", "STUDIO", "group"],
  ]);
});

test("a town entry with a group's id gives the group its look; the group's name and order stay facts", () => {
  const { zones } = resolveZones([], [group("studio", 2, { color: "coral" })], {
    zones: [
      { id: "studio", name: "My own name", order: 9, color: "ink", emblem: "star", look: { styleOptions: { season: "summer" }, castId: "potlings" } },
    ],
  });
  assert.deepEqual(zones[0], {
    id: "studio",
    name: "STUDIO",
    order: 2,
    color: "coral", // the group's colour is a fact
    emblem: "star", // the group has none: the town's shows
    look: { styleOptions: { season: "summer" }, castId: "potlings" },
    source: "group",
  });
});

test("town zones without an order follow the others, in document order, and never depend on input order of groups", () => {
  const town: TownZoning = { zones: [{ id: "z-b" }, { id: "z-a", name: "  " }, { id: "z-b", name: "duplicate, ignored" }] };
  const one = resolveZones([], [group("g2", 1), group("g1", 0)], town);
  const two = resolveZones([], [group("g1", 0), group("g2", 1)], town);
  assert.deepEqual(one, two);
  assert.deepEqual(one.zones.map((z) => [z.id, z.order, z.name]), [
    ["g1", 0, "G1"],
    ["g2", 1, "G2"],
    ["z-b", 2, null],
    ["z-a", 3, null],
  ]);
});

test("the reducer gives every building its zone and the model its zones, archived buildings included", () => {
  const source = new FakeSource();
  const projection = new Projection(source, { scheduler: new ManualScheduler() });
  projection.apply({
    type: "snapshot",
    snapshot: {
      ...snapshot({
        projects: [project("cr", "CR", "cr-lead", { groupId: "studio" }), project("ops", "OPS", "ops-lead")],
        archivedProjects: [project("old", "OLD", "old-lead", { groupId: "studio", archivedAt: "2026-09-01T00:00:00Z" })],
      }),
      groups: [group("studio", 0, { color: "tangerine" })],
    },
  });
  const reduce = (zoning?: TownZoning) =>
    reduceWorld(projection.facts, emptyMemory(), { now: T0, mode: "demo", roleOverrides: {}, ...(zoning ? { zoning } : {}) }).model;

  const model = reduce();
  assert.deepEqual(model.buildings.map((b) => [b.slug, b.zoneId]), [
    ["cr", "studio"],
    ["ops", DEFAULT_ZONE_ID],
    ["old", "studio"],
  ]);
  assert.deepEqual(model.zones.map((z) => [z.id, z.color]), [
    ["studio", "tangerine"],
    [DEFAULT_ZONE_ID, null],
  ]);

  const moved = reduce({ zones: [{ id: "garden", name: "Garden" }], assignments: { ops: "garden", old: "garden" } });
  assert.deepEqual(moved.buildings.map((b) => b.zoneId), ["studio", "garden", "garden"]);
  assert.deepEqual(moved.zones.map((z) => z.id), ["studio", "garden"]);
});

test("a real source has no groups: the snapshot carries none, the read answers none, one default zone", async () => {
  const source = Object.assign(new FakeSource(), { listProjectGroups: async () => [] as ProjectGroup[] });
  const projection = new Projection(source, { scheduler: new ManualScheduler() });
  projection.apply({ type: "snapshot", snapshot: snapshot({ projects: [project("cr", "CR", "cr-lead")] }) });
  await Promise.resolve();
  assert.deepEqual(projection.facts.groups, []);
  const { model } = reduceWorld(projection.facts, emptyMemory(), { now: T0, mode: "demo", roleOverrides: {} });
  assert.deepEqual(model.zones.map((z) => z.source), ["default"]);
});

test("a source that only lists its groups (no groups in the snapshot) still reaches the facts", async () => {
  const source = Object.assign(new FakeSource(), { listProjectGroups: async () => [group("studio", 0)] });
  const projection = new Projection(source, { scheduler: new ManualScheduler() });
  let changes = 0;
  projection.onChange(() => (changes += 1));
  projection.apply({ type: "snapshot", snapshot: snapshot({ projects: [project("cr", "CR", "cr-lead", { groupId: "studio" })] }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(projection.facts.groups.map((g) => g.id), ["studio"]);
  assert.equal(changes, 2);
});

test("a town document from before zones gives an empty zoning; one with zones gives exactly those two keys", () => {
  assert.deepEqual(zoningOf({ format: "crewhub-town/1", plots: [] }), {});
  assert.deepEqual(zoningOf(null), {});
  const zones = [{ id: "garden", name: "Garden" }];
  assert.deepEqual(zoningOf({ plots: [], zones, assignments: { cr: "garden" }, districts: {} }), { zones, assignments: { cr: "garden" } });
});
