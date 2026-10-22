/**
 * Road 2 of the chat (round 28): the page's own reads of crewhub-loops. The request shape is pinned exactly (a GET
 * with the person's cookie and nothing of our own: no header, so the browser sends no pre-flight), the four routes and
 * nothing else, the events query (the two chat types, limit 50, the sealed cursor or from=tail), the probe's verdicts
 * from what the browser lets the page see, the readers of loops' answers, and the back-off. The fetch is injected
 * here; one test speaks to a server on 127.0.0.1 (loopback to itself) to see the headers that arrive.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  PAGE_CHAT_EVENTS_LIMIT,
  PAGE_CHAT_INIT,
  POLL_HIDDEN_MS,
  POLL_MAX_MS,
  POLL_MS,
  eventsUrl,
  REPROBE_MS,
  REPROBE_SLOW_MS,
  firstLine,
  isLoopbackOrigin,
  messageUrl,
  pageGet,
  pollDelay,
  pollPageChat,
  probePageChat,
  probeVerdict,
  readEvents,
  readPageChatLine,
  readThreads,
  reprobeDelay,
  threadMessagesUrl,
  threadsUrl,
  type FetchLike,
} from "../src/pageChat.ts";

import { PAIRING_KEY, bearerHeaders } from "../src/pairingBearer.ts";

const ORIGIN = "http://127.0.0.1:8293";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fetch that records every call and answers by route. */
function recorder(answer: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return answer(url, init);
  };
  return { calls, fetchFn };
}

