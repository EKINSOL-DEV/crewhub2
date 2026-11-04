/**
 * The archive memory through its interface (archiveMemory.ts, round 59d C5): fact sequences in (a link to a loops,
 * the stream's archive and restore events, a snapshot's report), the set, its source and time, and the store's saves
 * out. An in-memory store stands in for the file (`archiveStore.ts` has its own test); no host, no loops, no polling.
 * The host's wiring of the same facts stays pinned by archiveMemory.test.ts and archiveSwitch.test.ts. Since round 61
 * (A5's second race) a link's facts go through the handle `linked()` returns, and a handle whose link is gone is deaf.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type ArchiveLink, belongsTo, createArchiveMemory } from "../src/archiveMemory.ts";
import type { ArchiveRecord, ArchiveStore } from "../src/archiveStore.ts";
import type { Envelope } from "@crewhub/loops-client";

const A = "http://127.0.0.1:41001";
const B = "/tmp/loops-b.sock";
const T0 = "2026-11-04T10:00:00.000Z";

/** A store in memory: what it holds, and every save in order. `fail` makes a save throw. */
function memoryStore(initial: ArchiveRecord | null = null) {
  const store = {
    file: "/config/archived.json",
    disk: initial,
    saves: [] as ArchiveRecord[],
    fail: false,
    read: () => store.disk,
    save(record: ArchiveRecord) {
      if (store.fail) throw new Error("disk full");
      store.saves.push(record);
      store.disk = record;
    },
  };
  return store satisfies ArchiveStore;
}

/**
 * What a snapshot makes of the archived getter's answer: the slugs in first-occurrence order (the snapshot dedups them,
 * and that order is its read order), and the flag. A getter that dedups itself answers the same (review-a1 2).
 */
const asked = (archived: ReturnType<ArchiveLink["forSnapshot"]>) => {
  const known = archived();
  return { slugs: [...new Set(known.slugs)], remembered: known.remembered };
};

/** A memory over `store` (or none: this run only), a clock that ticks per change. */
function memory(store?: ArchiveStore) {
  const lines: string[] = [];
  let tick = 0;
  const m = createArchiveMemory({
    ...(store === undefined ? {} : { store }),
    log: (line) => lines.push(line),
    now: () => `2026-11-04T12:00:0${tick++}.000Z`,
  });
  return { m, lines };
}

/** An event on the link's stream as the ear hands it over: `project` as given, which may be anything on the wire. */
const heard = (type: string, project: unknown): Envelope => ({ v: 1, seq: 1, ts: T0, type, project: project as Envelope["project"], ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: {} });
/** The line loops would have to send to leave the key out: `undefined` is no JSON, so the key is gone after a round trip. */
const bare = (type: string): Envelope => JSON.parse(JSON.stringify({ ...heard(type, "gone"), project: undefined })) as Envelope;

