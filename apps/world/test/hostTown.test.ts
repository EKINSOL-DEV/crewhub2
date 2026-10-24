/* The town kept by the host (state/hostTown.ts): read and taken on load; imported once when the host has none, never
   over a town the host has; every commit, undo and amend sent with its base revision; a conflict takes the host's town
   and says so; the host's `town` message makes the browser refetch; offline the browser keeps editing and offers its
   town again when the host answers. A fake transport and the browser store in memory. */
import assert from "node:assert/strict";
import test from "node:test";
import { amendHistory, applyEdit, canRedo, canUndo, commitHistory, createHistory, currentDocument, redoHistory, undoHistory, type TownContext, type TownDocument, type TownHistory } from "@crewhub/world-model";
import type { HostAnswer, HostTownOp } from "@crewhub/loops-client";
import { CONFLICT_NOTE, IMPORTED_NOTE, UNREADABLE_NOTE, createHostTownStore, townStoreFor, type HostTownTransport } from "../src/state/hostTown.ts";
import { createTownStore } from "../src/state/townStore.ts";

const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: [] };
const plot = (doc: TownDocument, slug: string, x: number): TownDocument => {
  const result = applyEdit(doc, { type: "set-plot", slug, cell: { x, z: 0 } }, CONTEXT);
  assert.ok(result.ok);
  return result.doc;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));
/** A gate a test opens: while a host holds it, every read waits for it (a slow host, or just a read on its way). */
const deferred = () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { gate, release };
};

/** A host in memory with the host's own history (round 21), its revision, and the calls it saw. Can be made silent (away). */
function fakeHost(initial: { rev: number; document: TownDocument } | null = null) {
  let history: TownHistory | null = initial ? createHistory(initial.document) : null;
  const answer = (rev: number) => ({ ok: true, rev, document: history ? currentDocument(history) : null, canUndo: history ? canUndo(history) : false, canRedo: history ? canRedo(history) : false });
  const host = {
    town: initial,
    away: false,
    /** While set, every read waits for it. */
    hold: null as null | Promise<void>,
    writes: [] as { op: HostTownOp; baseRev: number; document: TownDocument | null }[],
    reads: 0,
    listeners: new Set<(rev: number) => void>(),
    transport: {
      async read(): Promise<HostAnswer> {
        host.reads += 1;
        if (host.hold) await host.hold;
        if (host.away) return { status: 0, body: null };
        return host.town === null
          ? { status: 200, body: { installation: "i", rev: 0, updatedAt: null, document: null } }
          : { status: 200, body: { installation: "i", rev: host.town.rev, updatedAt: "t", document: host.town.document, canUndo: history ? canUndo(history) : false, canRedo: history ? canRedo(history) : false } };
      },
      async write(op: HostTownOp, document: TownDocument | null, baseRev: number): Promise<HostAnswer> {
        host.writes.push({ op, baseRev, document });
        if (host.away) return { status: 0, body: null };
        const current = host.town?.rev ?? 0;
        if (current !== baseRev) return { status: 409, body: { error: "town_conflict", rev: current, document: host.town?.document ?? null, canUndo: history ? canUndo(history) : false, canRedo: history ? canRedo(history) : false } };
        if (document === null && (op === "commit" || op === "amend")) return { status: 400, body: null };
        const was = history;
        history = op === "commit" ? (history ? commitHistory(history, document!) : createHistory(document!)) : op === "amend" ? amendHistory(history!, document!) : op === "undo" ? undoHistory(history!) : redoHistory(history!);
        if (history === was) return { status: 200, body: { ...answer(current), changed: false } };
        host.town = { rev: current + 1, document: structuredClone(currentDocument(history)) };
        return { status: 200, body: { ...answer(host.town.rev), changed: true } };
      },
    } satisfies HostTownTransport,
    /** Another browser writes straight to the host, and the host tells the streams. */
    elsewhere(document: TownDocument) {
      history = history ? commitHistory(history, document) : createHistory(document);
      host.town = { rev: (host.town?.rev ?? 0) + 1, document: structuredClone(currentDocument(history)) };
      for (const l of host.listeners) l(host.town.rev);
    },
    /** The host's town set from outside the history (a test's shortcut for "another revision is there"). */
    set(rev: number, document: TownDocument) {
      history = createHistory(document);
      host.town = { rev, document: structuredClone(document) };
    },
    onTown: (listener: (rev: number) => void) => {
      host.listeners.add(listener);
      return () => host.listeners.delete(listener);
    },
  };
  return host;
}

