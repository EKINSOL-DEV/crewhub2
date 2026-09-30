import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateAgents,
  validateDmMessagesResponse,
  validateDmThreadsResponse,
  validateEnvelope,
} from "@crewhub/loops-client";
import type { DmMessage, DmMessagesResponse, DmThreadsResponse, Envelope, Result } from "@crewhub/loops-client";
import { createDemoApi } from "../src/api.ts";
import { SCRIPT_DURATION_MS } from "../src/script.ts";
import { at } from "../src/time.ts";
import { envelopes, startDemo } from "./helpers.ts";

function valid<T>(result: Result<T>, what: string): T {
  assert.ok(result.ok, result.ok ? what : `${what}: ${result.path} ${result.message}`);
  return result.value;
}

/** A demo at 1x (so `play` is demo time) with its API. */
function chat(startAt = at("0:30")) {
  const run = startDemo({ speed: 1, startAt });
  const api = createDemoApi(run.source, { baseUrl: "https://loops.example" });
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await api.handle(method, path, body);
    return response;
  };
  const messages = async (agent: string): Promise<DmMessage[]> =>
    ((await call("GET", `/api/dm/threads/${agent}/messages`)).body as DmMessagesResponse).messages;
  const thread = async (agent: string) =>
    ((await call("GET", "/api/dm/threads")).body as DmThreadsResponse).threads.find((t) => t.agentId === agent);
  return { run, api, call, messages, thread };
}

test("every chat route answers in loops' shapes, and anything else is loops' 404 envelope", async () => {
  const { call } = chat();
  const feature = await call("GET", "/api/features/global/bubbles");
  assert.equal(feature.status, 200);
  assert.deepEqual((feature.body as { feature: { key: string; value: boolean; type: string } }).feature.value, true);
  valid(validateDmThreadsResponse((await call("GET", "/api/dm/threads")).body), "threads");
  valid(validateDmMessagesResponse((await call("GET", "/api/dm/threads/g-man/messages")).body), "messages");
  const agents = valid(validateAgents((await call("GET", "/api/agents")).body), "agents");
  assert.ok(agents.agents.some((a) => a.isCrewhubLead === true && a.role === "lead"));
  const summary = (await call("GET", "/api/agents/cr-lead/summary")).body as {
    comments: { ticketKey: string; url: string; text: string }[];
    tickets: { key: string; status: string; url: string }[];
  };
  assert.ok(summary.tickets.length > 0, "cr-lead has open tickets");
  assert.ok(summary.tickets.every((t) => t.status !== "done" && t.url === `https://loops.example/t/${t.key}`));
  assert.ok(summary.comments.length <= 5);
  assert.ok(summary.comments.every((c) => c.url.startsWith(`https://loops.example/t/${c.ticketKey}#c-`) && c.text.length <= 140));

  for (const [method, path, status, code] of [
    ["GET", "/api/projects", 404, "not_found"],
    ["GET", "/api/features/global/agents_admin", 404, "not_found"],
    ["GET", "/api/dm/threads/nobody/messages", 404, "not_found"],
    ["GET", "/api/dm/threads/postman/messages", 403, "forbidden"],
    ["DELETE", "/api/dm/threads", 405, "method_not_allowed"],
  ] as const) {
    const response = await call(method, path);
    assert.equal(response.status, status, `${method} ${path}`);
    const error = (response.body as { error: { code: string; message: string; detail: unknown } }).error;
    assert.equal(error.code, code);
    assert.equal(typeof error.message, "string");
    assert.equal(error.detail, null);
  }
});

