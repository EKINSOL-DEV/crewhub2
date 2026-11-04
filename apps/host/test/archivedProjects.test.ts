import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createLoopsClient } from "../src/loops.ts";
import { type ArchiveReport, archivedSlugsFromEvents, assembleSnapshot, readArchivedSlugsFromEvents } from "../src/snapshot.ts";
import { type LoopsStub, createLoopsStub, envelope, installation } from "./loopsStub.ts";

/** A `project.archived` or `project.restored` envelope at `seq` for `slug`. */
function change(seq: number, type: "project.archived" | "project.restored", slug: string) {
  return envelope(seq, type, { project: { slug, key: slug.toUpperCase() }, actor: { id: "nicky", kind: "user" }, payload: { changed: ["archivedAt"], old: {}, new: { archivedAt: type === "project.archived" ? "2026-10-20T22:14:27Z" : null } } });
}

describe("archived projects from the event log", () => {
  let stub: LoopsStub;
  before(async () => {
    // The log: `old` archived long ago; `atlas` archived and restored (active now); `flip` archived and restored
    // over and over, far past one page of 500, and archived last; other events in between, which the filter drops.
    const events = [change(1, "project.archived", "old"), envelope(2, "ticket.created"), change(3, "project.archived", "atlas"), change(4, "project.restored", "atlas")];
    let seq = 5;
    for (let i = 0; i < 520; i += 1) {
      events.push(change(seq, i % 2 === 0 ? "project.archived" : "project.restored", "flip"));
      seq += 1;
      if (i % 50 === 0) events.push(envelope(seq++, "ticket.moved"));
    }
    events.push(change(seq++, "project.archived", "flip"));
    stub = await createLoopsStub({ ...installation(), events, routes: { ...installation().routes, "/api/projects/flip": { project: { id: "pr_flip", slug: "flip", key: "FLIP", name: "flip", lead: { id: "lead-1", kind: "agent", displayName: "Lead One" }, counts: { backlog: 0, planned: 0, in_progress: 0, review: 0, done: 0 }, effectiveRoute: { agent: "lead-1" }, archivedAt: "2026-10-20T22:14:27Z", archivedBy: { id: "nicky", kind: "user", displayName: "Nicky" } } } } });
  });
  after(async () => {
    await stub.close();
  });

  it("keeps the last archive or restore per slug and pages past loops' 500", async () => {
    const client = createLoopsClient(stub.url, stub.key);
    const slugs = await archivedSlugsFromEvents(client);
    assert.deepEqual(slugs.sort(), ["flip", "old"], "atlas was restored, flip was archived last");
    const reads = stub.requests.filter((r) => r.path.startsWith("/api/events?"));
    assert.ok(reads.length >= 2, `pages: ${reads.map((r) => r.path).join(" ")}`);
    assert.ok(reads.every((r) => r.path.includes("types=project.archived%2Cproject.restored") && r.path.includes("limit=500")), reads[0]?.path);
    assert.ok(reads[0]?.path.includes("after=0"), "starts at the beginning of the log");
    assert.ok(reads[1]?.path.includes("after=500") || reads[1]?.path.includes("after=5"), `the next page follows lastSeq: ${reads[1]?.path}`);
    assert.ok(reads.every((r) => r.method === "GET"));
  });

  it("the snapshot reads each archived project the list left out, once, marked archived", async () => {
    const client = createLoopsClient(stub.url, stub.key);
    stub.requests.length = 0;
    const { snapshot } = await assembleSnapshot(client, { cursor: 999, archived: () => ({ slugs: ["old", "flip"], remembered: false }) });
    assert.deepEqual(snapshot.projects.map((p) => p.slug), ["atlas", "beacon"]);
    assert.deepEqual(snapshot.archivedProjects.map((p) => p.slug).sort(), ["flip", "old"]);
    assert.ok(snapshot.archivedProjects.every((p) => typeof p.archivedAt === "string"));
    const one = stub.requests.filter((r) => r.path === "/api/projects/old" || r.path === "/api/projects/flip");
    assert.equal(one.length, 2, "each archived project is read once, although the log and the stream both named it");
    assert.ok(!stub.requests.some((r) => r.path === "/api/projects/atlas"), "a restored project is not read one by one");
  });

  it("the snapshot asks for the archived projects the host knows once, after the project list and the log's archive read and before the boards; the host's remembered set names the source when neither told it whole (round 60, A1)", async () => {
    // The list refuses includeArchived (an agent key) and the log's archive read answers 410: only the host knows.
    const flip = { id: "pr_flip", slug: "flip", key: "FLIP", name: "flip", lead: { id: "lead-1", kind: "agent", displayName: "Lead One" }, counts: { backlog: 0, planned: 0, in_progress: 0, review: 0, done: 0 }, effectiveRoute: { agent: "lead-1" }, archivedAt: "2026-10-20T22:14:27Z", archivedBy: { id: "nicky", kind: "user", displayName: "Nicky" } };
    const shut = await createLoopsStub({
      ...installation(),
      routes: {
        ...installation().routes,
        "/api/projects/flip": { project: flip },
      },
      logMinAfter: 1,
    });
    try {
      for (const remembered of [true, false]) {
        shut.requests.length = 0;
        const asked: string[][] = [];
        const reports: ArchiveReport[] = [];
        const { snapshot } = await assembleSnapshot(createLoopsClient(shut.url, shut.key), {
          cursor: 0,
          archived: () => {
            asked.push(shut.requests.map((r) => r.path));
            return { slugs: ["flip", "atlas"], remembered };
          },
          onArchive: (report) => reports.push(report),
        });
        assert.equal(asked.length, 1, "asked once");
        const [before] = asked as [string[]];
        assert.ok(before.some((p) => p.startsWith("/api/projects?")) && before.some((p) => p.startsWith("/api/events?") && p.includes("types=project.archived%2Cproject.restored")), before.join(" "));
        assert.ok(!before.some((p) => p.startsWith("/api/board/")), `before the boards: ${before.join(" ")}`);
        assert.deepEqual(snapshot.archivedProjects.map((p) => p.slug), ["flip"], "read one by one and kept as loops confirms; a listed project is not read again");
        assert.ok(!shut.requests.some((r) => r.path === "/api/projects/atlas"));
        assert.deepEqual(reports, [{ source: remembered ? "remembered" : "none", slugs: ["flip"] }]);
      }
    } finally {
      await shut.close();
    }
  });

  it("a log whose pages never run short is read for 1000 pages and no more, and the read says it is incomplete (round 54, r54-mut-host2: snapshot.ts:165)", async () => {
    const page = Array.from({ length: 500 }, () => ({ type: "project.archived", project: { slug: "endless" } }));
    let reads = 0;
    const client = {
      async getJson<T>(_path: string, query: Record<string, string> = {}): Promise<{ status: number; body: T | null }> {
        reads += 1;
        return { status: 200, body: { events: page, lastSeq: Number(query["after"]) + 500 } as T };
      },
    };
    assert.deepEqual(await readArchivedSlugsFromEvents(client), { slugs: ["endless"], complete: false });
    assert.equal(reads, 1000);
  });
});