const make = (host: ReturnType<typeof fakeHost>, retryMs = 20) => {
  const local = createTownStore({ context: CONTEXT, indexedDB: null });
  const store = createHostTownStore({ local, transport: host.transport, context: CONTEXT, onTown: host.onTown, retryMs });
  return { local, store };
};

test("the host's town is taken on load; a commit goes up with its base revision; the host's revision is shown as the keeping", async () => {
  const host = fakeHost({ rev: 3, document: plot(plot(createTownStore({ context: CONTEXT, indexedDB: null }).state.doc, "a", 1), "b", 2) });
  const { store } = make(host);
  const doc = await store.load();
  assert.deepEqual(doc.plots.map((p) => p.slug), ["a", "b"], "the host's town, not the empty local one");
  assert.equal(store.rev, 3);
  assert.equal(store.state.storage, "host");
  assert.equal(store.state.storageNote, null);
  await store.commit(plot(doc, "c", 3));
  assert.deepEqual(host.writes.map((w) => [w.op, w.baseRev]), [["commit", 3]]);
  assert.equal(store.rev, 4);
  assert.equal(host.town?.document.plots.length, 3);
  assert.deepEqual([store.state.canUndo, store.state.canRedo], [true, false], "the host's word on its history");
  // An undo is the host's: no document goes up, the host steps back and answers the restored document, which the store shows.
  await store.undo();
  assert.deepEqual(host.writes.map((w) => [w.op, w.baseRev, w.document === null]), [["commit", 3, false], ["undo", 4, true]]);
  assert.equal(host.town?.document.plots.length, 2);
  assert.equal(store.rev, 5);
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["a", "b"]);
  assert.deepEqual([store.state.canUndo, store.state.canRedo], [false, true]);
  await store.redo();
  assert.deepEqual([store.rev, store.state.doc.plots.length, store.state.canRedo], [6, 3, false]);
});

test("a demo page's town is never the host's: townStoreFor hands back the browser's store and asks no transport", async () => {
  const host = fakeHost({ rev: 9, document: plot(createTownStore({ context: CONTEXT, indexedDB: null }).state.doc, "hosted", 1) });
  const local = createTownStore({ context: CONTEXT, indexedDB: null });
  let made = 0;
  const demo = townStoreFor({ live: false, local, make: () => (made += 1, createHostTownStore({ local, transport: host.transport, context: CONTEXT })) });
  assert.equal(demo, local);
  await demo.load();
  await demo.commit(plot(demo.state.doc, "mine", 2));
  await demo.undo();
  assert.deepEqual([made, host.reads, host.writes.length], [0, 0, 0], "nothing of the host is touched by a demo page");
  assert.equal(demo.state.doc.plots.length, 0);
  const live = townStoreFor({ live: true, local: createTownStore({ context: CONTEXT, indexedDB: null }), make: (own) => createHostTownStore({ local: own, transport: host.transport, context: CONTEXT }) });
  assert.deepEqual((await live.load()).plots.map((p) => p.slug), ["hosted"]);
});

