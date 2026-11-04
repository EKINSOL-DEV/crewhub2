/* The pure steps moved out of the state modules that reach the world runtime, React or IndexedDB at import (round 55,
   r55-state-list): chat.ts's invalidations, director.ts's presence storage, town.ts's edits and world.ts's reduce gap. */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PRESENCE, applyEdit, emptyTownDocument, type TownContext } from "@crewhub/world-model";
import { chatInvalidations } from "../src/state/chatInvalidations.ts";
import { loadPresence, PRESENCE_KEY, savePresence } from "../src/state/presenceStore.ts";
import { REDUCE_GAP_MAX_MS, REDUCE_GAP_PER_MS, reduceWait } from "../src/state/reduceGap.ts";
import { applyEdits, visibleInvalid } from "../src/state/townEdits.ts";
import type { InvalidRequest } from "../src/world/propImport.ts";

const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: [] };

test("chatInvalidations: a dm event or a delivery naming a dm thread refreshes the messages and the threads; nothing else does", () => {
  const both = [["dm-messages"], ["dm-threads"]];
  assert.deepEqual(chatInvalidations({ type: "dm.created", payload: {} }), both);
  assert.deepEqual(chatInvalidations({ type: "dm.read", payload: {} }), both);
  assert.deepEqual(chatInvalidations({ type: "delivery.created", payload: { dmThreadId: "t1" } }), both);
  assert.deepEqual(chatInvalidations({ type: "delivery.created", payload: { dmThreadId: 7 } }), [], "a thread id that is no string");
  assert.deepEqual(chatInvalidations({ type: "ticket.moved", payload: {} }), []);
  assert.deepEqual(chatInvalidations({ type: "admin.dm", payload: {} }), [], "only a type that starts with dm.");
});

/** A Storage in memory; `broken` makes every call throw, as a blocked site's does. */
function storage(broken = false) {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key: string) {
      if (broken) throw new Error("blocked");
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (broken) throw new Error("blocked");
      data.set(key, value);
    },
  };
}

test("presence settings: kept under their key and read back normalised; nothing stored, unreadable or a blocked storage reads the defaults", () => {
  const s = storage();
  assert.deepEqual(loadPresence(s), DEFAULT_PRESENCE, "nothing stored");
  savePresence({ ...DEFAULT_PRESENCE, directorEnabled: true, intervalMinutes: 5 }, s);
  assert.deepEqual(JSON.parse(s.data.get(PRESENCE_KEY)!), { ...DEFAULT_PRESENCE, directorEnabled: true, intervalMinutes: 5 });
  assert.deepEqual(loadPresence(s), { ...DEFAULT_PRESENCE, directorEnabled: true, intervalMinutes: 5 });
  s.data.set(PRESENCE_KEY, JSON.stringify({ ...DEFAULT_PRESENCE, intervalMinutes: 1 }));
  assert.equal(loadPresence(s).intervalMinutes, 2, "normalised: the plan's minimum");
  s.data.set(PRESENCE_KEY, "{not json");
  assert.deepEqual(loadPresence(s), DEFAULT_PRESENCE, "unreadable");
  const blocked = storage(true);
  assert.deepEqual(loadPresence(blocked), DEFAULT_PRESENCE, "a storage that throws");
  assert.doesNotThrow(() => savePresence(DEFAULT_PRESENCE, blocked));
  assert.deepEqual(loadPresence(null), DEFAULT_PRESENCE, "no storage at all");
});

const plotAt = (slug: string, x: number) => ({ type: "set-plot" as const, slug, cell: { x, z: 0 } });

test("applyEdits: every edit applies in order on the one before, or none does and the first refusal is the answer", () => {
  const doc = emptyTownDocument();
  const both = applyEdits(doc, [plotAt("a", 1), plotAt("b", 4)], CONTEXT);
  assert.ok(both.ok);
  assert.deepEqual(both.doc.plots.map((p) => [p.slug, p.cell.x]), [["a", 1], ["b", 4]]);
  const first = applyEdit(doc, plotAt("a", 1), CONTEXT);
  assert.ok(first.ok);
  const one = applyEdit(first.doc, plotAt("b", 4), CONTEXT);
  assert.ok(one.ok);
  assert.deepEqual(both.doc, one.doc, "the same as the two edits one after the other");
  const refused = applyEdits(doc, [plotAt("a", 1), { type: "delete", id: "nope" }, plotAt("c", 7)], CONTEXT);
  assert.deepEqual(refused, { ok: false, error: "No placed prop with id nope." });
  assert.deepEqual(applyEdits(doc, [], CONTEXT), { ok: true, doc }, "no edit: the document as it is");
});

test("visibleInvalid: an error crate stands only while its ticket is still listed as a done, unimported prop request", () => {
  const crate = (ticketKey: string) => ({ ticketKey, error: `${ticketKey} is not a valid prop` }) as unknown as InvalidRequest;
  const invalid = new Map([["CR-1", crate("CR-1")], ["CR-2", crate("CR-2")], ["CR-3", crate("CR-3")]]);
  assert.deepEqual(visibleInvalid(invalid, new Set(["CR-3", "CR-1", "CR-9"])).map((r) => r.ticketKey), ["CR-1", "CR-3"]);
  assert.deepEqual(visibleInvalid(invalid, new Set()), []);
  assert.deepEqual(visibleInvalid(new Map(), new Set(["CR-1"])), []);
});

test("reduceWait: the next reduction waits 20 times the last one's cost after it, at most 200 ms", () => {
  assert.deepEqual([REDUCE_GAP_PER_MS, REDUCE_GAP_MAX_MS], [20, 200]);
  assert.equal(reduceWait(1000, 2, 1010), 30, "a 2 ms reduction: 40 ms after it, 30 to go");
  assert.equal(reduceWait(1000, 2, 1040), 0, "due now");
  assert.equal(reduceWait(1000, 2, 1100), -60, "overdue: reduce on the next frame");
  assert.equal(reduceWait(1000, 50, 1010), 190, "a 50 ms reduction: capped at 200 ms after it");
  assert.equal(reduceWait(1000, 0, 1000), 0, "a free reduction: no wait at all");
});
