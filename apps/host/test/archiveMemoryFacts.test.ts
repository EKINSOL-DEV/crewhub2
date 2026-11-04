/**
 * The archive memory through its interface (archiveMemory.ts, round 59d C5): fact sequences in (a link to a loops,
 * the stream's archive and restore events, a snapshot's report), the set, its source and time, and the store's saves
 * out. An in-memory store stands in for the file (`archiveStore.ts` has its own test); no host, no loops, no polling.
 * The host's wiring of the same facts stays pinned by archiveMemory.test.ts and archiveSwitch.test.ts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type ArchiveMemory, belongsTo, createArchiveMemory } from "../src/archiveMemory.ts";
import type { ArchiveRecord, ArchiveStore } from "../src/archiveStore.ts";
import type { KnownArchived } from "../src/snapshot.ts";

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
const asked = (archived: () => KnownArchived) => {
  const known = archived();
  return { slugs: [...new Set(known.slugs)], remembered: known.remembered };
};

/** A memory over `store` (or none: this run only), a clock that ticks per change. */
function memory(store?: ArchiveStore) {
  const lines: string[] = [];
  let tick = 0;
  const m: ArchiveMemory = createArchiveMemory({
    ...(store === undefined ? {} : { store }),
    log: (line) => lines.push(line),
    now: () => `2026-11-04T12:00:0${tick++}.000Z`,
  });
  return { m, lines };
}