test("a host without a town takes this browser's once; a host with one is never overwritten by an import", async () => {
  const host = fakeHost(null);
  const { local, store } = make(host);
  await local.load();
  await local.commit(plot(local.state.doc, "mine", 4));
  await store.load();
  assert.deepEqual(host.writes.map((w) => [w.baseRev, w.document?.plots[0]?.slug]), [[0, "mine"]], "imported once with baseRev 0");
  assert.equal(store.rev, 1);
  assert.equal(store.state.storageNote, IMPORTED_NOTE);
  // The world's own amends (a lot for a new building) keep the note; the person's next edit clears it.
  await store.amend((d) => plot(d, "allocated", 6));
  assert.equal(store.state.storageNote, IMPORTED_NOTE);
  await store.commit(plot(store.state.doc, "edited", 7));
  assert.equal(store.state.storageNote, null);
  // A second browser with an older local town meets a host that has one: the host's wins, nothing is imported.
  const other = fakeHost({ rev: 1, document: host.town!.document });
  const second = make(other);
  await second.local.load();
  await second.local.commit(plot(second.local.state.doc, "theirs", 9));
  const doc = await second.store.load();
  assert.deepEqual(doc.plots.map((p) => p.slug), ["mine", "allocated", "edited"]);
  assert.deepEqual(other.writes, [], "no import over a town the host has");
  assert.equal(second.store.rev, 1);
  // Two browsers racing to import: the second one's baseRev 0 is a conflict, and it takes the host's town.
  const race = fakeHost(null);
  const r = make(race);
  await r.local.load();
  await r.local.commit(plot(r.local.state.doc, "late", 5));
  race.transport.read = async () => ({ status: 200, body: { installation: "i", rev: 0, updatedAt: null, document: null } });
  race.set(1, plot(createTownStore({ context: CONTEXT, indexedDB: null }).state.doc, "first", 1));
  const taken = await r.store.load();
  assert.deepEqual(taken.plots.map((p) => p.slug), ["first"]);
  assert.equal(r.store.state.storageNote, CONFLICT_NOTE);
});

test("another browser's write first: the conflict takes the host's town and says so; the stream's town message refetches", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost({ rev: 1, document: empty });
  const { store } = make(host);
  await store.load();
  // Another browser writes revision 2; this one, still on 1, commits: 409, the host's town is loaded, the note said.
  host.set(2, plot(empty, "other", 7));
  await store.commit(plot(store.state.doc, "mine", 1));
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["other"]);
  assert.equal(store.rev, 2);
  assert.equal(store.state.storageNote, CONFLICT_NOTE);
  // The next successful write clears the note.
  await store.commit(plot(store.state.doc, "mine", 1));
  assert.equal(store.rev, 3);
  assert.equal(store.state.storageNote, null);
  // The host announces another browser's revision: refetched and taken, no undo step, our revision follows.
  const reads = host.reads;
  host.elsewhere(plot(host.town!.document, "third", 8));
  await flush();
  assert.ok(host.reads > reads, "refetched on the town message");
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug).sort(), ["mine", "other", "third"]);
  assert.equal(store.rev, 4);
  assert.equal(store.state.canUndo, true, "the host's history has steps back: the other browser's commits");
  // A revision the browser already has is ignored.
  for (const l of host.listeners) l(4);
  await flush();
  assert.equal(store.rev, 4);
});

test("offline: the browser keeps editing and says so; when the host answers again its town is offered as the next revision", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost({ rev: 1, document: empty });
  const { store } = make(host, 15);
  await store.load();
  assert.equal(store.state.storage, "host");
  host.away = true;
  await store.commit(plot(store.state.doc, "offline", 2));
  assert.equal(store.rev, null);
  assert.equal(store.state.storage, "memory", "the browser's own store's word while the host is away");
  // Offline, the browser's own steps serve: an undo and a redo here, nothing sent.
  await store.undo();
  assert.equal(store.state.doc.plots.length, 0);
  await store.redo();
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["offline"]);
  await store.commit(plot(store.state.doc, "more", 3));
  assert.deepEqual(host.writes.filter((w) => w.baseRev === 1).length, 1, "the first write failed; the next is kept for later");
  host.away = false;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(store.rev, 2, "back: the browser's town went up as the next revision");
  assert.deepEqual((host.town as { document: TownDocument } | null)?.document.plots.map((p) => p.slug), ["offline", "more"]);
  assert.equal(store.state.storage, "host");
  assert.equal(store.state.storageNote, null);
  // Away again, an edit here, and another browser writes meanwhile: the host's town wins when it is back, and it is said.
  host.away = true;
  await store.commit(plot(store.state.doc, "lost", 4));
  host.set(3, plot(empty, "elsewhere", 6));
  host.away = false;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(store.rev, 3);
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["elsewhere"]);
  assert.equal(store.state.storageNote, CONFLICT_NOTE);
});

