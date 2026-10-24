/* Round 34: road 2's answers under fuzz. What crewhub-loops sends the page through the origin is read by `readThreads`,
   `readEvents` and `readPageChatLine`, judged by `probeVerdict`, and asked for by `probePageChat` and `pollPageChat`
   over the one request shape. Seeded, a few thousand inputs: answers of any shape, broken copies of the real ones, odd
   statuses, bodies that are not JSON, fetches that fail. What a caller sees: never a throw; a thread fact, an agent's
   message id or a bubble line only when its fields are of the right shape (a line never empty, never over 140
   characters, never with a newline); a verdict from the contract's set; every request a GET with the cookie and
   nothing else, on the four routes, the events query as loops forces it and never `after=`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGE_CHAT_EVENTS_LIMIT, PAGE_CHAT_EVENT_TYPES, PAGE_CHAT_LINE_MAX, firstLine, pollPageChat, probePageChat, probeVerdict, readEvents, readPageChatLine, readThreads, type PageProbe } from "../src/pageChat.ts";
import { Fuzz, ODD_NUMBERS, ODD_STRINGS, protoSnapshot, replay } from "../../world-engine/test/fuzz.ts";

const SEEDS = [34_031, 34_032, 34_033];
const PROBES: readonly PageProbe[] = ["on", "signed-out", "origin-not-set", "unreachable", "chat-off", "remote", "unknown"];
const MESSAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ORIGIN = "http://127.0.0.1:5298";
const THREADS = { threads: [{ id: "dmt_1", agentId: "cr-lead", createdAt: "2026-10-23T03:00:00Z", lastMessageAt: "2026-10-23T04:00:00Z", unreadCount: 1 }] };
const EVENTS = {
  events: [
    { seq: 1, type: "dm.created", actor: { id: "nicky", kind: "user" }, payload: { threadId: "dmt_1", messageId: "dm_p1", agentId: "cr-lead" } },
    { seq: 2, type: "dm.created", actor: { id: "cr-lead", kind: "agent" }, payload: { threadId: "dmt_1", messageId: "dm_a2", agentId: "cr-lead" } },
    { seq: 3, type: "dm.answered", actor: { id: "cr-lead", kind: "agent" }, payload: { threadId: "dmt_1", messageId: "dm_p1" } },
  ],
  lastSeq: 3,
  cursor: "c.abc",
};
const MESSAGE = { message: { id: "dm_a2", threadId: "dmt_1", bodyText: "Done with the lamp.\nNext the rug.", createdAt: "2026-10-23T04:00:01Z", author: { id: "cr-lead", kind: "agent", displayName: "CrewHub lead" } } };
const IDS = { messageId: "dm_a2", threadId: "dmt_1", agentId: "cr-lead" };

test("round 34 fuzz: the three readers take any answer and give only well-shaped facts, lines and ids", () => {
  const before = protoSnapshot();
  let facts = 0,
    dms = 0,
    lines = 0;
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 500; i += 1) {
      const any = f.bool(0.3);
      const threads = readThreads(any ? f.value(3) : f.mutate(THREADS, f.int(1, 3)));
      for (const t of threads) {
        facts += 1;
        assert.ok(typeof t.agentId === "string" && t.agentId !== "" && typeof t.lastMessageAt === "string" && Number.isInteger(t.unreadCount) && t.unreadCount >= 0, replay(seed, i, t));
        assert.deepEqual(Object.keys(t).sort(), ["agentId", "lastMessageAt", "unreadCount"], replay(seed, i, t));
      }
      const page = readEvents(any ? f.value(3) : f.mutate(EVENTS, f.int(1, 3)));
      assert.ok(Number.isInteger(page.dmEvents) && page.dmEvents >= page.agentDms.length, replay(seed, i, page));
      assert.ok(page.cursor === null || (typeof page.cursor === "string" && page.cursor !== ""), replay(seed, i, page));
      for (const dm of page.agentDms) {
        dms += 1;
        assert.ok(MESSAGE_ID.test(dm.messageId) && typeof dm.threadId === "string" && typeof dm.agentId === "string", replay(seed, i, dm));
      }
      const line = readPageChatLine(IDS, any ? f.value(3) : f.mutate(MESSAGE, f.int(1, 3)));
      if (line !== null) {
        lines += 1;
        assert.ok(line.text !== "" && line.text.length <= PAGE_CHAT_LINE_MAX && !/[\r\n]/.test(line.text) && line.text === line.text.trim(), replay(seed, i, line));
        assert.ok(typeof line.at === "string" && line.messageId === IDS.messageId && line.threadId === IDS.threadId && line.agentId === IDS.agentId, replay(seed, i, line));
        assert.ok(line.agentName === undefined || (typeof line.agentName === "string" && line.agentName !== ""), replay(seed, i, line));
      }
    }
  }
  assert.ok(facts > 100 && dms > 100 && lines > 100, `the mix: ${facts} facts, ${dms} agent messages, ${lines} lines`);
  // The first line of any text: never empty when there is one, never over the cap, never a newline; a cut gets the ellipsis.
  for (const s of [...ODD_STRINGS, "\n\n  spaced  \nsecond", "x".repeat(140), "x".repeat(141), "🙂".repeat(100), "\uD83D".repeat(200)]) {
    const line = firstLine(s);
    assert.ok(line.length <= PAGE_CHAT_LINE_MAX && !/[\r\n]/.test(line) && line === line.trim(), JSON.stringify(s.slice(0, 20)));
    if (s.replace(/\r/g, "").split("\n").some((l) => l.trim() !== "")) assert.notEqual(line, "", JSON.stringify(s.slice(0, 20)));
  }
  assert.equal(firstLine("x".repeat(141)), `${"x".repeat(139)}…`);
  assert.equal(protoSnapshot(), before);
});

test("round 34 fuzz: the verdict of any answer is one of the contract's: 200 on, 401 and 403 signed out, 409 chat off, the rest unreachable, a failure by the second ask", () => {
  for (let status = 0; status <= 999; status += 1) {
    const verdict = probeVerdict({ kind: "answer", status, body: null }, null);
    assert.ok(PROBES.includes(verdict), `${status}`);
    assert.equal(verdict, status === 200 ? "on" : status === 401 || status === 403 ? "signed-out" : status === 409 ? "chat-off" : "unreachable", `${status}`);
  }
  for (const n of ODD_NUMBERS) assert.ok(PROBES.includes(probeVerdict({ kind: "answer", status: n, body: n }, null)), `${n}`);
  for (const something of [true, false, null]) {
    const verdict = probeVerdict({ kind: "failed", reason: "x" }, something);
    assert.equal(verdict, something === true ? "origin-not-set" : "unreachable");
  }
});

test("round 34 fuzz: the probe and the poll over a loops that answers anything: one request shape, four routes, the forced events query, an outcome from the set, lines well-shaped", async () => {
  const before = protoSnapshot();
  const kinds = new Map<string, number>();
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 150; i += 1) {
      const calls: { url: string; init: RequestInit | undefined }[] = [];
      const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
        calls.push({ url, init });
        if (f.bool(0.1)) throw new TypeError("Failed to fetch");
        if (f.bool(0.05)) await new Promise((resolve) => setTimeout(resolve, 1));
        const status = f.pick([200, 200, 200, 200, 401, 403, 404, 409, 410, 500, 502, 204, 299, 301]);
        const route = url.replace(ORIGIN, "").split("?")[0] ?? "";
        const real = route === "/api/dm/threads" ? THREADS : route === "/api/events" ? EVENTS : route.startsWith("/api/dm/messages/") ? MESSAGE : null;
        const body = f.bool(0.15) ? f.pick(["", "<html>", "null", "{", "[]", "﻿{}", "x".repeat(10_000)]) : f.jsonText(f.bool(0.5) ? real : f.mutate(real, f.int(1, 3)));
        return new Response(status === 204 ? null : body, { status, headers: { "content-type": "application/json" } });
      };
      let outcome;
      let probe;
      try {
        probe = await probePageChat(ORIGIN, fetchFn, 200);
        outcome = await pollPageChat(ORIGIN, f.bool(0.5) ? { fromTail: true } : { cursor: f.pick(["c.abc", "c.", "x".repeat(300), "c.\uD800"]) }, fetchFn, 200);
      } catch (error) {
        assert.fail(`${replay(seed, i)} threw ${String(error)}`);
      }
      assert.ok(PROBES.includes(probe.verdict) && Array.isArray(probe.threads) && typeof probe.detail === "string", replay(seed, i, probe));
      kinds.set(outcome.kind, (kinds.get(outcome.kind) ?? 0) + 1);
      assert.ok(["ok", "signed-out", "chat-off", "cursor-expired", "failed"].includes(outcome.kind), replay(seed, i, outcome));
      if (outcome.kind === "ok") {
        for (const line of outcome.lines) assert.ok(line.text !== "" && line.text.length <= PAGE_CHAT_LINE_MAX && !/[\r\n]/.test(line.text) && MESSAGE_ID.test(line.messageId), replay(seed, i, line));
        assert.ok(outcome.cursor === null || (typeof outcome.cursor === "string" && outcome.cursor !== ""), replay(seed, i));
        assert.ok(outcome.threads === null || Array.isArray(outcome.threads), replay(seed, i));
      }
      // Every request: GET, the cookie, nothing of ours; one of the four routes; the events query as loops forces it.
      for (const call of calls) {
        const init = call.init ?? {};
        const keys = Object.keys(init).sort().join(",");
        assert.ok(keys === "credentials,method,signal" || keys === "credentials,method,mode,signal", `${replay(seed, i)}: init keys ${keys}`);
        assert.ok(init.method === "GET" && init.credentials === "include" && !("headers" in init) && !("body" in init), replay(seed, i, { url: call.url, keys }));
        const url = new URL(call.url);
        assert.equal(url.origin, ORIGIN, replay(seed, i, call.url));
        const route = url.pathname;
        assert.ok(route === "/api/dm/threads" || route === "/api/events" || /^\/api\/dm\/messages\/[A-Za-z0-9_-]{1,64}$/.test(route), `${replay(seed, i)}: route ${route}`);
        if (route === "/api/events") {
          assert.equal(url.searchParams.get("types"), PAGE_CHAT_EVENT_TYPES, replay(seed, i, call.url));
          assert.equal(url.searchParams.get("limit"), String(PAGE_CHAT_EVENTS_LIMIT), replay(seed, i, call.url));
          assert.ok(!url.searchParams.has("after") && (url.searchParams.has("cursor") !== url.searchParams.has("from")), replay(seed, i, call.url));
        } else assert.equal(url.search, "", replay(seed, i, call.url));
      }
    }
  }
  assert.ok((kinds.get("ok") ?? 0) > 20 && (kinds.get("failed") ?? 0) > 20, `the mix: ${JSON.stringify([...kinds])}`);
  assert.equal(protoSnapshot(), before);
});