describe("the archive memory, fed facts", () => {
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
    m.linked(A);
    m.heard("ticket.created", "beacon");
    m.heard("project.archived", "atlas");
    m.heard("project.archived", "old");
    m.heard("project.restored", "old");
    assert.deepEqual([...m.seen()], ["atlas"]);
    assert.deepEqual([...m.slugs()], ["atlas"]);
    assert.deepEqual(m.state(true), { source: "none", count: 1, at: "2026-11-04T12:00:02.000Z", slugs: ["atlas"] });
  });

  it("keeps only slugs that are path segments, in the link's set and in the set (round 34)", () => {
    // Replaces fuzzStream.test.ts's "slugs stay slugs" on the upstream's set: the fuzz now feeds this module.
    const { m } = memory(memoryStore());
    m.linked(A);
    for (const slug of ["a/b", "x y", "", "s".repeat(129), 7, undefined, null]) m.heard("project.archived", slug);
    m.heard("project.archived", "old");
    assert.deepEqual([...m.seen()], ["old"]);
    assert.deepEqual([...m.slugs()], ["old"]);
    m.reported({ source: "log", slugs: ["c/d", "old", "old"] });
    assert.deepEqual(m.state(true).slugs, ["old"]);
  });

  it("starts the link's own set empty on every link, and hands out a new set rather than emptying the old one", () => {
    const { m } = memory(memoryStore());
    m.linked(A);
    m.heard("project.archived", "atlas");
    const before = m.seen();
    m.linked(A); // the same loops again (a new key, a stream refused): a new link, the set kept
    assert.deepEqual([...m.seen()], []);
    assert.deepEqual([...before], ["atlas"], "a snapshot of the old link keeps the set it was given");
    assert.deepEqual([...m.slugs()], ["atlas"], "the same target keeps what it learnt");
    m.heard("project.archived", "beacon");
    assert.deepEqual([...before], ["atlas"]);
    assert.deepEqual([...m.seen()], ["beacon"]);
  });

  it("hands out the set as it stood: a change makes a new set, the live link set grows in place", () => {
    const { m } = memory(memoryStore());
    m.linked(A);
    const slugs = m.slugs();
    const seen = m.seen();
    m.heard("project.archived", "atlas");
    assert.deepEqual([...slugs], [], "a snapshot keeps the set it started with");
    assert.deepEqual([...seen], ["atlas"], "a snapshot under way reads the link's set when it gets to the archived projects");
  });

  it("answers a snapshot's archived getter: the link's stream set as it is when asked, then the set as the assembly started, and whether that had any (round 60, A1)", () => {
    const { m } = memory(memoryStore());
    m.linked(A);
    m.reported({ source: "log", slugs: ["old"] });
    m.heard("project.archived", "atlas");
    const archived = m.forSnapshot();
    m.heard("project.archived", "beacon"); // heard during the assembly: the stream set counts it
    m.reported({ source: "log", slugs: [] }); // another snapshot's report: this assembly keeps the set it started with
    assert.deepEqual(asked(archived), { slugs: ["atlas", "beacon", "old"], remembered: true });
    assert.deepEqual(asked(m.forSnapshot()), { slugs: ["atlas", "beacon"], remembered: false }, "an assembly starting now: the set is empty");
  });

  it("keeps a snapshot's archived getter on the link it started on when a relink comes during the assembly (round 60, A1)", () => {
    const { m } = memory(memoryStore());
    m.linked(A);
    m.reported({ source: "log", slugs: ["old"] });
    m.heard("project.archived", "atlas");
    const archived = m.forSnapshot();
    m.linked(B);
    m.heard("project.archived", "beacon");
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
    m.linked(A);
    assert.deepEqual(m.state(true), { source: "none", count: 0, slugs: [] });
    assert.deepEqual(lines, [`/config/archived.json remembers ${B}, not ${A}: ignored (kept until this crewhub-loops' own archived projects are learnt)`]);
    // A snapshot that could not read the log whole, and one that knew nothing: not this loops' whole set.
    m.reported({ source: "remembered", slugs: ["x"] });
    m.reported({ source: "none", slugs: [] });
    assert.deepEqual(store.saves, []);
    assert.deepEqual(store.disk, { slugs: ["other"], at: T0, target: B });
    assert.equal(m.state(false).source, "none");
  });

  it("writes this loops' own set over another loops' memory once an archive event teaches it, under the target it was judged for", () => {
    const store = memoryStore({ slugs: ["other"], at: T0, target: B });
    const { m, lines } = memory(store);
    m.linked(A);
    m.heard("project.archived", "beacon");
    assert.deepEqual(store.saves, [{ slugs: ["beacon"], at: "2026-11-04T12:00:00.000Z", target: A }]);
    assert.equal(lines.at(-1), "remembered 1 archived project in /config/archived.json");
  });

  it("writes this loops' own set over another loops' memory once a snapshot read the list or the whole log, even an empty set", () => {
    for (const source of ["list", "log"] as const) {
      const store = memoryStore({ slugs: ["other"], at: T0, target: B });
      const { m } = memory(store);
      m.linked(A);
      m.reported({ source, slugs: [] });
      assert.deepEqual(store.saves, [{ slugs: [], at: "2026-11-04T12:00:00.000Z", target: A }], source);
      assert.deepEqual(m.state(true), { source, count: 0, at: "2026-11-04T12:00:00.000Z", slugs: [] });
    }
  });

  it("writes only when the set changed, and keeps the time it was learnt", () => {
    const store = memoryStore();
    const { m } = memory(store);
    m.linked(A);
    m.reported({ source: "log", slugs: ["old"] });
    m.reported({ source: "log", slugs: ["old"] });
    m.heard("project.archived", "old");
    assert.equal(store.saves.length, 1);
    assert.equal(m.state(false).at, "2026-11-04T12:00:00.000Z");
    m.heard("project.restored", "old");
    assert.deepEqual(store.saves.map((r) => r.slugs), [["old"], []]);
    assert.equal(m.state(false).source, "log", "an event keeps the source the last report gave");
  });

  it("saves under the target the link was judged for, and only that one (round 60, A5: review-c5 5)", () => {
    // The race this closes: discovery has switched to B, the relink has not judged B yet, and a fact from A's link
    // lands (an archive event on A's stream, or the report of a snapshot A's link was assembling). The memory used to
    // ask discovery at the save (`targetNow`) and wrote A's set under B's name; it no longer hears discovery at all, so
    // the facts below are the whole rule. The red run (the memory with `targetNow` answering B after `linked(A)`):
    // round 60's report r60-a5.md.
    const store = memoryStore();
    const { m } = memory(store);
    m.linked(A);
    m.heard("project.archived", "atlas");
    m.reported({ source: "log", slugs: ["atlas", "old"] });
    m.linked(B);
    m.reported({ source: "list", slugs: ["b-own"] });
    assert.deepEqual(store.saves.map((r) => r.target), [A, A, B]);
    assert.deepEqual(store.disk, { slugs: ["b-own"], at: "2026-11-04T12:00:02.000Z", target: B });
  });

  it("saves without a target only for a fact before any link (no target was judged yet)", () => {
    // Was "saves without a target when discovery finds none at the moment of the save": a fact of A's link now names
    // A whatever discovery finds (round 60, A5). The host feeds facts only on a link, so this file is the module's edge.
    const store = memoryStore();
    const { m } = memory(store);
    m.reported({ source: "list", slugs: ["old"] });
    assert.deepEqual(store.saves, [{ slugs: ["old"], at: "2026-11-04T12:00:00.000Z" }]);
  });

  it("forgets the old loops' set at a switch and judges the file as it stands now when a loops is found again", () => {
    // archiveSwitch.test.ts pins the same through a host and two loops stubs.
    const store = memoryStore();
    const { m, lines } = memory(store);
    m.linked(A);
    m.heard("project.archived", "new-a");
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
    m.linked(A);
    store.fail = true;
    m.reported({ source: "log", slugs: ["old"] });
    assert.deepEqual(lines, ["cannot write the archive memory /config/archived.json: disk full"]);
    assert.deepEqual(m.state(true).slugs, ["old"]);
  });

  it("without a store remembers for this run only: nothing read, nothing written, nothing said", () => {
    const { m, lines } = memory();
    m.linked(A);
    m.reported({ source: "log", slugs: ["old"] });
    m.heard("project.archived", "atlas");
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
