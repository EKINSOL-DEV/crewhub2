import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createLoopsClient } from "../src/loops.ts";
import { archivedSlugsFromEvents, assembleSnapshot } from "../src/snapshot.ts";
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
    const snapshot = await assembleSnapshot(client, { cursor: 999, knownArchivedSlugs: ["old", "flip"] });
    assert.deepEqual(snapshot.projects.map((p) => p.slug), ["atlas", "beacon"]);
    assert.deepEqual(snapshot.archivedProjects.map((p) => p.slug).sort(), ["flip", "old"]);
    assert.ok(snapshot.archivedProjects.every((p) => typeof p.archivedAt === "string"));
    const one = stub.requests.filter((r) => r.path === "/api/projects/old" || r.path === "/api/projects/flip");
    assert.equal(one.length, 2, "each archived project is read once, although the log and the stream both named it");
    assert.ok(!stub.requests.some((r) => r.path === "/api/projects/atlas"), "a restored project is not read one by one");
  });
});