test("round 22: reads are single file and never go backwards; a town message during the load makes one more read, not two side by side", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost({ rev: 1, document: empty });
  // A slow first read: the answer of revision 1 arrives after a later write's answer (revision 2) would.
  let release: (() => void) | null = null;
  const slow = new Promise<void>((resolve) => (release = resolve));
  const read = host.transport.read.bind(host.transport);
  let reads = 0;
  host.transport.read = async () => {
    reads += 1;
    const answer = await read();
    if (reads === 1) await slow;
    return answer;
  };
  const { store } = make(host);
  const loading = store.load();
  await flush();
  // Meanwhile the host announces two more revisions (another browser): they coalesce into one more read after the first.
  host.elsewhere(plot(empty, "a", 1));
  host.elsewhere(plot(plot(empty, "a", 1), "b", 2));
  await flush();
  assert.equal(reads, 1, "the second ask waits for the first read");
  release!();
  await loading;
  await flush();
  await flush();
  assert.equal(reads, 2, "one more read, not one per message");
  assert.equal(store.rev, 3);
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug).sort(), ["a", "b"]);
  // An answer older than what the browser has is ignored: a stale read lands after a write's answer.
  host.transport.read = async () => ({ status: 200, body: { installation: "i", rev: 1, updatedAt: "t", document: empty, canUndo: false, canRedo: false } });
  await store.sync();
  assert.equal(store.rev, 3, "the stale revision did not take the town back");
  assert.deepEqual(store.state.doc.plots.length, 2);
});

test("round 22: the host's echo of a browser's own import starts no second import and keeps the imported note", async () => {
  const host = fakeHost(null);
  const { local, store } = make(host);
  await local.load();
  await local.commit(plot(local.state.doc, "mine", 4));
  // The host tells the tabs about revision 1 before the import's answer is back (the stream is faster than the response).
  const write = host.transport.write.bind(host.transport);
  host.transport.write = async (op, document, baseRev) => {
    const answer = await write(op, document, baseRev);
    if (baseRev === 0) for (const l of host.listeners) l(1);
    return answer;
  };
  await store.load();
  await flush();
  await flush();
  assert.deepEqual(host.writes.map((w) => [w.op, w.baseRev]), [["commit", 0]], "one import, no second one from the echo");
  assert.equal(store.state.storageNote, IMPORTED_NOTE);
  assert.equal(store.rev, 1);
});

test("round 22: the stream coming back up reads the town again, so a town message missed meanwhile is not lost", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost({ rev: 1, document: empty });
  const connected = new Set<() => void>();
  const local = createTownStore({ context: CONTEXT, indexedDB: null });
  const store = createHostTownStore({ local, transport: host.transport, context: CONTEXT, onTown: host.onTown, onConnected: (l) => (connected.add(l), () => connected.delete(l)), retryMs: 20 });
  await store.load();
  // Another browser writes while this tab's stream was down: no message reaches it.
  host.town = { rev: 2, document: plot(empty, "missed", 3) };
  host.set(2, plot(empty, "missed", 3));
  await flush();
  assert.equal(store.rev, 1, "nothing heard");
  for (const l of connected) l();
  await flush();
  await flush();
  assert.equal(store.rev, 2, "read again on reconnect");
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["missed"]);
});

test("round 22: the world's own amend during the load never carries the empty town over the host's; it is derived on the host's town once read", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const hosted = { ...plot(empty, "web", 1), zones: [{ id: "east", name: "East", order: 0 }] } as TownDocument;
  const host = fakeHost({ rev: 1, document: hosted });
  let release: (() => void) | null = null;
  const slow = new Promise<void>((resolve) => (release = resolve));
  const read = host.transport.read.bind(host.transport);
  host.transport.read = async () => {
    const answer = await read();
    await slow;
    return answer;
  };
  const { store } = make(host);
  const loading = store.load();
  await flush();
  // The runtime gives a new building its lot on the first publish of the local store: an amend on what it shows then (nothing).
  const amending = store.amend((doc) => (doc.plots.some((p) => p.slug === "api") ? null : plot(doc, "api", 2)));
  await flush();
  release!();
  await loading;
  await amending;
  await flush();
  assert.deepEqual(host.writes.map((w) => [w.op, w.baseRev, (w.document?.zones ?? []).map((z) => z.id), w.document?.plots.map((p) => p.slug)]), [["amend", 1, ["east"], ["web", "api"]]], "one amend, on the host's town, with its zone kept");
  assert.equal(store.rev, 2);
  assert.deepEqual(store.state.doc.zones?.map((z) => z.id), ["east"]);
  assert.equal(store.state.storageNote, null, "the world's own record is no person's loss: nothing is said");
  // The same amend before the host is even asked (the runtime's first allocation): kept out of the way, nothing said.
  const fresh = fakeHost({ rev: 1, document: hosted });
  const f = make(fresh);
  const load2 = f.store.load();
  void f.store.amend((doc) => (doc.plots.some((p) => p.slug === "api") ? null : plot(doc, "api", 2)));
  await load2;
  await flush();
  await flush();
  assert.equal(f.store.state.storageNote, null);
  assert.deepEqual(f.store.state.doc.zones?.map((z) => z.id), ["east"]);
});

