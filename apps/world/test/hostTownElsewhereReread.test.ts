/* Another browser's move, said with its revision (round 65, w6-12), under a read that is still on its way (round 68,
   mutation run mx1 over sugg/w6-12): the announcement is taken by the read that brings its revision, once; the revision
   said is the one that read brought. A host in memory whose reads can be held back. */
import assert from "node:assert/strict";
import test from "node:test";
import { canRedo, canUndo, commitHistory, createHistory, currentDocument, undoHistory, type TownContext, type TownDocument, type TownHistory, applyEdit } from "@crewhub/world-model";
import type { HostAnswer, HostTownOp, TownReadSent, TownWrittenSent } from "@crewhub/loops-client";
import { createHostTownStore } from "../src/state/hostTown.ts";
import { createTownStore } from "../src/state/townStore.ts";

const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: [] };
const plot = (doc: TownDocument, slug: string, x: number): TownDocument => {
  const result = applyEdit(doc, { type: "set-plot", slug, cell: { x, z: 0 } }, CONTEXT);
  assert.ok(result.ok);
  return result.doc;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A host in memory: `hold` makes every read wait until `release`; `moved` is another browser's move, told to the stream or not. */
function holdingHost(document: TownDocument) {
  let history: TownHistory = createHistory(document);
  let rev = 1;
  const towns = new Set<(rev: number, op?: HostTownOp) => void>();
  const connected = new Set<() => void>();
  let gate: Promise<void> | null = null;
  let open: (() => void) | null = null;
  let down = false;
  const body = () => ({ rev, document: structuredClone(currentDocument(history)), canUndo: canUndo(history), canRedo: canRedo(history) });
  return {
    get rev() {
      return rev;
    },
    transport: {
      async read(): Promise<HostAnswer> {
        if (gate) await gate;
        if (down) return { status: 503, body: null };
        return { status: 200, body: { installation: "i", updatedAt: "t", ...body() } satisfies TownReadSent };
      },
      async write(op: HostTownOp, written: TownDocument | null, baseRev: number): Promise<HostAnswer> {
        assert.equal(baseRev, rev);
        history = op === "commit" ? commitHistory(history, written!) : op === "undo" ? undoHistory(history) : history;
        rev += 1;
        return { status: 200, body: { ok: true, changed: true, ...body() } satisfies TownWrittenSent };
      },
    },
    moved(op: "commit" | "undo", document?: TownDocument, told = true) {
      history = op === "commit" ? commitHistory(history, document!) : undoHistory(history);
      rev += 1;
      if (told) for (const l of towns) l(rev, op);
    },
    hold() {
      gate = new Promise<void>((resolve) => (open = resolve));
    },
    /** The host stops answering reads (503), or answers again. */
    away(is: boolean) {
      down = is;
    },
    release() {
      gate = null;
      open?.();
      open = null;
    },
    onTown: (listener: (rev: number, op?: HostTownOp) => void) => {
      towns.add(listener);
      return () => towns.delete(listener);
    },
    onConnected: (listener: () => void) => {
      connected.add(listener);
      return () => connected.delete(listener);
    },
    streamBack: () => {
      for (const l of connected) l();
    },
  };
}

function setUp() {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = holdingHost(plot(empty, "a", 1));
  const local = createTownStore({ context: CONTEXT, indexedDB: null });
  const store = createHostTownStore({ local, transport: host.transport, context: CONTEXT, onTown: host.onTown, onConnected: host.onConnected, retryMs: 20 });
  return { host, store };
}

test("w6-12: another browser's move is taken by the read that brings it, once: a later reread (the stream back) under this browser's own move does not say it again", async () => {
  const { host, store } = setUp();
  await store.load();
  host.moved("commit", plot(store.state.doc, "b", 2));
  await flush();
  assert.deepEqual(store.state.elsewhere, { rev: 2, op: "commit" }, "said once, by the read its announcement started");
  // The stream comes back: the town is read again, and that read is slow. Meanwhile this browser commits.
  host.hold();
  host.streamBack();
  const own = store.commit(plot(store.state.doc, "c", 3));
  await flush();
  assert.equal(store.state.elsewhere, null, "this browser's own move is the last word, from the moment it is made");
  host.release();
  await own;
  await flush();
  assert.equal(store.state.elsewhere, null, "the reread brought the revision announced before, and it is not said again");
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["a", "b", "c"]);
});

test("w6-12: the revision said is the one the read brought: the host moved again before a held read answered", async () => {
  const { host, store } = setUp();
  await store.load();
  host.hold();
  host.moved("commit", plot(store.state.doc, "b", 2));
  await flush();
  assert.equal(store.state.elsewhere, null, "the read that will say it is still on its way");
  // Another move, not heard (the stream missed it): the read answers with the newer revision.
  host.moved("undo", undefined, false);
  host.release();
  await flush();
  assert.deepEqual(store.state.elsewhere, { rev: 3, op: "commit" }, "the record's revision (w6-10: one revision number on screen), the move as announced");
  assert.equal(store.rev, 3);
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["a"]);
});

test("w6-12: the line stands while the host is away (a read refused), and after the host is back, until this browser's next move", async () => {
  const { host, store } = setUp();
  await store.load();
  host.moved("commit", plot(store.state.doc, "b", 2));
  await flush();
  assert.deepEqual(store.state.elsewhere, { rev: 2, op: "commit" });
  host.away(true);
  host.streamBack();
  await flush();
  try {
    assert.notEqual(store.state.storage, "host", "the host is away");
    assert.deepEqual(store.state.elsewhere, { rev: 2, op: "commit" }, "still said while the host is away");
  } finally {
    // The store asks again every retryMs while the host is away: back before the test ends, or its timer holds the process.
    host.away(false);
    await flush();
    await flush();
  }
  assert.equal(store.state.storage, "host", "the host is back");
  assert.deepEqual(store.state.elsewhere, { rev: 2, op: "commit" }, "still said after the host is back: the reread brought nothing new");
  await store.commit(plot(store.state.doc, "c", 3));
  assert.equal(store.state.elsewhere, null, "this browser's own move is the last word");
});
