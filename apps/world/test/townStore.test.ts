import assert from "node:assert/strict";
import test from "node:test";
import { applyEdit, HISTORY_LIMIT, type TownContext, type TownDocument } from "@crewhub/world-model";
import { createTownStore, TOWN_DB_NAME, TOWN_STORE_NAME, type TownStore } from "../src/state/townStore.ts";

const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: [] };

/** Just enough IndexedDB for the adapter: one database, out-of-line keys, async requests and transactions. */
class FakeIndexedDB {
  readonly data = new Map<string, Map<IDBValidKey, unknown>>();
  failOpen = false;
  open(name: string) {
    const req: Record<string, unknown> & { result?: unknown } = {};
    setTimeout(() => {
      if (this.failOpen) {
        req["error"] = new Error("The operation is insecure.");
        (req["onerror"] as () => void)();
        return;
      }
      const fresh = !this.data.has(name);
      const records = this.data.get(name) ?? new Map<IDBValidKey, unknown>();
      this.data.set(name, records);
      const stores = new Set<string>(fresh ? [] : [TOWN_STORE_NAME]);
      req.result = {
        objectStoreNames: { contains: (n: string) => stores.has(n) },
        createObjectStore: (n: string) => stores.add(n),
        close: () => {},
        transaction: () => fakeTransaction(records),
      };
      if (fresh) (req["onupgradeneeded"] as () => void)();
      (req["onsuccess"] as () => void)();
    });
    return req;
  }
}

function fakeTransaction(records: Map<IDBValidKey, unknown>) {
  const tx: Record<string, unknown> = {};
  const answer = (result: unknown) => {
    const req: Record<string, unknown> = { result };
    setTimeout(() => (req["onsuccess"] as () => void)());
    return req;
  };
  const sorted = () =>
    [...records.keys()].sort((a, b) =>
      typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === "number" ? -1 : 1,
    );
  tx["objectStore"] = () => ({
    put: (value: unknown, key: IDBValidKey) => records.set(key, structuredClone(value)),
    delete: (key: IDBValidKey) => records.delete(key),
    getAllKeys: () => answer(sorted()),
    getAll: () => answer(sorted().map((k) => structuredClone(records.get(k)))),
  });
  setTimeout(() => setTimeout(() => (tx["oncomplete"] as () => void)?.()));
  return tx;
}

async function commitPlot(store: TownStore, x: number): Promise<TownDocument> {
  const result = applyEdit(store.state.doc, { type: "set-plot", slug: "crewhub", cell: { x, z: 0 } }, CONTEXT);
  assert.ok(result.ok);
  return store.commit(result.doc);
}

test("a reload restores the same town, including an undo, and keeps 50 revisions", async () => {
  const idb = new FakeIndexedDB();
  const factory = idb as unknown as IDBFactory;
  const first = createTownStore({ context: CONTEXT, indexedDB: factory });
  await first.load();
  assert.equal(first.state.storage, "indexeddb");
  for (let x = 1; x <= 60; x++) await commitPlot(first, x);
  await first.undo();
  await first.undo();
  assert.equal(first.state.doc.revision, 58);

  const records = idb.data.get(TOWN_DB_NAME)!;
  assert.equal(records.size, HISTORY_LIMIT + 1, "50 revisions and the head pointer");
  assert.equal(records.get("head"), 58);

  const second = createTownStore({ context: CONTEXT, indexedDB: factory });
  const doc = await second.load();
  assert.deepEqual(doc, first.state.doc);
  assert.equal(doc.plots[0]?.cell.x, 58);
  assert.equal(second.state.canRedo, true);
  assert.equal((await second.redo()).revision, 59);

  // An edit after undo drops the redo tail from storage too.
  await second.undo();
  await commitPlot(second, 99);
  const third = createTownStore({ context: CONTEXT, indexedDB: factory });
  const reloaded = await third.load();
  assert.deepEqual([reloaded.revision, reloaded.plots[0]?.cell.x, third.state.canRedo], [61, 99, false]);
  assert.equal(records.has(59), false);
});

test("a corrupt stored revision is skipped and reported, not loaded", async () => {
  const idb = new FakeIndexedDB();
  const store = createTownStore({ context: CONTEXT, indexedDB: idb as unknown as IDBFactory });
  await store.load();
  await commitPlot(store, 1);
  await commitPlot(store, 2);
  const records = idb.data.get(TOWN_DB_NAME)!;
  records.set(2, { ...(records.get(2) as object), styleId: "neon" });
  const reloaded = createTownStore({ context: CONTEXT, indexedDB: idb as unknown as IDBFactory });
  const doc = await reloaded.load();
  assert.equal(doc.revision, 1);
  assert.match(reloaded.state.storageNote ?? "", /1 stored revision was invalid/);
});

test("without IndexedDB the store works in memory and says so", async () => {
  const failing = new FakeIndexedDB();
  failing.failOpen = true;
  for (const indexedDB of [null, failing as unknown as IDBFactory]) {
    const store = createTownStore({ context: CONTEXT, indexedDB });
    let changes = 0;
    store.subscribe(() => changes++);
    await store.load();
    assert.equal(store.state.storage, "memory");
    assert.ok(store.state.storageNote);
    await commitPlot(store, 1);
    await commitPlot(store, 2);
    assert.equal((await store.undo()).plots[0]?.cell.x, 1);
    assert.equal(store.state.canRedo, true);
    assert.ok(changes >= 3);
  }
});

test("each scenario keeps its own town: a named store never reads or writes another's plots", async () => {
  const idb = new FakeIndexedDB();
  const factory = idb as unknown as IDBFactory;
  const small = createTownStore({ context: CONTEXT, indexedDB: factory });
  await small.load();
  await commitPlot(small, 3);
  const fresh = createTownStore({ context: CONTEXT, indexedDB: factory, name: "crewhub-world.fresh" });
  await fresh.load();
  assert.deepEqual(fresh.state.doc.plots, []);
  await commitPlot(fresh, 9);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual([...idb.data.keys()].sort(), [TOWN_DB_NAME, "crewhub-world.fresh"]);

  const again = createTownStore({ context: CONTEXT, indexedDB: factory });
  await again.load();
  assert.deepEqual(again.state.doc.plots.map((p) => p.cell.x), [3]);
  const freshAgain = createTownStore({ context: CONTEXT, indexedDB: factory, name: "crewhub-world.fresh" });
  await freshAgain.load();
  assert.deepEqual(freshAgain.state.doc.plots.map((p) => p.cell.x), [9]);
});
