/**
 * Round 9: the snapshot carries the facts the log holds (CL-312): the open quiet stretches and the latest automation
 * runs, read from `GET /api/events` through the counted, timed reader, bounded to the open tickets of the boards,
 * a quiet dropped when a person or an agent touched the ticket after it. Against the stub, then against the fake
 * at two points of its storyline.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createLoopsFake } from "@crewhub/loops-fake";
import { createLoopsClient } from "../src/loops.ts";
import { assembleSnapshot } from "../src/snapshot.ts";
import { type LoopsStub, createLoopsStub, envelope, installation } from "./loopsStub.ts";

const system = { id: "system", kind: "system" as const };
const quiet = (seq: number, id: string, key: string, status: string) =>
  envelope(seq, "ticket.quiet", { ticket: { id, key, title: "First" }, actor: system, payload: { status, minutes: 15, since: "2026-10-21T07:00:00Z", ticket: key } });
const ran = (seq: number, id: string, key: string, outcome = "ok") =>
  envelope(seq, "automation.ran", { ticket: { id, key, title: "First" }, actor: system, payload: { runId: `ur_${seq}`, automationId: "au_1", outcome, automation: { id: "au_1", name: "Label stale bugs" } } });

describe("the snapshot carries the quiet stretches and the runs from the log", () => {
  let stub: LoopsStub;
  let stubEvents: ReturnType<typeof envelope>[] = [];
  before(async () => {
    // AT-1 and BC-1 are in progress on the boards. AT-1: an old stretch, then a newer one, then the automation's own
    // label change (system) and its run: still quiet. BC-1: quiet, then an agent's comment: not quiet. A run on a ticket
    // no board lists is left out; a quiet in another status than the ticket's is stale.
    stubEvents = [
      quiet(10, "tk_AT", "AT-1", "in_progress"),
      envelope(11, "ticket.moved", { ticket: { id: "tk_ZZ", key: "ZZ-1", title: "" }, actor: { id: "nicky", kind: "user" } }),
      quiet(12, "tk_AT", "AT-1", "in_progress"),
      envelope(13, "ticket.updated", { ticket: { id: "tk_AT", key: "AT-1", title: "First" }, actor: system, payload: { changed: ["labels"], automation: { id: "au_1", name: "Label stale bugs" } } }),
      ran(14, "tk_AT", "AT-1"),
      quiet(15, "tk_BC", "BC-1", "in_progress"),
      envelope(16, "comment.created", { ticket: { id: "tk_BC", key: "BC-1", title: "First" }, actor: { id: "lead-1", kind: "agent" }, payload: { commentId: "c1", parentId: null } }),
      ran(17, "tk_ZZ", "ZZ-1", "failed"),
      quiet(18, "tk_AT", "AT-1", "review"),
      ran(19, "tk_BC", "BC-1"),
    ];
    stub = await createLoopsStub({ ...installation(), events: stubEvents });
  });
  after(async () => {
    await stub.close();
  });

  it("reads the two types in one paged question, then the activity after each candidate with ticket= (loops main, round 29), and hands the facts over", async () => {
    const client = createLoopsClient(stub.url, stub.key);
    stub.requests.length = 0;
    const { snapshot, stats } = await assembleSnapshot(client, { cursor: 19 });
    assert.deepEqual(snapshot.quiet?.map((e) => [e.seq, e.ticket?.key]), [[12, "AT-1"]], "the newest stretch of AT-1 in its status; BC-1's ended with the comment; the review one is stale");
    assert.deepEqual(snapshot.automationRuns?.map((e) => e.seq), [14, 19], "runs on open tickets, oldest first; ZZ-1 is on no board");
    assert.deepEqual(stats.log, { quiet: 1, runs: 2, pages: 3, complete: true, road: "ticket" });
    // The archive read comes first (the stub refuses includeArchived, as loops does for an agent key); then the facts
    // question, then one small read per candidate ticket after its stretch (the newest per status), never the whole log.
    const reads = stub.requests.filter((r) => r.path.startsWith("/api/events?") && !r.path.includes("project.archived")).map((r) => decodeURIComponent(r.path));
    assert.deepEqual(reads, [
      "/api/events?after=0&limit=500&types=ticket.quiet,automation.ran",
      "/api/events?after=12&limit=50&ticket=tk_AT&types=ticket.created,ticket.updated,ticket.moved,ticket.archived,ticket.unarchived,ticket.progress,comment.created,comment.updated,comment.deleted",
      "/api/events?after=15&limit=50&ticket=tk_BC&types=ticket.created,ticket.updated,ticket.moved,ticket.archived,ticket.unarchived,ticket.progress,comment.created,comment.updated,comment.deleted",
    ]);
    assert.ok(stats.reads >= 10, `every log page is a counted read: ${stats.reads}`);
  });

  it("an older loops ignores ticket= (everyone's events come back): the host sees another ticket's event and judges by the paged read instead, with the same facts", async () => {
    const older = await createLoopsStub({ ...installation(), events: stubEvents, ticketFilter: false });
    try {
      const client = createLoopsClient(older.url, older.key);
      const { snapshot, stats } = await assembleSnapshot(client, { cursor: 19 });
      assert.deepEqual(snapshot.quiet?.map((e) => [e.seq, e.ticket?.key]), [[12, "AT-1"]]);
      assert.deepEqual(stats.log, { quiet: 1, runs: 2, pages: 2, complete: true, road: "pages" }, "the ticket read tried is no page; the paged activity read is one");
      const reads = older.requests.filter((r) => r.path.startsWith("/api/events?") && !r.path.includes("project.archived")).map((r) => decodeURIComponent(r.path));
      assert.equal(reads.length, 3);
      assert.match(reads[1] ?? "", /ticket=tk_AT/, "the first candidate's read, which answered ZZ-1's and BC-1's events too");
      assert.equal(reads[2], "/api/events?after=12&limit=500&types=ticket.created,ticket.updated,ticket.moved,ticket.archived,ticket.unarchived,ticket.progress,comment.created,comment.updated,comment.deleted", "the paged read from the oldest candidate, as before round 29");
    } finally {
      await older.close();
    }
  });

  it("a candidate whose ticket is gone (404 for ticket=) keeps the stretch; no candidate at all makes no ticket read and names no road", async () => {
    const gone = await createLoopsStub({ ...installation(), events: stubEvents.filter((e) => e.ticket?.id !== "tk_BC" || e.type === "ticket.quiet") });
    try {
      const client = createLoopsClient(gone.url, gone.key);
      const { snapshot, stats } = await assembleSnapshot(client, { cursor: 19 });
      assert.deepEqual(snapshot.quiet?.map((e) => [e.seq, e.ticket?.key]), [[12, "AT-1"], [15, "BC-1"]], "BC-1's stretch stands: nobody touched it in this log");
      assert.equal(stats.log.road, "ticket");
      const none = await createLoopsStub({ ...installation(), events: [] });
      try {
        const bare = await assembleSnapshot(createLoopsClient(none.url, none.key), { cursor: 0 });
        assert.deepEqual(bare.stats.log, { quiet: 0, runs: 0, pages: 1, complete: true });
      } finally {
        await none.close();
      }
    } finally {
      await gone.close();
    }
  });

  it("the window: the log is read from 20 000 seqs before the cursor, not from the beginning", async () => {
    const client = createLoopsClient(stub.url, stub.key);
    stub.requests.length = 0;
    await assembleSnapshot(client, { cursor: 25_000 });
    const first = stub.requests.find((r) => r.path.includes("ticket.quiet"))?.path ?? "";
    assert.ok(first.includes("after=5000"), first);
  });
});

describe("against the fake, the storyline's facts come with the snapshot", () => {
  // The fake's log starts where the fake starts (an install begun at that moment): from 8:00 at 16x, the quiet fact
  // (8:10) and the runs (8:40, 8:43, 8:52) are in its log within three wall seconds, cr-lead's comment on CR-17
  // (11:20) within thirteen. Each snapshot is taken once the log holds the row it is about: the state, not the clock.
  it("the quiet stretch and the two runs so far; later the comment ended the stretch and three runs stand", async () => {
    const fake = await createLoopsFake({ speed: 16, startAt: 8 * 60 * 1000 });
    const client = createLoopsClient(fake.url, fake.key);
    const logHas = async (types: string, wanted: (e: { ticket: { key: string } | null; payload: Record<string, unknown> }) => boolean, ms: number) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const page = await client.getJson<{ events: { ticket: { key: string } | null; payload: Record<string, unknown> }[] }>("/api/events", { types, after: "0", limit: "500" });
        if ((page.body?.events ?? []).some(wanted)) return true;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return false;
    };
    try {
      assert.ok(await logHas("automation.ran", (e) => e.payload["runId"] === "run_demo_2", 20_000), "the second run is in the log");
      const early = await assembleSnapshot(client, { cursor: fake.lastSeq() });
      assert.deepEqual(early.snapshot.quiet?.map((e) => [e.ticket?.key, e.payload["minutes"]]), [["CR-17", 30]]);
      assert.deepEqual(early.snapshot.automationRuns?.map((e) => [e.ticket?.key, e.payload["runId"]]).slice(0, 2), [["CR-20", "run_demo_1"], ["CR-21", "run_demo_2"]]);
      assert.equal(early.stats.log.complete, true);
      assert.ok(await logHas("comment.created", (e) => e.ticket?.key === "CR-17", 30_000), "cr-lead's comment on CR-17 is in the log");
      const late = await assembleSnapshot(client, { cursor: fake.lastSeq() });
      assert.deepEqual(late.snapshot.quiet, [], "the comment at 11:20 ended the stretch");
      assert.deepEqual(late.snapshot.automationRuns?.map((e) => e.payload["runId"]), ["run_demo_1", "run_demo_2", "run_demo_3"]);
    } finally {
      await fake.close();
    }
  });
});
