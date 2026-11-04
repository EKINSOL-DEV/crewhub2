/* The town runtime (state/town.ts) through its interface: built from a config over a world runtime on the demo (manual
   scheduler, fake frame clock) and a town store in memory, read through `state`, `edit`, `editAll` and its announcements.
   Round 59d, C3: the facts once pinned on townEdits.ts (folded in) are here: several edits are one revision, all or
   none; an error crate stands only while its ticket is still a done, unimported prop request, and the state is
   published when the crates change. */
import assert from "node:assert/strict";
import test from "node:test";
import { createDemoSource, createManualScheduler, SCRIPT_DURATION_MS } from "@crewhub/demo";
import { builtinIds, type TownContext } from "@crewhub/world-model";
import { definitions } from "../src/world/definitions.ts";
import { createTownRuntime } from "../src/state/town.ts";
import { createTownStore } from "../src/state/townStore.ts";
import { createWorldRuntime, type FrameClock } from "../src/state/world.ts";

const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: builtinIds(definitions) };
const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, limit = 5_000): Promise<void> {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await settle(10);
  }
}

/**
 * A browser whose IndexedDB refuses to open (a private window): the store falls back to memory once the open fails, a
 * task later, as in a browser. (`indexedDB: null` publishes "loaded" inside its first load(), before that load is
 * remembered, so a town listener that amends at once would load again, and again: a latent loop of the memory-only
 * store that no browser reaches; reported in round 59d's C3 report, not changed here.)
 */
function refusingIndexedDB(): IDBFactory {
  return {
    open() {
      const r = {} as { error: Error; onerror?: () => void; onsuccess?: () => void; onupgradeneeded?: () => void; onblocked?: () => void };
      setTimeout(() => {
        r.error = new Error("refused");
        r.onerror?.();
      }, 0);
      return r;
    },
  } as unknown as IDBFactory;
}

/** A demo world at 16x, its frames run at once (the frame clock's frame is the test's microtask). */
function demoTown() {
  const scheduler = createManualScheduler(1_000);
  const demo = createDemoSource({ scheduler, speed: 16, epochMs: 0 });
  const clock: FrameClock = { now: () => 0, frame: (fn) => void queueMicrotask(fn), after: (ms, fn) => void setTimeout(fn, ms), every: () => {}, hidden: () => false };
  const world = createWorldRuntime({ source: demo, chat: demo, epochMs: 0, clock, buildingLimit: NaN, outlets: { said: () => {}, threads: () => {}, hostConnected: () => {}, firstSnapshot: () => {} } });
  const store = createTownStore({ context: CONTEXT, indexedDB: refusingIndexedDB(), warn: () => {} });
  let ids = 0;
  const town = createTownRuntime({ world, context: CONTEXT, store, buildingPlan: () => "three-rooms", newId: () => `p${(ids += 1)}` });
  const said: string[] = [];
  town.onAnnounce((text) => said.push(text));
  return { scheduler, demo, world, town, said };
}

const plotAt = (slug: string, x: number) => ({ type: "set-plot" as const, slug, cell: { x, z: 0 } });

test("editAll: every edit applies on the one before as one revision (one undo step), or none does and the first refusal is the answer", async () => {
  const { town } = demoTown();
  await until(() => town.state.loaded);
  const before = town.state.doc;
  const refused = town.editAll([plotAt("a", 1), { type: "delete", id: "nope" }, plotAt("c", 7)]);
  assert.deepEqual(refused, { ok: false, error: "No placed prop with id nope." });
  await settle();
  assert.equal(town.state.doc, before, "a refusal changes nothing");
  assert.equal(town.state.canUndo, false);
  assert.deepEqual(town.editAll([plotAt("a", 1), plotAt("b", 4)]), { ok: true });
  await until(() => town.state.doc !== before);
  assert.deepEqual(town.state.doc.plots.filter((p) => p.slug === "a" || p.slug === "b").map((p) => [p.slug, p.cell.x]), [["a", 1], ["b", 4]]);
  town.undo();
  await until(() => !town.state.doc.plots.some((p) => p.slug === "a" || p.slug === "b"));
  assert.equal(town.state.canUndo, false, "one undo step took both");
  assert.deepEqual(town.editAll([]), { ok: true }, "no edit: the document as it is");
});

test("the done prop tickets import into the town; the broken one stands as an error crate while it is listed, and goes when a seek undoes it", async () => {
  const { scheduler, demo, town, said } = demoTown();
  await until(() => town.state.loaded);
  let published = 0;
  town.subscribe(() => (published += 1));
  scheduler.advance(Math.ceil((SCRIPT_DURATION_MS - 5_000) / 16));
  await until(() => town.state.invalid.length === 1 && town.state.doc.userProps.length === 2, 10_000);
  assert.deepEqual(town.state.invalid.map((r) => r.ticketKey), ["CR-38"]);
  assert.deepEqual(town.state.doc.userProps.map((p) => p.provenance).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), [{ kind: "ticket", ticketKey: "CR-35" }, { kind: "ticket", ticketKey: "CR-37" }]);
  assert.ok(said.some((s) => s.endsWith("An error crate stands in its place.") && s.startsWith("prop CR-38 is invalid")), said.join(" | "));
  assert.ok(said.some((s) => s.startsWith("CR-35 is done:") && s.includes("joined the catalogue")));
  // Nothing new while the same crate stands: the world moving on publishes no town state.
  const shown = town.state.invalid;
  const count = published;
  scheduler.advance(100); // 1.6 s of demo time, before the script's end (5 s on) loops it
  await settle(300);
  assert.equal(town.state.invalid, shown, "the same crates, the same array");
  assert.equal(published, count, "no publish while the crates are the same");
  // A seek back: CR-38 is no longer a done request, so its crate goes (and the state says so).
  demo.playback.seek(0);
  await until(() => town.state.invalid.length === 0, 10_000);
  assert.ok(published > count);
});