test("a sent message is delivered by the postman and answered by a scripted reply with dm.answered", async () => {
  const { run, call, messages } = chat();
  const sent = run.messages.length;
  const posted = await call("POST", "/api/dm/threads/cr-lead/messages", { bodyMarkdown: "  Is the pallet done?  ", clientId: "c-1" });
  assert.equal(posted.status, 200);
  const message = (posted.body as { message: DmMessage }).message;
  valid(validateDmMessagesResponse({ messages: [message], nextCursor: null }), "posted message");
  assert.equal(message.bodyText, "Is the pallet done?");
  assert.equal(message.state, "queued");
  assert.equal(message.author.id, "nicky");

  const now = envelopes(run.messages.slice(sent));
  assert.deepEqual(now.map((e) => e.type), ["dm.created", "delivery.created"], "the message and its delivery go out at once");
  for (const envelope of now) valid(validateEnvelope(envelope), envelope.type);

  run.play(9_000);
  const later = envelopes(run.messages.slice(sent)).filter(
    (e: Envelope) => e.payload["threadId"] === message.threadId || e.payload["dmThreadId"] === message.threadId,
  );
  const deliveryStates = later.filter((e) => e.type === "delivery.updated").map((e) => e.payload["state"]);
  assert.deepEqual(deliveryStates, ["claimed", "forwarded"]);
  assert.deepEqual(later.map((e) => e.type), ["dm.created", "delivery.created", "delivery.updated", "delivery.updated", "dm.created", "dm.answered"]);
  const answered = later.find((e) => e.type === "dm.answered");
  assert.equal(answered?.payload["messageId"], message.id, "dm.answered names the parent message");

  const thread = await messages("cr-lead");
  const parent = thread.find((m) => m.id === message.id);
  const reply = thread.at(-1);
  assert.equal(parent?.state, "answered");
  assert.notEqual(parent?.answeredAt, null);
  assert.equal(reply?.author.id, "cr-lead");
  assert.equal(reply?.replyTo, message.id);
  assert.ok(reply?.bodyText.startsWith("(demo reply)"));
});

test("the same clientId sends once; a different body under it is a conflict", async () => {
  const { call, messages } = chat();
  const body = { bodyMarkdown: "Hello", clientId: "retry-1" };
  const first = (await call("POST", "/api/dm/threads/g-man/messages", body)).body as { message: DmMessage };
  const again = (await call("POST", "/api/dm/threads/g-man/messages", body)).body as { message: DmMessage };
  assert.equal(again.message.id, first.message.id);
  assert.equal((await messages("g-man")).filter((m) => m.clientId === "retry-1").length, 1);
  const conflict = await call("POST", "/api/dm/threads/g-man/messages", { bodyMarkdown: "Other", clientId: "retry-1" });
  assert.equal(conflict.status, 409);
  assert.equal((await call("POST", "/api/dm/threads/g-man/messages", { bodyMarkdown: "   ", clientId: "x" })).status, 400);
  assert.equal((await call("POST", "/api/dm/threads/g-man/messages", { bodyMarkdown: "Hi", clientId: "no spaces" })).status, 400);
});

test("a read marker lowers unreadCount, only forwards", async () => {
  const { run, call, messages, thread } = chat();
  await call("POST", "/api/dm/threads/marky/messages", { bodyMarkdown: "First", clientId: "m-1" });
  run.play(9_000);
  await call("POST", "/api/dm/threads/marky/messages", { bodyMarkdown: "Second", clientId: "m-2" });
  run.play(9_000);
  assert.equal((await thread("marky"))?.unreadCount, 2, "two replies, nothing read");
  const [firstReply, secondReply] = (await messages("marky")).filter((m) => m.author.id === "marky");
  assert.ok(firstReply && secondReply);
  const read = await call("PUT", "/api/dm/threads/marky/read", { lastReadMessageId: firstReply.id });
  assert.equal(read.status, 204);
  assert.equal((await thread("marky"))?.unreadCount, 1);
  await call("PUT", "/api/dm/threads/marky/read", { lastReadMessageId: secondReply.id });
  assert.equal((await thread("marky"))?.unreadCount, 0);
  await call("PUT", "/api/dm/threads/marky/read", { lastReadMessageId: firstReply.id });
  assert.equal((await thread("marky"))?.unreadCount, 0, "an older cursor does not move it back");
  assert.equal((await call("PUT", "/api/dm/threads/marky/read", { lastReadMessageId: "dm_nope" })).status, 400);
});

