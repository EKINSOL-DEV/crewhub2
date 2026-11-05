/* Another browser's move brings a revision (round 65, w6-12): the host-kept store says which revision and which move
   (`elsewhere`), until this browser's next move; the words build mode says for it. A fake host in memory. */
import assert from "node:assert/strict";
import test from "node:test";
import { applyEdit, canRedo, canUndo, commitHistory, createHistory, currentDocument, undoHistory, type TownContext, type TownDocument, type TownHistory } from "@crewhub/world-model";
import type { HostAnswer, HostTownOp, TownReadSent, TownWrittenSent } from "@crewhub/loops-client";
import { createHostTownStore } from "../src/state/hostTown.ts";
import { createTownStore } from "../src/state/townStore.ts";
import { elsewhereWords } from "../src/world/elsewhereWords.ts";

const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: [] };
const plot = (doc: TownDocument, slug: string, x: number): TownDocument => {
  const result = applyEdit(doc, { type: "set-plot", slug, cell: { x, z: 0 } }, CONTEXT);
  assert.ok(result.ok);
  return result.doc;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A host in memory: reads answer its town, writes move its history, and `moved` is another browser's move told to the stream. */
function fakeHost(document: TownDocument) {
  let history: TownHistory = createHistory(document);
  const listeners = new Set<(rev: number, op?: HostTownOp) => void>();
  const host = {
    rev: 1,
    get document() {
      return structuredClone(currentDocument(history));
    },
    transport: {
      async read(): Promise<HostAnswer> {
        return { status: 200, body: { installation: "i", rev: host.rev, updatedAt: "t", document: host.document, canUndo: canUndo(history), canRedo: canRedo(history) } satisfies TownReadSent };
      },
      async write(op: HostTownOp, document: TownDocument | null, baseRev: number): Promise<HostAnswer> {
        assert.equal(baseRev, host.rev);
        history = op === "commit" ? commitHistory(history, document!) : op === "undo" ? undoHistory(history) : history;
        host.rev += 1;
        return { status: 200, body: { ok: true, rev: host.rev, document: host.document, canUndo: canUndo(history), canRedo: canRedo(history), changed: true } satisfies TownWrittenSent };
      },
    },
    /** Another browser's move: the host's history moves and every stream hears `{type: "town", rev, op}`. */
    moved(op: "commit" | "undo", document?: TownDocument, said: boolean = true) {
      history = op === "commit" ? commitHistory(history, document!) : undoHistory(history);
      host.rev += 1;
      for (const l of listeners) (said ? l(host.rev, op) : l(host.rev));
    },
    onTown: (listener: (rev: number, op?: HostTownOp) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return host;
}

test("w6-12: another browser's undo is known by its revision and its move; this browser's own move clears it", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost(plot(empty, "a", 1));
  const local = createTownStore({ context: CONTEXT, indexedDB: null });
  const store = createHostTownStore({ local, transport: host.transport, context: CONTEXT, onTown: host.onTown, retryMs: 20 });
  await store.load();
  assert.equal(store.state.elsewhere, null, "nothing from elsewhere yet");
  host.moved("commit", plot(host.document, "b", 2));
  await flush();
  assert.deepEqual(store.state.elsewhere, { rev: 2, op: "commit" });
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["a", "b"]);
  host.moved("undo");
  await flush();
  assert.deepEqual(store.state.elsewhere, { rev: 3, op: "undo" }, "the undo in the other browser, by its revision");
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["a"]);
  await store.commit(plot(store.state.doc, "c", 3));
  assert.equal(store.state.elsewhere, null, "this browser's own move is the last word");
  // An older host that names no move: the revision is known, the move is not.
  host.moved("commit", plot(host.document, "d", 4), false);
  await flush();
  assert.deepEqual(store.state.elsewhere, { rev: 5, op: null });
});

test("the words: undone, redone or changed in another browser with the revision; the world's own record says nothing", () => {
  assert.equal(elsewhereWords({ rev: 7, op: "undo" }), "Undone in another browser. Revision 7.");
  assert.equal(elsewhereWords({ rev: 8, op: "redo" }), "Redone in another browser. Revision 8.");
  assert.equal(elsewhereWords({ rev: 9, op: "commit" }), "Changed in another browser. Revision 9.");
  assert.equal(elsewhereWords({ rev: 9, op: null }), "Changed in another browser. Revision 9.");
  assert.equal(elsewhereWords({ rev: 10, op: "amend" }), null);
});
