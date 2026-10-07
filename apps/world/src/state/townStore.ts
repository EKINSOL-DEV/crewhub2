/* The town document's storage and undo: the only browser-specific part of build mode. The history logic is pure
   (packages/world-model history.ts); this adapter keeps it in IndexedDB, database `crewhub-world`, object store
   `town`: one record per kept revision (key = the revision number, value = the document) and one record under the
   key "head" holding the current revision, so a reload restores the same town, including after an undo. When
   IndexedDB is missing or fails (private mode), the store keeps working in memory and says so in `state.storage`
   for the Settings card; nothing then survives a reload. */
import {
  applyEdit,
  canRedo,
  canUndo,
  amendHistory,
  commitHistory,
  createHistory,
  currentDocument,
  emptyTownDocument,
  redoHistory,
  restoreHistory,
  undoHistory,
  validateTownDocument,
  type TownContext,
  type TownDocument,
  type TownHistory,
  type TownZone,
} from "@crewhub/world-model";

export const TOWN_DB_NAME = "crewhub-world";
export const TOWN_DB_VERSION = 1;
export const TOWN_STORE_NAME = "town";
const HEAD_KEY = "head";

export interface TownStoreState {
  doc: TownDocument;
  canUndo: boolean;
  canRedo: boolean;
  /** "memory" when IndexedDB is missing or failed: changes are lost on reload. */
  storage: "indexeddb" | "memory";
  /** Why storage fell back to memory, or why stored revisions were skipped; null when all is well. */
  storageNote: string | null;
  loaded: boolean;
}

export interface TownStore {
  readonly state: TownStoreState;
  /** Reads the stored history once; later calls return the current document. */
  load(): Promise<TownDocument>;
  /** Makes `doc` (the result of `applyEdit` on `state.doc`) the current revision. Returns it as stored. */
  commit(doc: TownDocument): Promise<TownDocument>;
  /**
   * Replaces the current revision in place: no undo step (`amendHistory`). For what the world records by itself.
   * `update` gets the document that is current when the amend is applied; null leaves it as it is.
   */
  amend(update: (doc: TownDocument) => TownDocument | null): Promise<TownDocument>;
  undo(): Promise<TownDocument>;
  redo(): Promise<TownDocument>;
  subscribe(listener: () => void): () => void;
}

export interface TownStoreOptions {
  context: TownContext;
  /**
   * The database's name. Default TOWN_DB_NAME. Every demo scenario has its own (`DemoScenario.townKey`), so the
   * plots and placements of one town never mix into another.
   */
  name?: string;
  /**
   * The document a town starts from while nothing is stored: revision 0, so no undo goes behind it. Default the empty
   * town. A demo scenario seeds its zones' looks here (`seededTown`).
   */
  initial?: TownDocument;
  /** Defaults to `globalThis.indexedDB`; pass null to force memory. */
  indexedDB?: IDBFactory | null;
  /**
   * What an undo or redo carries from the revision it leaves (`from`) into the one it restores (`to`): the town's own
   * facts (a project's lot) are not a person's edit, so they are not undone with it. The result replaces the restored
   * revision in place; returning `to` itself changes nothing. The town runtime passes `carryAllocations`.
   */
  carry?: (from: TownDocument, to: TownDocument) => TownDocument;
}

