/* The town kept by the host (state/hostTown.ts): read and taken on load; imported once when the host has none, never
   over a town the host has; every commit, undo and amend sent with its base revision; a conflict takes the host's town
   and says so; the host's `town` message makes the browser refetch; offline the browser keeps editing and offers its
   town again when the host answers. A fake transport and the browser store in memory. */
import assert from "node:assert/strict";
import test from "node:test";
import { applyEdit, type TownContext, type TownDocument } from "@crewhub/world-model";
import type { HostAnswer } from "@crewhub/loops-client";
import { CONFLICT_NOTE, IMPORTED_NOTE, createHostTownStore, type HostTownTransport } from "../src/state/hostTown.ts";
import { createTownStore } from "../src/state/townStore.ts";

const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: [] };
const plot = (doc: TownDocument, slug: string, x: number): TownDocument => {
  const result = applyEdit(doc, { type: "set-plot", slug, cell: { x, z: 0 } }, CONTEXT);
  assert.ok(result.ok);
  return result.doc;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

/** A host in memory: one town, its revision, and the calls it saw. Can be made silent (away). */
function fakeHost(initial: { rev: number; document: TownDocument } | null = null) {
  const host = {
    town: initial,
    away: false,
    writes: [] as { baseRev: number; document: TownDocument }[],
    reads: 0,
    listeners: new Set<(rev: number) => void>(),
    transport: {
      async read(): Promise<HostAnswer> {
        host.reads += 1;
        if (host.away) return { status: 0, body: null };
        return host.town === null ? { status: 404, body: { error: "no_town" } } : { status: 200, body: { installation: "i", rev: host.town.rev, updatedAt: "t", document: host.town.document } };
      },
      async write(document: TownDocument, baseRev: number): Promise<HostAnswer> {
        host.writes.push({ baseRev, document });
        if (host.away) return { status: 0, body: null };
        const current = host.town?.rev ?? 0;
        if (current !== baseRev) return { status: 409, body: { error: "town_conflict", rev: current, document: host.town?.document ?? null } };
        host.town = { rev: current + 1, document: structuredClone(document) };
        return { status: 200, body: { ok: true, rev: host.town.rev } };
      },
    } satisfies HostTownTransport,
    /** Another browser writes straight to the host, and the host tells the streams. */
    elsewhere(document: TownDocument) {
      host.town = { rev: (host.town?.rev ?? 0) + 1, document: structuredClone(document) };
      for (const l of host.listeners) l(host.town.rev);
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
  assert.deepEqual(host.writes.map((w) => w.baseRev), [3]);
  assert.equal(store.rev, 4);
  assert.equal(host.town?.document.plots.length, 3);
  // An undo is a revision too (the undo history is the browser's; the host keeps the current town).
  await store.undo();
  assert.deepEqual(host.writes.map((w) => w.baseRev), [3, 4]);
  assert.equal(host.town?.document.plots.length, 2);
  assert.equal(store.rev, 5);
});

test("a host without a town takes this browser's once; a host with one is never overwritten by an import", async () => {
  const host = fakeHost(null);
  const { local, store } = make(host);
  await local.load();
  await local.commit(plot(local.state.doc, "mine", 4));
  await store.load();
  assert.deepEqual(host.writes.map((w) => [w.baseRev, w.document.plots[0]?.slug]), [[0, "mine"]], "imported once with baseRev 0");
  assert.equal(store.rev, 1);
  assert.equal(store.state.storageNote, IMPORTED_NOTE);
  // A second browser with an older local town meets a host that has one: the host's wins, nothing is imported.
  const other = fakeHost({ rev: 1, document: host.town!.document });
  const second = make(other);
  await second.local.load();
  await second.local.commit(plot(second.local.state.doc, "theirs", 9));
  const doc = await second.store.load();
  assert.deepEqual(doc.plots.map((p) => p.slug), ["mine"]);
  assert.deepEqual(other.writes, [], "no import over a town the host has");
  assert.equal(second.store.rev, 1);
  // Two browsers racing to import: the second one's baseRev 0 is a conflict, and it takes the host's town.
  const race = fakeHost(null);
  const r = make(race);
  await r.local.load();
  await r.local.commit(plot(r.local.state.doc, "late", 5));
  race.transport.read = async () => ({ status: 404, body: { error: "no_town" } });
  race.town = { rev: 1, document: plot(createTownStore({ context: CONTEXT, indexedDB: null }).state.doc, "first", 1) };
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
  host.town = { rev: 2, document: plot(empty, "other", 7) };
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
  assert.equal(store.state.canUndo, true, "the browser's undo history is kept; the host's document replaced the current revision");
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
  await store.commit(plot(store.state.doc, "more", 3));
  assert.deepEqual(host.writes.filter((w) => w.baseRev === 1).length, 1, "the first write failed; the next is kept for later");
  host.away = false;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(store.rev, 2, "back: the browser's town went up as the next revision");
  assert.deepEqual(host.town?.document.plots.map((p) => p.slug), ["offline", "more"]);
  assert.equal(store.state.storage, "host");
  assert.equal(store.state.storageNote, null);
  // Away again, an edit here, and another browser writes meanwhile: the host's town wins when it is back, and it is said.
  host.away = true;
  await store.commit(plot(store.state.doc, "lost", 4));
  host.town = { rev: 3, document: plot(empty, "elsewhere", 6) };
  host.away = false;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(store.rev, 3);
  assert.deepEqual(store.state.doc.plots.map((p) => p.slug), ["elsewhere"]);
  assert.equal(store.state.storageNote, CONFLICT_NOTE);
});