test("round 22: a person's edit made on a revision the host has since left is kept out, the host's town loaded and said", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost({ rev: 1, document: empty });
  const { store } = make(host);
  await store.load();
  // The first commit is on its way; the host announces another browser's revision meanwhile; a second edit is made on
  // the picture of before that announcement is read.
  const first = store.commit(plot(store.state.doc, "mine", 1));
  host.elsewhere(plot(plot(empty, "mine", 1), "theirs", 5));
  const second = store.commit(plot(store.state.doc, "late", 2));
  await first;
  await second;
  await flush();
  await flush();
  // Both edits were made on revision 1, which the other browser's write left behind before either was sent: neither
  // reaches the host (a 409 would have met them anyway), the host's town is shown and the note says so.
  assert.equal(host.writes.length, 0, "no edit made on the old revision reached the host");
  assert.equal(store.state.storageNote, CONFLICT_NOTE);
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug).sort(), ["mine", "theirs"]);
  assert.equal(store.rev, 2);
});

test("round 22: an amend derived while the host's town arrives is derived again on it, never sent over it with the old picture", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const hosted = { ...plot(empty, "web", 1), zones: [{ id: "east", name: "East", order: 0 }] } as TownDocument;
  const host = fakeHost({ rev: 1, document: hosted });
  const { store } = make(host);
  // The runtime's allocation runs as soon as the browser's store has loaded, before the host is asked (a fast host).
  const amending = store.amend((doc) => (doc.plots.some((p) => p.slug === "api") ? null : plot(doc, "api", 2)));
  const loading = store.load();
  await Promise.all([amending, loading]);
  await flush();
  await flush();
  for (const w of host.writes) assert.equal((w.document?.zones ?? []).length, 1, `every write carries the host's zone: ${w.op} on ${w.baseRev}`);
  assert.deepEqual(store.state.doc.zones?.map((z) => z.id), ["east"]);
  assert.ok(store.state.doc.plots.some((p) => p.slug === "web"));
  assert.deepEqual(host.town?.document.zones?.map((z) => z.id), ["east"], "the host's town still has its zone");
});

test("round 27 (review F1): an edit made while the first read is on its way is kept out when the host's town differs from the picture it was made on; the host's town stands and it is said", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost({ rev: 5, document: plot(plot(empty, "a", 1), "b", 2) });
  const { store } = make(host);
  const held = deferred();
  host.hold = held.gate;
  const loading = store.load();
  await flush();
  // The person edits before the host's town arrived (a fresh browser: its own town is empty).
  const edit = store.commit(plot(store.state.doc, "mine", 9));
  await flush();
  held.release();
  host.hold = null;
  await loading;
  await edit;
  await flush();
  assert.equal(host.writes.length, 0, "the stale town never goes up over the host's");
  assert.deepEqual(host.town?.document.plots.map((p) => p.slug), ["a", "b"], "the host's plots survive");
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["a", "b"], "the browser shows what the host holds");
  assert.equal(store.rev, 5);
  assert.equal(store.state.storageNote, CONFLICT_NOTE, "the edit was made on a town the host had replaced: said");
  // The same picture on the host as here (an empty town on revision 5): an edit during the read is no loss and goes up.
  const alike = fakeHost({ rev: 5, document: empty });
  const same = make(alike);
  const gate = deferred();
  alike.hold = gate.gate;
  const load2 = same.store.load();
  await flush();
  const edit2 = same.store.commit(plot(same.store.state.doc, "mine", 9));
  await flush();
  gate.release();
  alike.hold = null;
  await load2;
  await edit2;
  assert.deepEqual(alike.writes.map((w) => [w.op, w.baseRev, w.document?.plots.map((p) => p.slug)]), [["commit", 5, ["mine"]]]);
  assert.equal(same.store.state.storageNote, null);
  // Offline, the browser's own undo while the retry read brings another browser's town: kept out the same way.
  const other = fakeHost({ rev: 1, document: empty });
  const o = make(other, 20);
  await o.store.load();
  other.away = true;
  await o.store.commit(plot(o.store.state.doc, "offline", 2));
  other.away = false;
  other.set(2, plot(empty, "elsewhere", 6));
  const slow = deferred();
  other.hold = slow.gate;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(other.reads, 2, "the retry read is on its way");
  const undone = o.store.undo();
  await flush();
  slow.release();
  other.hold = null;
  await undone;
  await flush();
  assert.equal(other.writes.filter((w) => w.baseRev === 2).length, 0, "the offline undo's town never goes up over the other browser's");
  assert.deepEqual(o.store.state.doc.plots.map((p) => p.slug), ["elsewhere"]);
  assert.equal(o.store.state.storageNote, CONFLICT_NOTE);
});