const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const open = factory.open(name, TOWN_DB_VERSION);
  open.onupgradeneeded = () => {
    if (!open.result.objectStoreNames.contains(TOWN_STORE_NAME)) open.result.createObjectStore(TOWN_STORE_NAME);
  };
  return request(open);
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createTownStore(options: TownStoreOptions): TownStore {
  const factory = options.indexedDB === undefined ? (globalThis.indexedDB ?? null) : options.indexedDB;
  let history: TownHistory = createHistory(options.initial ?? emptyTownDocument());
  let db: IDBDatabase | null = null;
  let loading: Promise<TownDocument> | null = null;
  /** Revisions present in the database, so a commit writes each kept document once (the first one included). */
  const stored = new Set<number>();
  /** Writes run one after another, in commit order. */
  let writes: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  let state: TownStoreState = {
    doc: currentDocument(history),
    canUndo: false,
    canRedo: false,
    storage: factory ? "indexeddb" : "memory",
    storageNote: factory ? null : "IndexedDB is not available in this browser; the town is kept in memory only.",
    loaded: false,
  };

  const publish = (patch: Partial<TownStoreState> = {}) => {
    state = { ...state, ...patch, doc: currentDocument(history), canUndo: canUndo(history), canRedo: canRedo(history) };
    for (const listener of listeners) listener();
  };

  const toMemory = (reason: string) => {
    db?.close();
    db = null;
    publish({ storage: "memory", storageNote: `Storage failed (${reason}); the town is kept in memory only.` });
  };

  /** Queues a write; a failure switches the store to memory instead of losing the in-memory history. */
  const write = (run: (store: IDBObjectStore) => void) => {
    writes = writes.then(async () => {
      if (!db) return;
      try {
        const tx = db.transaction(TOWN_STORE_NAME, "readwrite");
        run(tx.objectStore(TOWN_STORE_NAME));
        await done(tx);
      } catch (e) {
        toMemory(message(e));
      }
    });
    return writes;
  };

  async function readStored(database: IDBDatabase): Promise<{ docs: TownDocument[]; head: number | null; skipped: number }> {
    const tx = database.transaction(TOWN_STORE_NAME, "readonly");
    const store = tx.objectStore(TOWN_STORE_NAME);
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
    const docs: TownDocument[] = [];
    let head: number | null = null;
    let skipped = 0;
    keys.forEach((key, i) => {
      if (key === HEAD_KEY) head = typeof values[i] === "number" ? (values[i] as number) : null;
      else if (typeof key === "number") {
        const result = validateTownDocument(values[i], options.context);
        if (result.ok && result.value.revision === key) docs.push(result.value);
        else skipped++;
      }
    });
    return { docs, head, skipped };
  }

  /** An undo or a redo: moves the cursor, then carries the world's own facts into the restored revision. */
  async function travel(move: (history: TownHistory) => TownHistory): Promise<TownDocument> {
    await store.load();
    const from = currentDocument(history);
    history = move(history);
    const to = currentDocument(history);
    const carried = to !== from && options.carry ? options.carry(from, to) : to;
    if (carried !== to) history = amendHistory(history, carried);
    publish();
    const current = currentDocument(history);
    await write((store) => {
      if (carried !== to) store.put(current, current.revision);
      store.put(current.revision, HEAD_KEY);
    });
    return current;
  }

  const store: TownStore = {
    get state() {
      return state;
    },
    load() {
      loading ??= (async () => {
        if (factory) {
          try {
            db = await openDatabase(factory, options.name ?? TOWN_DB_NAME);
            const { docs, head, skipped } = await readStored(db);
            for (const doc of docs) stored.add(doc.revision);
            const restored = restoreHistory(docs, head);
            if (restored) history = restored;
            publish({
              loaded: true,
              storageNote: skipped ? `${skipped} stored revision${skipped === 1 ? " was" : "s were"} invalid and skipped.` : null,
            });
            return state.doc;
          } catch (e) {
            toMemory(message(e));
          }
        }
        publish({ loaded: true });
        return state.doc;
      })();
      return loading;
    },
    async commit(doc) {
      await store.load();
      history = commitHistory(history, doc);
      const current = currentDocument(history);
      const kept = new Set(history.entries.map((d) => d.revision));
      const dropped = [...stored].filter((revision) => !kept.has(revision));
      const missing = history.entries.filter((d) => !stored.has(d.revision));
      for (const revision of dropped) stored.delete(revision);
      for (const d of missing) stored.add(d.revision);
      publish();
      await write((store) => {
        for (const revision of dropped) store.delete(revision);
        for (const d of missing) store.put(d, d.revision);
        store.put(current.revision, HEAD_KEY);
      });
      return current;
    },
    async amend(update) {
      await store.load();
      const doc = update(currentDocument(history));
      if (!doc) return state.doc;
      history = amendHistory(history, doc);
      const current = currentDocument(history);
      stored.add(current.revision);
      publish();
      await write((store) => {
        store.put(current, current.revision);
        store.put(current.revision, HEAD_KEY);
      });
      return current;
    },
    undo: () => travel(undoHistory),
    redo: () => travel(redoHistory),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

/**
 * The empty town with `zones` set (a scenario's district looks), as revision 0. A zone the document refuses is left
 * out: the seed must never keep a town from starting.
 */
export function seededTown(zones: readonly TownZone[], context: TownContext): TownDocument {
  let doc = emptyTownDocument();
  for (const zone of zones) {
    const result = applyEdit(doc, { type: "set-zone", zone }, context);
    if (result.ok) doc = result.doc;
  }
  return { ...doc, revision: 0 };
}