test("round 31: a paired tab's bearer (x-world-pair, for the host) never rides on road 2's asks of loops, probe or poll", async () => {
  const kept = new Map<string, string>([[PAIRING_KEY, "tabid.bearermac"]]);
  (globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
  try {
    assert.deepEqual(bearerHeaders(), { "x-world-pair": "tabid.bearermac" }, "the host's requests would carry it");
    const { calls, fetchFn } = recorder((url) => (url.endsWith("/api/dm/threads") ? json(200, { threads: [{ agentId: "cr-1" }] }) : json(200, { events: [], cursor: "c1" })));
    await probePageChat(ORIGIN, fetchFn);
    await pollPageChat(ORIGIN, { fromTail: true }, fetchFn);
    assert.ok(calls.length >= 2, `the probe and the poll asked: ${calls.length}`);
    for (const call of calls) {
      assert.equal(call.init?.headers, undefined, `${call.url}: no header of our own, the bearer included`);
      assert.ok(!JSON.stringify(call.init).includes("tabid.bearermac"), `${call.url}: the bearer is not in the request`);
    }
  } finally {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  }
});

test("the request shape: a GET with credentials included and nothing else; no headers key at all", async () => {
  assert.deepEqual({ ...PAGE_CHAT_INIT }, { method: "GET", credentials: "include" });
  assert.ok(Object.isFrozen(PAGE_CHAT_INIT));
  const { calls, fetchFn } = recorder(() => json(200, { threads: [] }));
  await pageGet(threadsUrl(ORIGIN), fetchFn);
  assert.equal(calls.length, 1);
  const init = calls[0]!.init!;
  assert.deepEqual(Object.keys(init).sort(), ["credentials", "method", "signal"], "the method, the cookie, the timeout: no headers, no body, no mode");
  assert.equal(init.method, "GET");
  assert.equal(init.credentials, "include");
  assert.equal(init.headers, undefined, "no header of our own: the request stays simple and the browser sends no OPTIONS");
  assert.equal(init.body, undefined);
});

test("the four routes and nothing else; the ids are checked before anything is sent", () => {
  assert.equal(threadsUrl(ORIGIN), `${ORIGIN}/api/dm/threads`);
  assert.equal(threadMessagesUrl(ORIGIN, "crewhub-lead"), `${ORIGIN}/api/dm/threads/crewhub-lead/messages`);
  assert.equal(messageUrl(ORIGIN, "dm_76A9DBNYV6CN"), `${ORIGIN}/api/dm/messages/dm_76A9DBNYV6CN`);
  assert.throws(() => threadMessagesUrl(ORIGIN, "../tickets"), /not an agent name/);
  assert.throws(() => messageUrl(ORIGIN, "x/y"), /not a message id/);
  assert.throws(() => messageUrl(ORIGIN, ""), /not a message id/);
});

test("the events query: the two chat types, limit 50, the sealed cursor or from=tail, never after=", () => {
  const tail = new URL(eventsUrl(ORIGIN, { fromTail: true }));
  assert.equal(tail.pathname, "/api/events");
  assert.equal(tail.searchParams.get("types"), "dm.created,dm.answered");
  assert.equal(tail.searchParams.get("limit"), "50");
  assert.equal(PAGE_CHAT_EVENTS_LIMIT, 50);
  assert.equal(tail.searchParams.get("from"), "tail");
  assert.equal(tail.searchParams.get("cursor"), null);
  const next = new URL(eventsUrl(ORIGIN, { cursor: "c.sealed_token" }));
  assert.equal(next.searchParams.get("cursor"), "c.sealed_token");
  assert.equal(next.searchParams.get("from"), null);
  assert.equal(next.searchParams.get("after"), null);
  assert.deepEqual([...next.searchParams.keys()].sort(), ["cursor", "limit", "types"]);
});

test("the verdict from what the browser lets the page see: 200 on, 401 and 403 signed out, an opaque failure needs the second ask", () => {
  assert.equal(probeVerdict({ kind: "answer", status: 200, body: {} }, null), "on");
  assert.equal(probeVerdict({ kind: "answer", status: 401, body: {} }, null), "signed-out");
  assert.equal(probeVerdict({ kind: "answer", status: 403, body: {} }, null), "signed-out", "a readable 403 (never the guard's) is a session loops does not accept");
  assert.equal(probeVerdict({ kind: "answer", status: 500, body: null }, null), "unreachable");
  assert.equal(probeVerdict({ kind: "failed", reason: "Failed to fetch" }, true), "origin-not-set", "something answered the no-cors ask: the server is there, the origin is what it refuses");
  assert.equal(probeVerdict({ kind: "failed", reason: "Failed to fetch" }, false), "unreachable");
  assert.equal(probeVerdict({ kind: "failed", reason: "Failed to fetch" }, null), "unreachable");
});

test("the probe: one GET of the threads; the threads come with an on verdict; a failure asks once more in no-cors mode and reads only that something answered", async () => {
  const on = recorder(() => json(200, { threads: [{ agentId: "crewhub-lead", lastMessageAt: "2026-10-22T20:00:00Z", unreadCount: 1 }] }));
  const verdict = await probePageChat(ORIGIN, on.fetchFn);
  assert.equal(verdict.verdict, "on");
  assert.deepEqual(verdict.threads, [{ agentId: "crewhub-lead", lastMessageAt: "2026-10-22T20:00:00Z", unreadCount: 1 }]);
  assert.equal(on.calls.length, 1, "no second ask when the first answered");
  const out = recorder(() => json(401, { error: { code: "unauthenticated" } }));
  assert.equal((await probePageChat(ORIGIN, out.fetchFn)).verdict, "signed-out");
  assert.equal(out.calls.length, 1);
  const refused = recorder((_url, init) => (init?.mode === "no-cors" ? Response.error() : Promise.reject(new TypeError("Failed to fetch"))));
  const refusedVerdict = await probePageChat(ORIGIN, refused.fetchFn);
  assert.equal(refusedVerdict.verdict, "origin-not-set");
  assert.equal(refused.calls.length, 2);
  assert.equal(refused.calls[1]!.url, threadsUrl(ORIGIN), "the second ask is of the same route");
  assert.equal(refused.calls[1]!.init?.mode, "no-cors");
  assert.equal(refused.calls[1]!.init?.method, "GET");
  assert.equal(refused.calls[1]!.init?.headers, undefined);
  const gone = recorder(() => Promise.reject(new TypeError("Failed to fetch")));
  assert.equal((await probePageChat(ORIGIN, gone.fetchFn)).verdict, "unreachable");
  assert.equal(gone.calls.length, 2);
});

test("the readers: threads leniently, events to the agents' new messages with the cursor, a message to one line cut as the host cuts it", () => {
  assert.deepEqual(readThreads({ threads: [{ agentId: "a", lastMessageAt: "t", unreadCount: 2 }, { agentId: "", lastMessageAt: "t" }, { agentId: "b", lastMessageAt: "t", unreadCount: -1 }, null] }), [
    { agentId: "a", lastMessageAt: "t", unreadCount: 2 },
    { agentId: "b", lastMessageAt: "t", unreadCount: 0 },
  ]);
  assert.deepEqual(readThreads(null), []);
  const page = readEvents({
    events: [
      { seq: 1, type: "dm.created", actor: { id: "nicky", kind: "user" }, payload: { threadId: "t1", messageId: "m1", agentId: "crewhub-lead" } },
      { seq: 2, type: "dm.created", actor: { id: "crewhub-lead", kind: "agent" }, payload: { threadId: "t1", messageId: "m2", agentId: "crewhub-lead" } },
      { seq: 3, type: "dm.answered", actor: { id: "crewhub-lead", kind: "agent" }, payload: { threadId: "t1", messageId: "m1" } },
      { seq: 4, type: "ticket.moved", actor: { id: "x", kind: "agent" }, payload: {} },
      { seq: 5, type: "dm.created", actor: { id: "bad", kind: "agent" }, payload: { threadId: "t1", messageId: "m/3", agentId: "bad" } },
    ],
    lastSeq: 5,
    cursor: "c.next",
  });
  assert.deepEqual(page.agentDms, [{ messageId: "m2", threadId: "t1", agentId: "crewhub-lead" }], "the person's own message, the answered event and a foreign type are not an agent's line; an id outside the shape is dropped");
  assert.equal(page.dmEvents, 4);
  assert.equal(page.cursor, "c.next");
  assert.deepEqual(readEvents({ events: [], lastSeq: 0 }), { agentDms: [], dmEvents: 0, cursor: null });
  const ids = { messageId: "m2", threadId: "t1", agentId: "crewhub-lead" };
  assert.deepEqual(readPageChatLine(ids, { message: { id: "m2", bodyText: "\n\nFirst line here.\nSecond", createdAt: "2026-10-22T21:00:00Z", author: { id: "crewhub-lead", kind: "agent", displayName: "CrewHub lead" } } }), {
    agentId: "crewhub-lead",
    agentName: "CrewHub lead",
    text: "First line here.",
    at: "2026-10-22T21:00:00Z",
    messageId: "m2",
    threadId: "t1",
  });
  assert.equal(readPageChatLine(ids, { message: { bodyText: "hi", author: { kind: "user" } } }), null, "a person's message is no bubble");
  assert.equal(readPageChatLine(ids, { message: { bodyText: "   \n  " } }), null, "an empty line is no bubble");
  assert.equal(readPageChatLine(ids, null), null);
  const long = "x".repeat(200);
  assert.equal(firstLine(long).length, 140);
  assert.ok(firstLine(long).endsWith("…"));
});

test("one poll: the events, each agent message by id, the threads again when a dm event came; a 401 is signed out, a 410 is the cursor gone", async () => {
  const seen: string[] = [];
  const fetchFn: FetchLike = async (url) => {
    seen.push(url.replace(ORIGIN, ""));
    if (url.includes("/api/events")) return json(200, { events: [{ seq: 9, type: "dm.created", actor: { id: "crewhub-lead", kind: "agent" }, payload: { threadId: "t1", messageId: "m9", agentId: "crewhub-lead" } }], lastSeq: 9, cursor: "c.9" });
    if (url.endsWith("/api/dm/messages/m9")) return json(200, { message: { bodyText: "Answer from crewhub-lead: hello", createdAt: "2026-10-22T21:05:00Z", author: { kind: "agent", displayName: "crewhub-lead" } } });
    if (url.endsWith("/api/dm/threads")) return json(200, { threads: [{ agentId: "crewhub-lead", lastMessageAt: "2026-10-22T21:05:00Z", unreadCount: 1 }] });
    return json(404, {});
  };
  const outcome = await pollPageChat(ORIGIN, { cursor: "c.8" }, fetchFn);
  assert.equal(outcome.kind, "ok");
  if (outcome.kind !== "ok") return;
  assert.equal(outcome.cursor, "c.9");
  assert.deepEqual(outcome.lines.map((l) => [l.agentId, l.text, l.messageId]), [["crewhub-lead", "Answer from crewhub-lead: hello", "m9"]]);
  assert.deepEqual(outcome.threads, [{ agentId: "crewhub-lead", lastMessageAt: "2026-10-22T21:05:00Z", unreadCount: 1 }]);
  assert.deepEqual(seen, ["/api/events?types=dm.created%2Cdm.answered&limit=50&cursor=c.8", "/api/dm/messages/m9", "/api/dm/threads"], "the events, the message by id, the threads: in that order and nothing else");
  const quiet = await pollPageChat(ORIGIN, { fromTail: true }, async () => json(200, { events: [], lastSeq: 3, cursor: "c.3" }));
  assert.deepEqual(quiet, { kind: "ok", lines: [], threads: null, cursor: "c.3" }, "no dm event: the threads are not read");
  assert.deepEqual(await pollPageChat(ORIGIN, { cursor: "c" }, async () => json(401, {})), { kind: "signed-out" });
  assert.deepEqual(await pollPageChat(ORIGIN, { cursor: "c" }, async () => json(410, { error: { code: "cursor_expired" } })), { kind: "cursor-expired" });
  assert.equal((await pollPageChat(ORIGIN, { cursor: "c" }, async () => Promise.reject(new TypeError("Failed to fetch")))).kind, "failed");
  assert.equal((await pollPageChat(ORIGIN, { cursor: "c" }, async () => json(503, {}))).kind, "failed");
});

test("the back-off: 5 s shown, a minute hidden, doubling to a minute after failures", () => {
  assert.equal(pollDelay({ hidden: false, failures: 0 }), POLL_MS);
  assert.equal(POLL_MS, 5000);
  assert.equal(pollDelay({ hidden: true, failures: 0 }), POLL_HIDDEN_MS);
  assert.equal(pollDelay({ hidden: false, failures: 1 }), 10_000);
  assert.equal(pollDelay({ hidden: false, failures: 2 }), 20_000);
  assert.equal(pollDelay({ hidden: false, failures: 9 }), POLL_MAX_MS);
});

test("against a server on 127.0.0.1: a real GET carries no header of ours (no content type, no x- header, no key), and the answer is read", async () => {
  const headers: Record<string, string | string[] | undefined>[] = [];
  const server = createServer((req, res) => {
    headers.push(req.headers);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ threads: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const answer = await pageGet(threadsUrl(origin));
    assert.deepEqual(answer, { kind: "answer", status: 200, body: { threads: [] } });
    assert.equal(headers.length, 1);
    const names = Object.keys(headers[0]!);
    assert.ok(!names.includes("content-type"), names.join(","));
    assert.ok(!names.some((n) => n.startsWith("x-")), names.join(","));
    assert.ok(!names.includes("authorization"), names.join(","));
    assert.ok(!names.includes("cookie"), "no cookie in node: the browser adds the person's own");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("round 29 (Medium 3, the reviewer's proof 2): loops' chat bubbles feature off answers 409 feature_off through the origin: the verdict is chat-off, and a 409 while polling is chat-off, never a silent ok", async () => {
  const feature = { error: { code: "feature_off", message: "The chat bubbles feature is off", detail: { feature: "bubbles" } } };
  assert.equal(probeVerdict({ kind: "answer", status: 409, body: feature }, null), "chat-off");
  const fetchFn: FetchLike = async (url) => (url.includes("/api/events") ? json(200, { events: [{ seq: 7, type: "dm.created", actor: { id: "crewhub-lead", kind: "agent" }, payload: { threadId: "t1", messageId: "m1", agentId: "crewhub-lead" } }], lastSeq: 7, cursor: "c.2" }) : json(409, feature));
  assert.deepEqual(await pollPageChat(ORIGIN, { cursor: "c.1" }, fetchFn), { kind: "chat-off" });
  const threadsOff: FetchLike = async (url) => (url.includes("/api/events") ? json(200, { events: [{ seq: 7, type: "dm.answered", actor: { id: "crewhub-lead", kind: "agent" }, payload: {} }], lastSeq: 7, cursor: "c.2" }) : json(409, feature));
  assert.deepEqual(await pollPageChat(ORIGIN, { cursor: "c.1" }, threadsOff), { kind: "chat-off" }, "the threads read after a dm event answers 409 too");
});

test("round 29 (Low 4, the reviewer's proof 4): a message read that fails fails the poll without a cursor, so the next poll asks the same page again; a 404 is skipped; a 5xx fails", async () => {
  const events = { events: [{ seq: 7, type: "dm.created", actor: { id: "crewhub-lead", kind: "agent" }, payload: { threadId: "t1", messageId: "m1", agentId: "crewhub-lead" } }], lastSeq: 7, cursor: "c.2" };
  let asks = 0;
  const failing: FetchLike = async (url) => {
    if (url.includes("/api/events")) return json(200, events);
    if (url.includes("/api/dm/messages/")) {
      asks += 1;
      throw new TypeError("Failed to fetch");
    }
    return json(200, { threads: [] });
  };
  const failed = await pollPageChat(ORIGIN, { cursor: "c.1" }, failing);
  assert.equal(asks, 1);
  assert.equal(failed.kind, "failed", "the cursor stays at c.1: the next poll reads m1 again");
  assert.match(failed.kind === "failed" ? failed.reason : "", /the message m1: Failed to fetch/);
  const gone: FetchLike = async (url) => (url.includes("/api/events") ? json(200, events) : url.includes("/api/dm/messages/") ? json(404, { error: { code: "not_found" } }) : json(200, { threads: [] }));
  assert.deepEqual(await pollPageChat(ORIGIN, { cursor: "c.1" }, gone), { kind: "ok", lines: [], threads: [], cursor: "c.2" }, "a message the person may not see: skipped, the page is done");
  const broken: FetchLike = async (url) => (url.includes("/api/events") ? json(200, events) : json(503, {}));
  assert.equal((await pollPageChat(ORIGIN, { cursor: "c.1" }, broken)).kind, "failed");
});

test("round 29 (Low 8, Low 9): only a loopback origin is asked; nothing answering backs off from the poll's pace to five minutes, a refused origin keeps the flat five minutes, signed out and chat off keep 30 s", () => {
  assert.equal(isLoopbackOrigin("http://127.0.0.1:8293"), true);
  assert.equal(isLoopbackOrigin("http://localhost:8293"), true);
  assert.equal(isLoopbackOrigin("http://[::1]:8293"), true);
  assert.equal(isLoopbackOrigin("https://crewhub.example"), false);
  assert.equal(isLoopbackOrigin("not a url"), false);
  assert.equal(reprobeDelay("unreachable", 1), POLL_MS);
  assert.equal(reprobeDelay("unreachable", 2), 2 * POLL_MS);
  assert.equal(reprobeDelay("unreachable", 5), 16 * POLL_MS);
  assert.equal(reprobeDelay("unreachable", 12), REPROBE_SLOW_MS);
  assert.equal(reprobeDelay("origin-not-set", 12), REPROBE_SLOW_MS);
  assert.equal(reprobeDelay("signed-out", 12), REPROBE_MS);
  assert.equal(reprobeDelay("chat-off", 12), REPROBE_MS);
});