test("the default head follows the view until the person pins, then their pins win", async () => {
  const saved: string[][] = [];
  const run = startDemo({ speed: 1 });
  const api = createDemoApi(run.source, { onPinsChange: (pins) => saved.push(pins) });
  const pins = async () => ((await api.handle("GET", "/api/me/bubbles")).body as { pinnedAgentIds: string[] }).pinnedAgentIds;
  assert.deepEqual(await pins(), ["g-man"], "the town view shows the crewhub lead");
  api.setView({ leadId: "cl-lead" });
  assert.deepEqual(await pins(), ["cl-lead"], "inside a building, its lead");
  api.setView({ leadId: "cr-dev-1" });
  assert.deepEqual(await pins(), ["g-man"], "a building led by a non-lead agent falls back to the crewhub lead");

  const put = await api.handle("PUT", "/api/me/bubbles", { pinnedAgentIds: ["marky", "g-man"] });
  assert.equal(put.status, 200);
  assert.deepEqual(saved, [["marky", "g-man"]]);
  api.setView({ leadId: "cl-lead" });
  assert.deepEqual(await pins(), ["marky", "g-man"]);
  assert.equal((await api.handle("PUT", "/api/me/bubbles", { pinnedAgentIds: ["postman"] })).status, 403);
  assert.equal((await api.handle("PUT", "/api/me/bubbles", { pinnedAgentIds: ["g-man", "g-man"] })).status, 400);
  assert.deepEqual(await pins(), ["marky", "g-man"], "a refused PUT keeps the pins");

  const reloaded = createDemoApi(run.source, { pins: [] });
  assert.deepEqual(((await reloaded.handle("GET", "/api/me/bubbles")).body as { pinnedAgentIds: string[] }).pinnedAgentIds, [], "an empty saved list is a choice, not the default");
});

test("messages page newest last with a before cursor", async () => {
  const { run, call } = chat();
  for (let i = 0; i < 3; i++) {
    await call("POST", "/api/dm/threads/analyst/messages", { bodyMarkdown: `Note ${i}`, clientId: `p-${i}` });
    run.play(9_000);
  }
  const page = async (query: string) => (await call("GET", `/api/dm/threads/analyst/messages${query}`)).body as DmMessagesResponse;
  const all = (await page("")).messages;
  assert.equal(all.length, 6);
  const newest = await page("?limit=4");
  assert.deepEqual(newest.messages.map((m) => m.id), all.slice(2).map((m) => m.id));
  assert.equal(newest.nextCursor, all[2]?.id);
  const older = await page(`?limit=4&before=${newest.nextCursor}`);
  assert.deepEqual(older.messages.map((m) => m.id), all.slice(0, 2).map((m) => m.id));
  assert.equal(older.nextCursor, null);
});

test("the person's chat survives a seek back and forth, and carries into the next loop", async () => {
  const { run, call, messages } = chat(at("6:00"));
  await call("POST", "/api/dm/threads/ux-lead/messages", { bodyMarkdown: "Scarf colour?", clientId: "s-1" });
  run.play(9_000);
  const before = await messages("ux-lead");
  assert.equal(before.length, 2);

  run.source.playback.seek(at("5:00"));
  assert.equal((await messages("ux-lead")).length, 0, "before it was sent, it is not there");
  run.source.playback.seek(at("6:20"));
  assert.deepEqual(
    (await messages("ux-lead")).map((m) => [m.clientId, m.bodyText, m.state]),
    before.map((m) => [m.clientId, m.bodyText, m.state]),
  );

  run.play(SCRIPT_DURATION_MS - at("6:20") + 5_000);
  assert.equal(run.source.playback.loop(), 1);
  const carried = await messages("ux-lead");
  assert.deepEqual(carried.map((m) => [m.clientId, m.bodyText, m.state]), before.map((m) => [m.clientId, m.bodyText, m.state]));
});

test("a message sent just before the loop end still gets its reply in the next loop", async () => {
  const { run, call, messages } = chat(SCRIPT_DURATION_MS - 3_000);
  await call("POST", "/api/dm/threads/g-man/messages", { bodyMarkdown: "Last call", clientId: "late-1" });
  run.play(12_000);
  assert.equal(run.source.playback.loop(), 1);
  const thread = await messages("g-man");
  const mine = thread.find((m) => m.clientId === "late-1");
  assert.equal(mine?.state, "answered");
  assert.equal(thread.find((m) => m.replyTo === mine?.id)?.author.id, "g-man");
});