describe("the archive memory, fed facts", () => {
  it("ignores an event with no project key and says so: nothing changes, nothing throws (round 54's fuzz finding)", () => {
    const { m, lines } = memory(memoryStore());
    const a = m.linked(A);
    assert.equal("project" in bare("project.archived"), false, "the vehicle: no key at all");
    a.heard(bare("project.archived"));
    a.heard(bare("ticket.updated"));
    assert.deepEqual(lines, ["the archive memory ignores event 1 (project.archived): it has no project key", "the archive memory ignores event 1 (ticket.updated): it has no project key"]);
    assert.deepEqual(asked(a.forSnapshot()), { slugs: [], remembered: false });
    assert.deepEqual(m.state(true), { source: "none", count: 0, slugs: [] });
    a.heard(heard("project.archived", null));
    assert.equal(m.state(false).at, undefined, "null is nothing: not even a time learnt, no file written");
    a.heard(heard("project.archived", 5));
    a.heard(heard("project.archived", { slug: "atlas", key: "AT" }));
    assert.equal(lines.filter((l) => /has no project key/.test(l)).length, 2, "a project that is null or no object is no warning, as before");
    assert.deepEqual(asked(a.forSnapshot()), { slugs: ["atlas"], remembered: true });
  });

  it("knows nothing before a fact: source none, no time, no slugs", () => {
    const { m, lines } = memory(memoryStore());
    assert.deepEqual(m.state(false), { source: "none", count: 0 });
    m.linked(A);
    assert.deepEqual(m.state(true), { source: "none", count: 0, slugs: [] });
    assert.deepEqual(lines, []);
  });

  it("keeps the slugs archived over the link's own stream: an archive adds one, a restore takes it back, other events add none", () => {
    // Moved from stream.test.ts ("knows the slugs archived over its own stream"), where the upstream kept this set.
    const { m } = memory(memoryStore());
    const a = m.linked(A);
    a.heard(heard("ticket.created", { slug: "beacon", key: "K" }));
    a.heard(heard("project.archived", { slug: "atlas", key: "K" }));
    a.heard(heard("project.archived", { slug: "old", key: "K" }));
    a.heard(heard("project.restored", { slug: "old", key: "K" }));
    assert.deepEqual(asked(a.forSnapshot()), { slugs: ["atlas"], remembered: true });
    assert.deepEqual(m.state(true), { source: "none", count: 1, at: "2026-11-04T12:00:02.000Z", slugs: ["atlas"] });
  });

  it("keeps only slugs that are path segments, in the link's set and in the set (round 34)", () => {
    // Replaces fuzzStream.test.ts's "slugs stay slugs" on the upstream's set: the fuzz now feeds this module.
    const { m } = memory(memoryStore());
    const a = m.linked(A);
    for (const slug of ["a/b", "x y", "", "s".repeat(129), 7, undefined, null]) a.heard(heard("project.archived", { slug, key: "K" }));
    a.heard(heard("project.archived", { slug: "old", key: "K" }));
    assert.deepEqual(asked(a.forSnapshot()), { slugs: ["old"], remembered: true });
    assert.deepEqual(m.state(true).slugs, ["old"]);
    a.reported({ source: "log", slugs: ["c/d", "old", "old"] });
    assert.deepEqual(m.state(true).slugs, ["old"]);
  });

  it("starts the link's own stream set empty on every link, keeps what the same loops taught, and the old link's handle is deaf", () => {
    const { m } = memory(memoryStore());
    const a = m.linked(A);
    a.heard(heard("project.archived", { slug: "atlas", key: "K" }));
    const before = a.forSnapshot();
    const again = m.linked(A); // the same loops again (a new key, a stream refused): a new link, the set kept
    assert.deepEqual(m.state(true).slugs, ["atlas"], "the same target keeps what it learnt");
    assert.deepEqual(asked(before), { slugs: ["atlas"], remembered: true }, "a snapshot of the old link keeps the set it was given");
    a.heard(heard("project.archived", { slug: "zeta", key: "K" })); // through the old link's handle: dropped
    assert.deepEqual(m.state(true).slugs, ["atlas"]);
    again.heard(heard("project.archived", { slug: "beacon", key: "K" }));
    assert.deepEqual(asked(before), { slugs: ["atlas"], remembered: true });
    assert.deepEqual(asked(again.forSnapshot()), { slugs: ["beacon", "atlas"], remembered: true }, "the new link's own stream set first: beacon, which it heard; atlas is the set");
  });

  it("hands out the set as it stood: a change makes a new set, the live link set grows in place", () => {
    const { m } = memory(memoryStore());
    const a = m.linked(A);
    const archived = a.forSnapshot();
    a.heard(heard("project.archived", { slug: "atlas", key: "K" }));
    assert.deepEqual(asked(archived), { slugs: ["atlas"], remembered: false }, "the set it started with stays empty (nothing remembered); the link's stream set, read when it gets to the archived projects, has atlas");
  });

  it("answers a snapshot's archived getter: the link's stream set as it is when asked, then the set as the assembly started, and whether that had any (round 60, A1)", () => {
    const { m } = memory(memoryStore());
    const a = m.linked(A);
    a.reported({ source: "log", slugs: ["old"] });
    a.heard(heard("project.archived", { slug: "atlas", key: "K" }));
    const archived = a.forSnapshot();
    a.heard(heard("project.archived", { slug: "beacon", key: "K" })); // heard during the assembly: the stream set counts it
    a.reported({ source: "log", slugs: [] }); // another snapshot's report: this assembly keeps the set it started with
    assert.deepEqual(asked(archived), { slugs: ["atlas", "beacon", "old"], remembered: true });
    assert.deepEqual(asked(a.forSnapshot()), { slugs: ["atlas", "beacon"], remembered: false }, "an assembly starting now: the set is empty");
  });

  it("keeps a snapshot's archived getter on the link it started on when a relink comes during the assembly (round 60, A1)", () => {
    const { m } = memory(memoryStore());
    const a = m.linked(A);
    a.reported({ source: "log", slugs: ["old"] });
    a.heard(heard("project.archived", { slug: "atlas", key: "K" }));
    const archived = a.forSnapshot();
    const b = m.linked(B);
    b.heard(heard("project.archived", { slug: "beacon", key: "K" }));
    assert.deepEqual(asked(archived), { slugs: ["atlas", "old"], remembered: true }, "B's archive is not A's assembly's");
  });

  it("uses this loops' memory on disk: the set, its time, source remembered, and says so", () => {
    const store = memoryStore({ slugs: ["old"], at: "2026-10-21T04:56:46.430Z", target: A });
    const { m, lines } = memory(store);
    m.linked(A);
    assert.deepEqual(m.state(true), { source: "remembered", count: 1, at: "2026-10-21T04:56:46.430Z", slugs: ["old"] });
    assert.deepEqual(lines, ["remembered 1 archived project from /config/archived.json (learnt 2026-10-21 04:56:46 UTC)"]);
    assert.deepEqual(store.saves, [], "nothing changed: nothing written");
  });

  it("takes a memory without a target (the old format) as this loops' own, with an unknown time said as such", () => {
    const { m, lines } = memory(memoryStore({ slugs: ["old", "older"], at: "" }));
    m.linked(A);
    assert.deepEqual(m.state(true), { source: "remembered", count: 2, at: "", slugs: ["old", "older"] });
    assert.deepEqual(lines, ["remembered 2 archived projects from /config/archived.json (learnt at an unknown time, from an unnamed crewhub-loops)"]);
  });

  it("ignores another loops' memory, says so, and never writes over it until this loops' own set is learnt", () => {
    const store = memoryStore({ slugs: ["other"], at: T0, target: B });
    const { m, lines } = memory(store);
    const a = m.linked(A);
    assert.deepEqual(m.state(true), { source: "none", count: 0, slugs: [] });
    assert.deepEqual(lines, [`/config/archived.json remembers ${B}, not ${A}: ignored (kept until this crewhub-loops' own archived projects are learnt)`]);
    // A snapshot that could not read the log whole, and one that knew nothing: not this loops' whole set.
    a.reported({ source: "remembered", slugs: ["x"] });
    a.reported({ source: "none", slugs: [] });
    assert.deepEqual(store.saves, []);
    assert.deepEqual(store.disk, { slugs: ["other"], at: T0, target: B });
    assert.equal(m.state(false).source, "none");
  });

  it("writes this loops' own set over another loops' memory once an archive event teaches it, under the target it was judged for", () => {
    const store = memoryStore({ slugs: ["other"], at: T0, target: B });
    const { m, lines } = memory(store);
    m.linked(A).heard(heard("project.archived", { slug: "beacon", key: "K" }));
    assert.deepEqual(store.saves, [{ slugs: ["beacon"], at: "2026-11-04T12:00:00.000Z", target: A }]);
    assert.equal(lines.at(-1), "remembered 1 archived project in /config/archived.json");
  });

  it("writes this loops' own set over another loops' memory once a snapshot read the list or the whole log, even an empty set", () => {
    for (const source of ["list", "log"] as const) {
      const store = memoryStore({ slugs: ["other"], at: T0, target: B });
      const { m } = memory(store);
      m.linked(A).reported({ source, slugs: [] });
      assert.deepEqual(store.saves, [{ slugs: [], at: "2026-11-04T12:00:00.000Z", target: A }], source);
      assert.deepEqual(m.state(true), { source, count: 0, at: "2026-11-04T12:00:00.000Z", slugs: [] });
    }
  });

  it("writes only when the set changed, and keeps the time it was learnt", () => {
    const store = memoryStore();
    const { m } = memory(store);
    const a = m.linked(A);
    a.reported({ source: "log", slugs: ["old"] });
    a.reported({ source: "log", slugs: ["old"] });
    a.heard(heard("project.archived", { slug: "old", key: "K" }));
    assert.equal(store.saves.length, 1);
    assert.equal(m.state(false).at, "2026-11-04T12:00:00.000Z");
    a.heard(heard("project.restored", { slug: "old", key: "K" }));
    assert.deepEqual(store.saves.map((r) => r.slugs), [["old"], []]);
    assert.equal(m.state(false).source, "log", "an event keeps the source the last report gave");
  });

  it("saves under the target the link was judged for, and only that one (round 60, A5: review-c5 5)", () => {
    // The race this closes: discovery has switched to B while an A relink is still in flight (a key check awaited), so
    // B's relink has not judged B yet, and the report of a snapshot A's link was assembling lands (the one road at the
    // host: the ear drops A's stream once the relink starts, review-a5 1). The memory used to ask discovery at the save
    // (`targetNow`) and wrote A's set under B's name; it no longer hears discovery at all, so the facts below are the
    // whole rule. The red run (`targetNow` answering B after `linked(A)`): round 60's report r60-a5.md.
    const store = memoryStore();
    const { m } = memory(store);
    const a = m.linked(A);
    a.heard(heard("project.archived", { slug: "atlas", key: "K" }));
    a.reported({ source: "log", slugs: ["atlas", "old"] });
    m.linked(B).reported({ source: "list", slugs: ["b-own"] });
    assert.deepEqual(store.saves.map((r) => r.target), [A, A, B]);
    assert.deepEqual(store.disk, { slugs: ["b-own"], at: "2026-11-04T12:00:02.000Z", target: B });
  });

  it("drops a fact through a handle whose link is gone, and says so (round 61, A5's second race)", () => {
    // The race (r60-a5.md, review-a5 2): with the relink chain idle, discovery's switch links B at once, and the report
    // of a snapshot A's link was still assembling lands after `linked(B)`. The memory judged it for B and saved A's set
    // under B's name; on B's next link `belongsTo` took the file and B "remembered" A's projects. Now the report comes
    // through A's handle, and A's link is gone: dropped. (A fact before any link cannot be fed at all any more: there
    // is no handle; the save without a target is gone with it.)
    const store = memoryStore();
    const { m, lines } = memory(store);
    const a = m.linked(A);
    a.reported({ source: "list", slugs: ["atlas"] });
    const b = m.linked(B);
    a.reported({ source: "log", slugs: ["atlas", "old"] }); // A's assembly, reporting late
    a.heard(heard("project.archived", { slug: "zeta", key: "K" })); // an event the same way (the ear drops these already)
    assert.deepEqual(store.saves, [{ slugs: ["atlas"], at: "2026-11-04T12:00:00.000Z", target: A }], "nothing of A's under B");
    assert.deepEqual(m.state(true), { source: "none", count: 0, slugs: [] });
    assert.deepEqual(lines.slice(-2), [`archive report of a link that is gone (${A}): ignored`, `archive event 1 (project.archived) of a link that is gone (${A}): ignored`]);
    b.reported({ source: "list", slugs: ["b-own"] });
    assert.deepEqual(store.disk, { slugs: ["b-own"], at: "2026-11-04T12:00:01.000Z", target: B });
    // Back to A: the file is B's and is said so; a late B report after that is dropped too.
    const again = m.linked(A);
    b.reported({ source: "log", slugs: ["b-late"] });
    assert.deepEqual(store.disk, { slugs: ["b-own"], at: "2026-11-04T12:00:01.000Z", target: B });
    assert.deepEqual(m.state(true), { source: "none", count: 0, slugs: [] });
    again.reported({ source: "list", slugs: ["a-own"] });
    assert.deepEqual(store.disk, { slugs: ["a-own"], at: "2026-11-04T12:00:02.000Z", target: A });
  });

  it("forgets the old loops' set at a switch and judges the file as it stands now when a loops is found again", () => {
    // archiveSwitch.test.ts pins the same through a host and two loops stubs.
    const store = memoryStore();
    const { m, lines } = memory(store);
    m.linked(A).heard(heard("project.archived", { slug: "new-a", key: "K" }));
    assert.deepEqual(store.disk, { slugs: ["new-a"], at: "2026-11-04T12:00:00.000Z", target: A });
    m.linked(B);
    assert.deepEqual(m.state(true), { source: "none", count: 0, slugs: [] }, "nothing of A's under B");
    assert.match(lines.at(-1) ?? "", /remembers http:\/\/127\.0\.0\.1:41001, not \/tmp\/loops-b\.sock: ignored/);
    m.linked(A);
    assert.deepEqual(m.state(true), { source: "remembered", count: 1, at: "2026-11-04T12:00:00.000Z", slugs: ["new-a"] });
  });

  it("says a save that failed and keeps the set", () => {
    const store = memoryStore();
    const { m, lines } = memory(store);
    const a = m.linked(A);
    store.fail = true;
    a.reported({ source: "log", slugs: ["old"] });
    assert.deepEqual(lines, ["cannot write the archive memory /config/archived.json: disk full"]);
    assert.deepEqual(m.state(true).slugs, ["old"]);
  });

  it("without a store remembers for this run only: nothing read, nothing written, nothing said", () => {
    const { m, lines } = memory();
    const a = m.linked(A);
    a.reported({ source: "log", slugs: ["old"] });
    a.heard(heard("project.archived", { slug: "atlas", key: "K" }));
    assert.deepEqual(m.state(true), { source: "log", count: 2, at: "2026-11-04T12:00:01.000Z", slugs: ["atlas", "old"] });
    assert.deepEqual(lines, []);
  });
});

describe("belongsTo: whose memory a file is (the host and the doctor ask the same)", () => {
  it("is the loops it names, and any loops when it names none", () => {
    assert.equal(belongsTo({ slugs: [], at: "", target: A }, A), true);
    assert.equal(belongsTo({ slugs: [], at: "", target: B }, A), false);
    assert.equal(belongsTo({ slugs: [], at: "" }, A), true);
  });
});