test("round 27 (review F2): back from offline, an edit made while the retry read is on its way goes up first and carries the offline edit; nothing is said of another browser", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost({ rev: 5, document: plot(empty, "a", 1) });
  const { store } = make(host, 30);
  const doc = await store.load();
  host.away = true;
  await store.commit(plot(doc, "offline-edit", 2));
  assert.equal(store.rev, null, "offline");
  // The host is back; its read is slow; the person edits meanwhile.
  host.away = false;
  const held = deferred();
  host.hold = held.gate;
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(host.reads, 2, "the retry read is on its way");
  const edit = store.commit(plot(store.state.doc, "second-edit", 3));
  await flush();
  held.release();
  host.hold = null;
  await edit;
  await flush();
  await flush();
  assert.deepEqual(host.writes.map((w) => [w.op, w.baseRev, w.document?.plots.map((p) => p.slug)]), [["commit", 5, ["a", "offline-edit"]], ["commit", 5, ["a", "offline-edit", "second-edit"]]], "the offline write that failed, then the one edit that carries everything; no offer after it");
  assert.deepEqual(host.town?.document.plots.map((p) => p.slug), ["a", "offline-edit", "second-edit"], "nothing is lost");
  assert.equal(store.rev, 6);
  assert.equal(store.state.storageNote, null, "nobody else wrote, so nothing is said");
});

test("round 27 (review F7): the world's own record pending through an offline spell goes up as an amend, a person's as a commit", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost({ rev: 1, document: plot(empty, "web", 1) });
  const { store } = make(host, 15);
  await store.load();
  host.away = true;
  await store.amend((d) => plot(d, "api", 2));
  assert.equal(store.rev, null);
  host.away = false;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(host.writes.filter((w) => w.baseRev === 1).map((w) => w.op), ["amend", "amend"], "the failed try, then the offer: both the world's own record");
  assert.equal(store.rev, 2);
  assert.deepEqual([store.state.canUndo, store.state.canRedo], [false, false], "no undo step on the host for a lot the world gave");
  // A person's edit in the same spell makes the offer a commit: the host's history has its step.
  host.away = true;
  await store.amend((d) => plot(d, "db", 3));
  await store.commit(plot(store.state.doc, "mine", 4));
  host.away = false;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(host.writes.at(-1)?.op, "commit");
  assert.equal(store.rev, 3);
  assert.equal(store.state.canUndo, true);
});

test("round 27 (review F4): a host town this browser cannot read is offline with a note of its own and the retry; a readable one is taken when it comes", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost({ rev: 3, document: { ...empty, format: "crewhub-town/99" } as unknown as TownDocument });
  const { store } = make(host, 20);
  await store.load();
  assert.equal(store.rev, null, "on no revision");
  assert.equal(store.state.storage, "memory");
  assert.equal(store.state.storageNote, UNREADABLE_NOTE);
  // Edits stay here meanwhile, nothing sent.
  await store.commit(plot(store.state.doc, "mine", 1));
  assert.equal(host.writes.length, 0);
  // The host's town is readable again (a host update): the retry takes it.
  host.set(4, plot(empty, "theirs", 2));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(host.reads >= 2, "asked again");
  assert.equal(store.rev, 4);
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["theirs"]);
  assert.equal(store.state.storage, "host");
});

