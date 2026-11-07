/* Allocations are facts of the town, not edits: an undo or redo restores hand edits only and carries the lots given
   since forward (`carryAllocations`, applied by the town store). This covers the scale round's known gap: an undo
   past a hand move must never re-allocate a project that had no lot at that revision. */
import assert from "node:assert/strict";
import test from "node:test";
import { applyEdit, emptyTownDocument, type Plot, type TownContext, type TownDocument, type TownEdit } from "@crewhub/world-model";
import { createTownStore, type TownStore } from "../src/state/townStore.ts";
import {
  allocationEdit,
  carryAllocations,
  CENTRAL_SLOT,
  districtLots,
  lotKey,
  lotKind,
  moveEdit,
  nextFreeLot,
  settlementOf,
  slotKey,
  tidyEdit,
  type Settler,
} from "../src/world/settlement.ts";

const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: [] };
function edit(doc: TownDocument, e: TownEdit | null): TownDocument {
  assert.ok(e, "an edit");
  const result = applyEdit(doc, e, CONTEXT);
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.doc;
}
function random(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
const cellOf = (doc: TownDocument, slug: string) => {
  const plot = doc.plots.find((p) => p.slug === slug);
  assert.ok(plot, `${slug} has a plot`);
  return lotKey(plot.cell);
};
const cells = (doc: TownDocument) => Object.fromEntries(doc.plots.map((p) => [p.slug, lotKey(p.cell)]));

/** A store as the town runtime wires it: in memory, allocations carried over undo and redo. */
async function townStore(): Promise<TownStore> {
  const store = createTownStore({ context: CONTEXT, indexedDB: null, carry: carryAllocations });
  await store.load();
  return store;
}
/** What the town runtime does when the world lists its projects: the lots they lack, written into the current revision. */
const arrive = (store: TownStore, present: readonly Settler[]) =>
  store.amend((doc) => {
    const e = allocationEdit(doc, present);
    return e ? edit(doc, e) : null;
  });
const byHand = (store: TownStore, e: TownEdit | null) => store.commit(edit(store.state.doc, e));

test("the gap: an undo past a hand move keeps a later project's lot and never re-allocates", async () => {
  const store = await townStore();
  const ab: Settler[] = [{ slug: "a" }, { slug: "b" }];
  await arrive(store, ab);
  const before = cells(store.state.doc);
  const far = districtLots(CENTRAL_SLOT)[9]!;
  await byHand(store, moveEdit(store.state.doc, "a", { cell: far }));
  assert.equal(cellOf(store.state.doc, "a"), lotKey(far));
  // C arrives in another zone, in the current revision: no undo step.
  const abc: Settler[] = [...ab, { slug: "c", zoneId: "labs" }];
  await arrive(store, abc);
  const c = cellOf(store.state.doc, "c");
  const labs = store.state.doc.districts!.find((d) => d.zoneId === "labs");
  assert.ok(labs, "labs got a district");
  assert.equal(store.state.canUndo, true);

  await store.undo();
  await store.undo();
  assert.equal(store.state.canUndo, false);
  assert.deepEqual(cells(store.state.doc), { ...before, c }, "C keeps its lot, A goes back, B never moved");
  assert.deepEqual(store.state.doc.districts!.filter((d) => d.zoneId === "labs"), [labs], "C's district comes along");
  assert.equal(allocationEdit(store.state.doc, abc), null, "an undo never re-allocates");
  // Redo: A's move again, C still where it was.
  await store.redo();
  assert.deepEqual(cells(store.state.doc), { a: lotKey(far), b: before["b"]!, c });
});

test("a project that took a hand-moved building's old lot keeps it; the undone building takes its zone's next free lot", async () => {
  const store = await townStore();
  const ab: Settler[] = [{ slug: "a" }, { slug: "b" }];
  await arrive(store, ab);
  const a0 = cellOf(store.state.doc, "a");
  await byHand(store, moveEdit(store.state.doc, "a", { cell: districtLots(CENTRAL_SLOT)[9]! }));
  const abc: Settler[] = [...ab, { slug: "c" }];
  await arrive(store, abc);
  assert.equal(cellOf(store.state.doc, "c"), a0, "C gets the first free lot of the sequence: A's old one");
  await store.undo();
  assert.equal(cellOf(store.state.doc, "c"), a0, "C stays: it was not moved by hand");
  assert.equal(cellOf(store.state.doc, "b"), lotKey(districtLots(CENTRAL_SLOT)[1]!), "B stays");
  assert.equal(cellOf(store.state.doc, "a"), lotKey(districtLots(CENTRAL_SLOT)[2]!), "A goes to its zone's next free lot");
  assert.equal(allocationEdit(store.state.doc, abc), null);
  assert.equal(new Set(store.state.doc.plots.map((p) => lotKey(p.cell))).size, 3);
});

test("undoing a Tidy restores the previous plan; a project that arrived after it keeps its lot", async () => {
  const store = await townStore();
  const settlers: Settler[] = [{ slug: "a" }, { slug: "b", zoneId: "labs" }, { slug: "c" }];
  await arrive(store, settlers);
  const plan = cells(store.state.doc);
  const planDistricts = store.state.doc.districts;
  // Labs first: the tidy moves everyone, labs takes the centre.
  await byHand(store, tidyEdit(store.state.doc, settlers, ["labs"]));
  assert.notDeepEqual(cells(store.state.doc), plan);
  const withD: Settler[] = [...settlers, { slug: "d", zoneId: "labs" }];
  await arrive(store, withD);
  const d = cellOf(store.state.doc, "d");
  await store.undo();
  const back = cells(store.state.doc);
  assert.equal(back["d"], d, "D keeps its lot");
  // Everyone the previous plan placed is back there, unless D now stands on that lot.
  for (const slug of ["a", "b", "c"]) if (plan[slug] !== d) assert.equal(back[slug], plan[slug], `${slug} is back on the previous plan`);
  assert.equal(allocationEdit(store.state.doc, withD), null);
  for (const district of planDistricts!) assert.ok(store.state.doc.districts!.some((x) => slotKey(x.slot) === slotKey(district.slot) && x.zoneId === district.zoneId));
  await store.redo();
  assert.equal(cellOf(store.state.doc, "d"), d);
});

test("undoing a move to a new zone closes the district it opened, unless a later project lives there", async () => {
  const store = await townStore();
  await arrive(store, [{ slug: "a" }, { slug: "b" }]);
  await byHand(store, moveEdit(store.state.doc, "a", { zoneId: "labs" }));
  assert.ok(store.state.doc.districts!.some((d) => d.zoneId === "labs"));
  await store.undo();
  assert.equal(store.state.doc.districts!.some((d) => d.zoneId === "labs"), false, "nobody lives in labs: its district goes with the undo");
  await store.redo();
  await arrive(store, [{ slug: "a" }, { slug: "b" }, { slug: "c", zoneId: "labs" }]);
  await store.undo();
  assert.equal(store.state.doc.districts!.filter((d) => d.zoneId === "labs").length, 1, "C lives there: the district stays");
});

test("carryAllocations is pure: the target document comes back as is when nothing arrived since", () => {
  const a = edit(emptyTownDocument(), allocationEdit(emptyTownDocument(), [{ slug: "a" }]));
  const b = edit(a, moveEdit(a, "a", { cell: districtLots(CENTRAL_SLOT)[3]! }));
  assert.equal(carryAllocations(b, a), a);
  assert.equal(carryAllocations(a, b), b);
  // A carried plot keeps its style and cast, and the order of the restored plots (the founding project) stays.
  const c = edit(b, allocationEdit(b, [{ slug: "a" }, { slug: "c", zoneId: "labs" }]));
  const styled = edit(c, { type: "set-style-options", slug: "c", options: { roof: "slate" } });
  const carried = carryAllocations(styled, a);
  assert.deepEqual(carried.plots.map((p) => p.slug), ["a", "c"]);
  assert.deepEqual(carried.plots[1]?.styleOptions, { roof: "slate" });
  assert.equal(carried.revision, a.revision);
});

/**
 * Stability with history: projects arrive (no undo step), buildings move by hand, the town is tidied, and undo and
 * redo are pressed at random in between. After every step every project the world knows has one plot on a buildable
 * lot, no two share one, an undo or redo never leaves anyone to re-allocate, and a project nobody moved by hand (and
 * no tidy touched) still stands where it was first given its lot.
 */
test("stability: arrivals, hand moves, tidies, undo and redo mixed over one to four zones", async () => {
  const zones = ["default", "studio", "labs", "garden"];
  for (let zoneCount = 1; zoneCount <= 4; zoneCount++) {
    for (let run = 0; run < 4; run++) {
      const rand = random(zoneCount * 1000 + run + 7);
      const store = await townStore();
      const present: Settler[] = [];
      const given = new Map<string, string>();
      const touched = new Set<string>();
      let arrivals = 0;
      const check = (step: string) => {
        const doc = store.state.doc;
        assert.equal(allocationEdit(doc, present), null, `${step}: nobody is left to re-allocate`);
        const taken = new Set<string>();
        for (const plot of doc.plots) {
          assert.equal(lotKind(plot.cell).kind, "lot", `${step}: ${plot.slug} stands on a lot`);
          assert.ok(!taken.has(lotKey(plot.cell)), `${step}: ${plot.slug} shares a lot`);
          taken.add(lotKey(plot.cell));
        }
        assert.equal(new Set((doc.districts ?? []).map((d) => slotKey(d.slot))).size, (doc.districts ?? []).length, `${step}: districts are unique`);
        for (const [slug, cell] of given) if (!touched.has(slug)) assert.equal(cellOf(doc, slug), cell, `${step}: ${slug} was never moved by hand and keeps its lot`);
      };
      for (let step = 0; step < 60; step++) {
        const roll = rand();
        if (roll < 0.35 || !present.length) {
          const zone = zones[Math.floor(rand() * zoneCount)]!;
          const slug = `p${arrivals++}`;
          present.push(zone === "default" ? { slug } : { slug, zoneId: zone });
          await arrive(store, present);
          given.set(slug, cellOf(store.state.doc, slug));
          check(`arrive ${slug}`);
        } else if (roll < 0.55) {
          const slug = present[Math.floor(rand() * present.length)]!.slug;
          const doc = store.state.doc;
          let e: TownEdit | null;
          if (rand() < 0.5) e = moveEdit(doc, slug, { zoneId: zones[Math.floor(rand() * zoneCount)]! });
          else {
            const free = (doc.districts ?? []).flatMap((d) => districtLots(d.slot)).filter((cell) => !doc.plots.some((p) => lotKey(p.cell) === lotKey(cell)));
            e = free.length ? moveEdit(doc, slug, { cell: free[Math.floor(rand() * free.length)]! }) : null;
          }
          if (!e) continue;
          touched.add(slug);
          await byHand(store, e);
          check(`move ${slug}`);
        } else if (roll < 0.62) {
          for (const s of present) touched.add(s.slug);
          await byHand(store, tidyEdit(store.state.doc, present, [zones[Math.floor(rand() * zoneCount)]!]));
          check("tidy");
        } else if (roll < 0.82) {
          await store.undo();
          check("undo");
        } else {
          await store.redo();
          check("redo");
        }
      }
      // A plain allocation still finds the next free lot of a zone after all that.
      const found = nextFreeLot(settlementOf(store.state.doc), zones[0]);
      assert.ok(found);
      assert.ok(!store.state.doc.plots.some((p: Plot) => lotKey(p.cell) === lotKey(found.cell)));
    }
  }
});
