/* Round 34: the town document under fuzz. A town document comes from outside: a file a person imports, the body a
   browser PUTs to the host, a row of world.db, a stored revision of IndexedDB. `validateTownDocument` is the one gate
   (the host and the browsers run the same code), `importTownDocument` the file road, `restoreHistory` the stored
   revisions' road. Seeded (the seeds are below), a few thousand inputs: broken copies of a whole document, boundary
   values on every limit, JSON texts with duplicate and prototype keys. What a caller sees: never a throw, an `ok`
   value that keeps every limit and carries no prototype key, errors with a path and a message, and `Object.prototype`
   as it was. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { HISTORY_LIMIT, restoreHistory } from "../src/history.ts";
import { TOWN_FORMAT, TOWN_LIMITS, importTownDocument, validateTownDocument, type TownContext, type TownDocument } from "../src/townDocument.ts";
import { Fuzz, ODD_NUMBERS, ODD_STRINGS, PROTO_KEYS, protoSnapshot, replay } from "../../world-engine/test/fuzz.ts";

const SEEDS = [34_001, 34_002, 34_003];
const CONTEXT: TownContext = { knownStyles: ["greenhouse", "paper"], builtinIds: ["builtin:desk", "builtin:fern"] };
const UUID = (n: number) => `6f1c0d3e-2b4a-4c6d-8e9f-${String(n).padStart(12, "0")}`;
const PROP = {
  format: "crewhub-prop/1",
  id: "user:fuzz-lamp",
  name: "Fuzz lamp",
  description: "A lamp.",
  category: "light",
  tags: ["lamp"],
  footprint: { width: 1, depth: 1 },
  blocksMovement: false,
  approaches: [{ x: 0, z: -1 }],
  parts: [{ shape: "box", size: [0.3, 0.3, 0.3], position: [0, 0.15, 0], material: "timber" }],
  provenance: { kind: "local" },
};
/** A whole document that uses every key the format has. */
const BASE = {
  format: TOWN_FORMAT,
  revision: 3,
  styleId: "greenhouse",
  castId: "robots",
  styleOptions: { season: "summer" },
  plots: [
    { slug: "crewhub", cell: { x: 2, z: 3 }, zoneId: "zone-1", styleId: "paper", styleOptions: { season: "autumn" }, castId: "robots" },
    { slug: "atlas", cell: { x: 5, z: 1 } },
  ],
  zones: [
    { id: "zone-1", name: "Zone 1", order: 0, color: "coral", emblem: "home", look: { styleId: "greenhouse", styleOptions: { planting: "dense" }, castId: "robots" } },
    { id: "group:ops", name: null, order: 1.5, color: null, emblem: null },
  ],
  assignments: { atlas: "zone-1" },
  districts: [
    { zoneId: "zone-1", slot: { x: 0, z: 0 } },
    { zoneId: "group:ops", slot: { x: -1, z: 2 } },
  ],
  placements: [
    { id: UUID(1), propId: "builtin:desk", at: { building: "crewhub", room: "lobby" }, cell: { x: 1, z: 1 }, rotation: 1, attachment: { kind: "agent", ref: "cr-dev-1" } },
    { id: UUID(2), propId: "user:fuzz-lamp", at: { town: true }, cell: { x: 0, z: 0 }, rotation: 0 },
    { id: UUID(3), propId: "builtin:fern", at: { building: "atlas", room: "storage" }, cell: { x: 3, z: 2 }, rotation: 3, attachment: { kind: "ticket", ref: "AT-12" } },
  ],
  userProps: [PROP],
  rules: { "milestone-banner": true, "release-crate": false, "deploy-sticker": true, "bug-jar": true, "release-trophy": false },
};

/**
 * No own `__proto__` key anywhere in a value the validator let through (the one name an assignment would turn into the
 * prototype). In the two maps whose names a person spells (`styleOptions`, `assignments`) a name such as `constructor`
 * is a legal option name or project slug and stays an own key with a string under it: harmless, read by `Object.keys`.
 */