test("round 27 (r27-townback): a host back at the revision this browser left it, with the town as it is here, gets no commit (an identical revision would eat the next undo)", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const hosted = { ...plot(empty, "web", 1), zones: [{ id: "zone-1", name: "Zone 1", order: 0 }] } as TownDocument;
  const host = fakeHost({ rev: 1, document: hosted });
  const lines: string[] = [];
  const local = createTownStore({ context: CONTEXT, indexedDB: null });
  const store = createHostTownStore({ local, transport: host.transport, context: CONTEXT, onTown: host.onTown, retryMs: 15, log: (line) => lines.push(line) });
  await store.load();
  await store.commit({ ...store.state.doc, zones: [...(store.state.doc.zones ?? []), { id: "zone-2", name: "Zone 2", order: 1 }] } as TownDocument);
  assert.equal(store.rev, 2);
  const writesAfterEdit = host.writes.length;
  // The host goes away; a person adds a zone and undoes it here (the browser's own steps while the host is away).
  host.away = true;
  await store.commit({ ...store.state.doc, zones: [...(store.state.doc.zones ?? []), { id: "zone-3", name: "Zone 3", order: 2 }] } as TownDocument);
  assert.equal(store.rev, null);
  await store.undo();
  assert.deepEqual(store.state.doc.zones?.map((z) => z.id), ["zone-1", "zone-2"], "undone here: the town is the host's revision 2 again");
  // The host answers again at revision 2, as this browser left it: nothing of ours is new, so nothing goes up.
  host.away = false;
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(store.rev, 2);
  assert.deepEqual(host.writes.slice(writesAfterEdit).map((w) => [w.op, w.baseRev, w.document === null ? null : w.document.zones?.map((z) => z.id)]), [["commit", 2, ["zone-1", "zone-2", "zone-3"]]], `only the failed write of the away spell; the log: ${lines.join(" | ")}`);
  assert.equal(host.town?.rev, 2, "the host's revision stands: an undo now takes Zone 2 away, not an identical copy");
  assert.equal(store.state.storageNote, null);
  assert.ok(lines.some((l) => /with the town as it is here: nothing to send/.test(l)), `the log says why: ${lines.join(" | ")}`);
  // The world's own record of nothing new (an allocation kept before the load, as the regress town group met it) sends nothing either.
  const fresh = fakeHost({ rev: 1, document: hosted });
  const f = make(fresh, 15);
  void f.store.amend((doc) => (doc.plots.some((p) => p.slug === "web") ? null : plot(doc, "web", 1)));
  await f.store.load();
  await flush();
  fresh.away = true;
  await f.store.amend((doc) => (doc.plots.some((p) => p.slug === "web") ? null : plot(doc, "web", 1)));
  assert.equal(f.store.rev, 1, "an amend of nothing new goes nowhere, even with the host away");
  // An amend that records something new while away: offered on the come-back, as an amend, once.
  await f.store.amend((doc) => plot(doc, "api", 2));
  assert.equal(f.store.rev, null);
  fresh.away = false;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(fresh.writes.map((w) => [w.op, w.baseRev]), [["amend", 1], ["amend", 1]], "the failed try, then the one offer");
  assert.equal(fresh.town?.rev, 2);
});

/* Round 33, the mutation spot check: three guards of the host town the tests let slip (survivors 2, 4 and 5 of r33-mut-state). */

/** The same document with its keys in another order at every level, as another browser's build or an import serialises it. */
const reordered = <T>(value: T): T =>
  Array.isArray(value)
    ? (value.map(reordered) as unknown as T)
    : value !== null && typeof value === "object"
      ? (Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([k, v]) => [k, reordered(v)])) as T)
      : value;

