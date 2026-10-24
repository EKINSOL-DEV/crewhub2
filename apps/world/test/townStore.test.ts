import assert from "node:assert/strict";
import test from "node:test";
import { applyEdit, HISTORY_LIMIT, type TownContext, type TownDocument } from "@crewhub/world-model";
import { copiedNote, createTownStore, seededTown, TOWN_DB_NAME, TOWN_STORE_NAME, type TownStore } from "../src/state/townStore.ts";

const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: [] };

/** Just enough IndexedDB for the adapter: one database, out-of-line keys, async requests and transactions. */
class FakeIndexedDB {
  readonly data = new Map<string, Map<IDBValidKey, unknown>>();
  failOpen = false;
  /** `indexedDB.databases()`, as Chromium and WebKit answer it; `listable = false` is a browser without it. */
  listable = true;
  databases(): Promise<{ name: string }[]> {
    if (!this.listable) throw new TypeError("databases is not a function");
    return Promise.resolve([...this.data.keys()].map((name) => ({ name })));
  }
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

test("a scenario's town starts from its seeded zones at revision 0; a stored town wins over the seed", async () => {
  const zones = [
    { id: "pg_demo_brand", look: { styleOptions: { season: "spring", planting: "orchard" }, castId: "sprouts" } },
    { id: "pg_demo_lab", look: { castId: "potlings" } },
  ];
  const initial = seededTown(zones, CONTEXT);
  assert.equal(initial.revision, 0);
  assert.deepEqual(initial.zones, zones);
  assert.deepEqual(seededTown([], CONTEXT).zones, undefined);

  const idb = new FakeIndexedDB();
  const factory = idb as unknown as IDBFactory;
  const first = createTownStore({ context: CONTEXT, indexedDB: factory, name: "crewhub-world.studio", initial });
  await first.load();
  assert.deepEqual(first.state.doc.zones, zones);
  assert.equal(first.state.canUndo, false);
  await commitPlot(first, 2);
  await new Promise((resolve) => setTimeout(resolve, 20));

  // A reload with a different seed keeps what the person has: the stored town, zones included.
  const again = createTownStore({ context: CONTEXT, indexedDB: factory, name: "crewhub-world.studio", initial: seededTown([], CONTEXT) });
  await again.load();
  assert.deepEqual(again.state.doc.zones, zones);
  assert.deepEqual(again.state.doc.plots.map((p) => p.cell.x), [2]);
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("a live town kept under the earlier plain key is copied once into the installation's key; the earlier copy is kept", async () => {
  const idb = new FakeIndexedDB();
  const factory = idb as unknown as IDBFactory;
  const OLD = "crewhub-world.live";
  const NEW = "crewhub-world.live.127.0.0.1-8091";
  const old = createTownStore({ context: CONTEXT, indexedDB: factory, name: OLD });
  await old.load();
  await commitPlot(old, 4);
  await commitPlot(old, 7);
  await sleep(20);
  const before = structuredClone(idb.data.get(OLD)!);

  const first = createTownStore({ context: CONTEXT, indexedDB: factory, name: NEW, copyFrom: OLD });
  const doc = await first.load();
  assert.deepEqual([doc.revision, doc.plots[0]?.cell.x], [2, 7], "the town comes over, undo history included");
  assert.equal(first.state.canUndo, true);
  assert.equal(first.state.storageNote, copiedNote(OLD), "said once");
  assert.deepEqual(idb.data.get(OLD), before, "the earlier database is exactly as it was");
  assert.deepEqual([...idb.data.get(NEW)!.keys()].sort(), [...before.keys()].sort());

  // Once: the next open finds the new town and copies nothing, whatever happened to the earlier one meanwhile.
  await commitPlot(first, 9);
  await sleep(20);
  await commitPlot(old, 1);
  await sleep(20);
  const second = createTownStore({ context: CONTEXT, indexedDB: factory, name: NEW, copyFrom: OLD });
  const again = await second.load();
  assert.deepEqual([again.revision, again.plots[0]?.cell.x], [3, 9]);
  assert.equal(second.state.storageNote, null, "nothing said the second time");
});

test("the copy never overwrites a new town that exists, never happens without a listable factory, and a demo page asks for none", async () => {
  const idb = new FakeIndexedDB();
  const factory = idb as unknown as IDBFactory;
  const OLD = "crewhub-world.live";
  const NEW = "crewhub-world.live.127.0.0.1-8291";
  const old = createTownStore({ context: CONTEXT, indexedDB: factory, name: OLD });
  await old.load();
  await commitPlot(old, 4);
  const own = createTownStore({ context: CONTEXT, indexedDB: factory, name: NEW });
  await own.load();
  await commitPlot(own, 11);
  await sleep(20);
  const kept = createTownStore({ context: CONTEXT, indexedDB: factory, name: NEW, copyFrom: OLD });
  const doc = await kept.load();
  assert.deepEqual([doc.revision, doc.plots[0]?.cell.x, kept.state.storageNote], [1, 11, null], "the new town stands");

  // A browser whose IndexedDB cannot list databases: nothing is copied, and the earlier name is not created by looking.
  const quiet = new FakeIndexedDB();
  quiet.listable = false;
  const blindOld = createTownStore({ context: CONTEXT, indexedDB: quiet as unknown as IDBFactory, name: OLD });
  await blindOld.load();
  await commitPlot(blindOld, 2);
  await sleep(20);
  const blind = createTownStore({ context: CONTEXT, indexedDB: quiet as unknown as IDBFactory, name: NEW, copyFrom: OLD });
  assert.deepEqual((await blind.load()).plots, []);
  assert.equal(blind.state.storageNote, null);
  const none = new FakeIndexedDB();
  const fresh = createTownStore({ context: CONTEXT, indexedDB: none as unknown as IDBFactory, name: NEW, copyFrom: OLD });
  await fresh.load();
  await sleep(20);
  assert.deepEqual([...none.data.keys()], [NEW], "looking for the earlier town never creates it");

  // The same name, or no copyFrom (a demo page): no copy, no note.
  const same = createTownStore({ context: CONTEXT, indexedDB: factory, name: OLD, copyFrom: OLD });
  await same.load();
  assert.equal(same.state.storageNote, null);
});