function protoKeysIn(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => protoKeysIn(v, `${path}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.keys(value as object).flatMap((key) => [...(key === "__proto__" ? [`${path}.${key}`] : []), ...protoKeysIn((value as Record<string, unknown>)[key], `${path}.${key}`)]);
}

/** What an accepted document must keep: the limits, the format, whole numbers where the grid needs them. */
function assertWithinLimits(doc: TownDocument, where: string): void {
  assert.equal(doc.format, TOWN_FORMAT, where);
  assert.ok(Number.isSafeInteger(doc.revision) && doc.revision >= 0, `${where}: revision ${doc.revision}`);
  assert.ok(doc.plots.length <= TOWN_LIMITS.plotsMax, where);
  assert.ok(doc.placements.length <= TOWN_LIMITS.placementsMax, where);
  assert.ok(doc.userProps.length <= TOWN_LIMITS.userPropsMax, where);
  assert.ok((doc.zones?.length ?? 0) <= TOWN_LIMITS.zonesMax, where);
  assert.ok((doc.districts?.length ?? 0) <= TOWN_LIMITS.districtsMax, where);
  assert.ok(Object.keys(doc.assignments ?? {}).length <= TOWN_LIMITS.plotsMax, where);
  for (const cell of [...doc.plots.map((p) => p.cell), ...doc.placements.map((p) => p.cell)])
    for (const n of [cell.x, cell.z]) assert.ok(Number.isInteger(n) && n >= 0 && n <= TOWN_LIMITS.cellMax, `${where}: cell ${n}`);
  for (const d of doc.districts ?? []) for (const n of [d.slot.x, d.slot.z]) assert.ok(Number.isInteger(n) && Math.abs(n) <= TOWN_LIMITS.slotMax, `${where}: slot ${n}`);
  for (const p of doc.placements) assert.ok([0, 1, 2, 3].includes(p.rotation), `${where}: rotation ${p.rotation}`);
  assert.deepEqual(protoKeysIn(doc), [], `${where}: a prototype key got through`);
  const slugs = doc.plots.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length, `${where}: duplicate plot`);
}

test("round 34 fuzz: broken copies of a whole town document never throw; what passes keeps every limit and no prototype key", () => {
  const before = protoSnapshot();
  assert.ok(validateTownDocument(BASE, CONTEXT).ok, "the base document is valid");
  let accepted = 0,
    refused = 0;
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 1000; i += 1) {
      const input = f.mutate(BASE, f.int(1, 4));
      let result;
      try {
        result = validateTownDocument(input, CONTEXT);
      } catch (error) {
        assert.fail(`${replay(seed, i, input)} threw ${String(error)}`);
      }
      if (result.ok) {
        accepted += 1;
        assertWithinLimits(result.value, replay(seed, i));
        assert.ok(validateTownDocument(result.value, CONTEXT).ok, `${replay(seed, i)}: the accepted value validates again`);
        assert.notEqual(result.value, input, `${replay(seed, i)}: the value is a copy`);
      } else {
        refused += 1;
        assert.ok(result.errors.length > 0, replay(seed, i));
        for (const issue of result.errors) assert.ok(typeof issue.path === "string" && issue.path !== "" && typeof issue.message === "string" && issue.message !== "", replay(seed, i, issue));
      }
    }
  }
  assert.ok(accepted > 20 && refused > 2000, `the mix: ${accepted} accepted, ${refused} refused`);
  assert.equal(protoSnapshot(), before, "Object.prototype is as it was");
});

test("round 34 fuzz: every limit holds at its edge and refuses one past it, odd numbers and strings included", () => {
  const doc = (patch: Record<string, unknown>) => validateTownDocument({ ...BASE, ...patch }, CONTEXT);
  const plot = (i: number) => ({ slug: `p${i}`, cell: { x: i % 128, z: Math.floor(i / 128) } });
  assert.ok(doc({ plots: Array.from({ length: TOWN_LIMITS.plotsMax }, (_, i) => plot(i)) }).ok);
  assert.ok(!doc({ plots: Array.from({ length: TOWN_LIMITS.plotsMax + 1 }, (_, i) => plot(i)) }).ok);
  const zone = (i: number) => ({ id: `z${i}` });
  assert.ok(doc({ zones: Array.from({ length: TOWN_LIMITS.zonesMax }, (_, i) => zone(i)) }).ok);
  assert.ok(!doc({ zones: Array.from({ length: TOWN_LIMITS.zonesMax + 1 }, (_, i) => zone(i)) }).ok);
  const district = (i: number) => ({ zoneId: `z${i}`, slot: { x: (i % 17) - 8, z: Math.floor(i / 17) - 8 } });
  assert.ok(doc({ districts: Array.from({ length: TOWN_LIMITS.districtsMax }, (_, i) => district(i)) }).ok);
  assert.ok(!doc({ districts: Array.from({ length: TOWN_LIMITS.districtsMax + 1 }, (_, i) => district(i)) }).ok);
  const placement = (i: number) => ({ id: UUID(i), propId: "builtin:desk", at: { town: true }, cell: { x: i % 128, z: Math.floor(i / 128) }, rotation: 0 });
  assert.ok(doc({ placements: Array.from({ length: TOWN_LIMITS.placementsMax }, (_, i) => placement(i)) }).ok);
  assert.ok(!doc({ placements: Array.from({ length: TOWN_LIMITS.placementsMax + 1 }, (_, i) => placement(i)) }).ok);
  const prop = (i: number) => ({ ...PROP, id: `user:lamp-${i}` });
  assert.ok(doc({ placements: [], userProps: Array.from({ length: TOWN_LIMITS.userPropsMax }, (_, i) => prop(i)) }).ok);
  assert.ok(!doc({ placements: [], userProps: Array.from({ length: TOWN_LIMITS.userPropsMax + 1 }, (_, i) => prop(i)) }).ok);
  const assignments = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`a${i}`, "zone-1"]));
  assert.ok(doc({ assignments: assignments(TOWN_LIMITS.plotsMax) }).ok);
  assert.ok(!doc({ assignments: assignments(TOWN_LIMITS.plotsMax + 1) }).ok);
  // The grid's edges, with every odd number: only whole numbers from 0 to cellMax (slots: -slotMax to slotMax) pass.
  for (const n of [...ODD_NUMBERS, TOWN_LIMITS.cellMax, TOWN_LIMITS.cellMax + 1, TOWN_LIMITS.slotMax, TOWN_LIMITS.slotMax + 1, -TOWN_LIMITS.slotMax, -TOWN_LIMITS.slotMax - 1]) {
    const cellOk = Number.isInteger(n) && n >= 0 && n <= TOWN_LIMITS.cellMax;
    assert.equal(doc({ plots: [{ slug: "one", cell: { x: n, z: 0 } }] }).ok, cellOk, `cell x ${n}`);
    assert.equal(doc({ placements: [{ ...placement(9), cell: { x: 0, z: n } }] }).ok, cellOk, `placement cell z ${n}`);
    const slotOk = Number.isInteger(n) && Math.abs(n) <= TOWN_LIMITS.slotMax;
    assert.equal(doc({ districts: [{ zoneId: "zone-1", slot: { x: n, z: 0 } }] }).ok, slotOk, `slot x ${n}`);
    assert.equal(doc({ revision: n }).ok, Number.isSafeInteger(n) && n >= 0, `revision ${n}`);
    assert.equal(doc({ placements: [{ ...placement(9), rotation: n }] }).ok, [0, 1, 2, 3].includes(n), `rotation ${n}`);
    assert.equal(doc({ zones: [{ id: "z", order: n }] }).ok, typeof n === "number" && Number.isFinite(n), `order ${n}`);
  }
  // Names, ids and refs: the odd strings, each judged by its own rule and never thrown on.
  for (const s of ODD_STRINGS) {
    assert.equal(doc({ zones: [{ id: "z", name: s }] }).ok, s.trim() !== "" && s.length <= 128, `zone name ${JSON.stringify(s.slice(0, 20))}`);
    assert.equal(doc({ zones: [{ id: s }] }).ok, /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(s), `zone id ${JSON.stringify(s.slice(0, 20))}`);
    assert.equal(doc({ plots: [{ slug: s, cell: { x: 0, z: 0 } }] }).ok, /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s), `slug ${JSON.stringify(s.slice(0, 20))}`);
    assert.equal(doc({ placements: [{ ...placement(9), attachment: { kind: "ticket", ref: s } }] }).ok, s.trim() !== "" && s.length <= 128, `ref ${JSON.stringify(s.slice(0, 20))}`);
    assert.equal(doc({ styleOptions: { [s]: "x" } }).ok, /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 128, `option name ${JSON.stringify(s.slice(0, 20))}`);
    assert.equal(doc({ styleId: s }).ok, false, `style ${JSON.stringify(s.slice(0, 20))}`);
    assert.equal(doc({ format: s }).ok, false);
    assert.equal(doc({ assignments: { [s]: "zone-1" } }).ok, /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s), `assignment key ${JSON.stringify(s.slice(0, 20))}`);
  }
  // A prototype key as an own key is an unknown key, at every level; it never reaches the prototype.
  const before = protoSnapshot();
  for (const key of PROTO_KEYS) {
    assert.ok(!validateTownDocument(JSON.parse(`{"${key}":{"polluted":1},${JSON.stringify(BASE).slice(1)}`), CONTEXT).ok, key);
    assert.ok(!doc({ rules: JSON.parse(`{"${key}":true,${JSON.stringify(BASE.rules).slice(1)}`) }).ok, `rules.${key}`);
    assert.ok(!doc({ plots: [JSON.parse(`{"${key}":1,"slug":"one","cell":{"x":0,"z":0}}`)] }).ok, `plot.${key}`);
    // The two maps a person names: a prototype name that spells like an option or a slug is an own key with a string
    // under it (allowed by the pattern, harmless); `__proto__` and the rest never pass the pattern.
    const spellsLikeASlug = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(key);
    assert.equal(doc({ styleOptions: JSON.parse(`{"${key}":"x"}`) }).ok, spellsLikeASlug, `styleOptions.${key}`);
    assert.equal(doc({ assignments: JSON.parse(`{"${key}":"zone-1"}`) }).ok, spellsLikeASlug, `assignments.${key}`);
  }
  assert.equal(protoSnapshot(), before);
  // Not an object at all.
  for (const v of [null, undefined, 1, "x", [], [BASE], true, () => BASE]) assert.ok(!validateTownDocument(v, CONTEXT).ok, String(v));
});

test("round 34 fuzz: the import road takes any text: not JSON, duplicate keys, prototype keys, a cut text, never a throw, and the current town stays", () => {
  const before = protoSnapshot();
  const current = validateTownDocument(BASE, CONTEXT);
  assert.ok(current.ok);
  let imported = 0;
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 400; i += 1) {
      const text = f.jsonText(f.bool(0.5) ? BASE : f.mutate(BASE, f.int(1, 3)));
      let result;
      try {
        result = importTownDocument(text, current.value, CONTEXT);
      } catch (error) {
        assert.fail(`${replay(seed, i, text)} threw ${String(error)}`);
      }
      if (result.ok) {
        imported += 1;
        assert.equal(result.doc.revision, current.value.revision + 1, replay(seed, i));
        assertWithinLimits(result.doc, replay(seed, i));
      } else {
        assert.equal(result.doc, current.value, `${replay(seed, i)}: the current town untouched`);
        assert.match(result.error, /^The (file is not JSON|town file is invalid): ./, replay(seed, i, result.error));
      }
    }
  }
  assert.ok(imported > 100, `some whole texts import: ${imported}`);
  // A key written twice: the last value counts, as JSON.parse reads it, and the document is judged on that value.
  const twice = JSON.stringify(BASE).replace('"revision":3', '"revision":3,"revision":-1');
  assert.match(importTownDocument(twice, current.value, CONTEXT).ok ? "" : "invalid revision", /invalid revision/);
  assert.equal(protoSnapshot(), before);
});

test("round 34 fuzz: stored revisions in any order, with duplicates, gaps and a head that is not there, rebuild a history of at most 50 in strict order, or none", () => {
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 200; i += 1) {
      const docs = Array.from({ length: f.int(0, 80) }, () => ({ ...BASE, revision: f.int(0, 70) }) as unknown as TownDocument);
      const head = f.bool(0.3) ? null : f.int(-5, 80);
      const history = restoreHistory(docs, head);
      if (docs.length === 0) {
        assert.equal(history, null, replay(seed, i));
        continue;
      }
      assert.ok(history !== null, replay(seed, i));
      assert.ok(history.entries.length >= 1 && history.entries.length <= HISTORY_LIMIT, replay(seed, i));
      for (let k = 1; k < history.entries.length; k += 1) assert.ok(history.entries[k]!.revision > history.entries[k - 1]!.revision, `${replay(seed, i)}: strictly increasing`);
      assert.ok(history.index >= 0 && history.index < history.entries.length, replay(seed, i));
      const expected = history.entries.findIndex((d) => d.revision === head);
      assert.equal(history.index, expected === -1 ? history.entries.length - 1 : expected, replay(seed, i));
    }
    // Odd revision numbers (a corrupt store, before the caller's validation): no throw.
    for (let i = 0; i < 100; i += 1) {
      const docs = Array.from({ length: f.int(1, 10) }, () => ({ ...BASE, revision: f.number() }) as unknown as TownDocument);
      const history = restoreHistory(docs, f.bool() ? null : f.number());
      assert.ok(history === null || (history.index >= 0 && history.index < history.entries.length), replay(seed, i));
    }
  }
});