test("round 33: the host's copy of the same town with its keys in another order is the same town: taken as nothing new on a read, and a come-back sends nothing", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const hosted = { ...plot(empty, "web", 1), zones: [{ id: "zone-1", name: "Zone 1", order: 0 }] } as TownDocument;
  const host = fakeHost({ rev: 1, document: hosted });
  const lines: string[] = [];
  const connected = new Set<() => void>();
  const local = createTownStore({ context: CONTEXT, indexedDB: null });
  const store = createHostTownStore({ local, transport: host.transport, context: CONTEXT, onTown: host.onTown, onConnected: (l) => (connected.add(l), () => connected.delete(l)), retryMs: 15, log: (line) => lines.push(line) });
  await store.load();
  await store.commit({ ...store.state.doc, zones: [...(store.state.doc.zones ?? []), { id: "zone-2", name: "Zone 2", order: 1 }] } as TownDocument);
  assert.equal(store.rev, 2);
  // The host now serialises that revision with every key in another order (the same town).
  host.set(2, reordered(host.town!.document));
  const taken = () => lines.filter((l) => /taken from the host/.test(l)).length;
  const takenBefore = taken();
  for (const l of connected) l();
  await flush();
  await flush();
  assert.equal(store.rev, 2);
  assert.equal(taken(), takenBefore, `a read of the same town in another key order takes nothing: ${lines.join(" | ")}`);
  // The host goes away; a zone is added and undone here; the host is back at the revision this browser left it.
  const writesBefore = host.writes.length;
  host.away = true;
  await store.commit({ ...store.state.doc, zones: [...(store.state.doc.zones ?? []), { id: "zone-3", name: "Zone 3", order: 2 }] } as TownDocument);
  await store.undo();
  assert.deepEqual(store.state.doc.zones?.map((z) => z.id), ["zone-1", "zone-2"]);
  host.away = false;
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(store.rev, 2);
  assert.deepEqual(host.writes.slice(writesBefore).map((w) => [w.op, w.baseRev]), [["commit", 2]], `only the failed write of the away spell, no identical revision: ${lines.join(" | ")}`);
  assert.equal(host.town?.rev, 2, "the host's revision stands");
  assert.ok(lines.some((l) => /with the town as it is here: nothing to send/.test(l)), lines.join(" | "));
});

test("round 33: the host's word on the revision this browser already has (the echo of its own write after the answer) starts no read", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost({ rev: 1, document: empty });
  const { store } = make(host);
  await store.load();
  await store.commit(plot(store.state.doc, "mine", 2));
  assert.equal(store.rev, 2);
  const reads = host.reads;
  for (const l of host.listeners) l(2);
  await flush();
  await flush();
  assert.equal(host.reads, reads, "revision 2 is the one this browser wrote: nothing to fetch");
  // An older word (a message delayed behind the answer) starts none either; a newer one does.
  for (const l of host.listeners) l(1);
  await flush();
  assert.equal(host.reads, reads);
  host.elsewhere(plot(empty, "theirs", 5));
  await flush();
  await flush();
  assert.equal(host.reads, reads + 1, "revision 3 is new: one read");
  assert.equal(store.rev, 3);
});

test("round 33: a read that answers the town already shown changes nothing in the browser's store: no amend, no publish, no 'taken' line", async () => {
  const empty = createTownStore({ context: CONTEXT, indexedDB: null }).state.doc;
  const host = fakeHost({ rev: 1, document: plot(empty, "web", 1) });
  const lines: string[] = [];
  const connected = new Set<() => void>();
  const local = createTownStore({ context: CONTEXT, indexedDB: null });
  const store = createHostTownStore({ local, transport: host.transport, context: CONTEXT, onTown: host.onTown, onConnected: (l) => (connected.add(l), () => connected.delete(l)), retryMs: 15, log: (line) => lines.push(line) });
  await store.load();
  assert.equal(lines.filter((l) => /taken from the host/.test(l)).length, 1, "the first read takes the host's town");
  let published = 0;
  const stop = local.subscribe(() => (published += 1));
  const shown = store.state.doc;
  // The stream comes back up: the town is read again and the host answers the very town shown here.
  for (const l of connected) l();
  await flush();
  await flush();
  stop();
  assert.equal(host.reads, 2, "read again on reconnect");
  assert.equal(published, 0, "the browser's store was not written: nothing changed");
  assert.equal(store.state.doc, shown, "the document shown is the same object: no amend took place");
  assert.equal(lines.filter((l) => /taken from the host/.test(l)).length, 1, `nothing new was taken: ${lines.join(" | ")}`);
  assert.equal(store.rev, 1);
});
