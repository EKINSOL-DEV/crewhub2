import assert from "node:assert/strict";
import { test } from "node:test";
import {
  toWorldEvent,
  validateCommentsResponse,
  validateDeliveryOut,
  validateDmMessagesResponse,
  validateDmThreadsResponse,
  validateEnvelope,
  validateLoopsSnapshot,
  validateProgressResponse,
  validateTeamSnapshot,
  validateTicket,
} from "@crewhub/loops-client";
import type { BoardResponse, Result } from "@crewhub/loops-client";
import { AGENTS } from "../src/content.ts";
import { SCRIPT_DURATION_MS } from "../src/script.ts";
import { envelopes, playLoop, startDemo } from "./helpers.ts";

function valid<T>(result: Result<T>, what: string): void {
  assert.ok(result.ok, result.ok ? what : `${what}: ${result.path} ${result.message}`);
}

test("every snapshot, envelope and team message of a loop passes the loops-client validators", () => {
  const { messages } = playLoop();
  for (const message of messages) {
    if (message.type === "snapshot") valid(validateLoopsSnapshot(message.snapshot), "snapshot");
    if (message.type === "team") valid(validateTeamSnapshot(message.team), "team");
    if (message.type === "event") {
      const { envelope } = message;
      valid(validateEnvelope(envelope), `${envelope.type} #${envelope.seq}`);
      const typed = toWorldEvent(envelope);
      assert.notEqual(typed, null, `${envelope.type} is on the world's allowlist`);
      if (typed !== null) valid(typed, `${envelope.type} #${envelope.seq} payload`);
    }
  }
});

test("detail reads answer in loops shapes for every ticket the loop touched", async () => {
  // Stop just before the loop end: the next loop resets to the initial tickets.
  const run = startDemo();
  run.play(SCRIPT_DURATION_MS - 3_000);
  const { source, messages } = run;
  const refs = new Set(envelopes(messages).flatMap((e) => (e.ticket === null ? [] : [e.ticket.key])));
  assert.ok(refs.size > 30);
  for (const ref of refs) {
    const ticket = await source.getTicket(ref);
    assert.ok(ticket !== null, ref);
    valid(validateTicket(ticket), ref);
    valid(validateCommentsResponse({ comments: await source.getComments(ref), nextCursor: null }), `${ref} comments`);
    valid(validateProgressResponse({ progress: await source.getProgress(ref), nextCursor: null }), `${ref} progress`);
  }
  valid(validateDmThreadsResponse({ threads: await source.getDmThreads() }), "dm threads");
  valid(validateDmMessagesResponse({ messages: await source.getDmMessages("g-man"), nextCursor: null }), "dm");
  for (const delivery of await source.getDeliveries()) valid(validateDeliveryOut(delivery), delivery.id);
  assert.equal(await source.getTicket("CR-9999"), null);
  assert.equal(await source.getProject("nope"), null);
});

test("loops rules hold over a loop", async () => {
  const { messages } = playLoop();
  const agents = new Set(AGENTS.map((a) => a.id));
  for (const e of envelopes(messages)) {
    if (e.type === "ticket.moved" && e.payload["to"] === "done") {
      assert.equal(e.actor.kind, "user", `${e.ticket?.key} moved to done by ${e.actor.id}`);
      assert.ok(!agents.has(e.actor.id));
    }
    if (e.type === "delivery.created") assert.deepEqual(e.recipientIds, [e.payload["recipientId"]]);
    else if (e.recipientIds.length > 0) {
      const created = envelopes(messages).filter(
        (d) => d.type === "delivery.created" && d.seq > e.seq && d.seq <= e.seq + 12,
      );
      for (const id of e.recipientIds) {
        assert.ok(created.some((d) => d.payload["recipientId"] === id), `#${e.seq} ${e.type} names ${id}`);
      }
    }
  }
});

test("board columns match ProjectOut.counts in every snapshot and throughout the loop", async () => {
  for (const message of playLoop().messages) {
    if (message.type !== "snapshot") continue;
    for (const project of message.snapshot.projects) {
      const board: BoardResponse | undefined = message.snapshot.boards[project.slug];
      assert.ok(board !== undefined);
      for (const column of board.columns) assert.equal(column.tickets.length, project.counts[column.status]);
      const positions: number[][] = board.columns.map((c) => c.tickets.map((t) => t.position));
      for (const order of positions) assert.deepEqual(order, [...order].sort((a, b) => a - b));
    }
  }
  // During the loop: sample every 20 s of demo time, archived OPS included.
  const run = startDemo();
  for (let t = 0; t < SCRIPT_DURATION_MS - 20_000; t += 20_000) {
    run.play(20_000);
    for (const slug of ["crewhub", "crewhub-loops", "marketing", "ops-tooling"]) {
      const [out, board] = [await run.source.getProject(slug), await run.source.getBoard(slug)];
      assert.ok(out !== null && board !== null);
      for (const column of board.columns) assert.equal(column.tickets.length, out.counts[column.status], slug);
    }
  }
});
