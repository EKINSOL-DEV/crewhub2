/* Round 34: road 1's answers under fuzz, through the host. On the key's stream a `dm.created` envelope's payload names
   a message, the host reads it by id with its key (`chatLineFromKey`) and hands the tabs a chat line; at the key check
   it reads the threads (`threadFactsOf`). Both come from crewhub-loops and are read here over the stub. Seeded, a few
   hundred inputs each (every one is a request round trip): payloads of any shape with ids of odd text, message
   answers of any shape and status, threads answers of any shape. What a tab sees: only well-shaped chat lines (the
   text never empty, never over 140 characters, never with a newline) and thread facts of the three fields; what loops
   sees: every message read on `/api/dm/messages/<one segment>`, never a path a tricky id could bend; and the host
   still answering health. */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { LINE_MAX } from "../src/chatLine.ts";
import { createHost } from "../src/host.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { waitFor } from "./wait.ts";
import { Fuzz, ODD_STRINGS, protoSnapshot, replay } from "../../../packages/world-engine/test/fuzz.ts";

const SEEDS = [34_061, 34_062];
const MESSAGE = { id: "dm_x", threadId: "dmt_boing", agentId: "boing", author: { id: "boing", kind: "agent", displayName: "Boing" }, bodyText: "Done with the lamp.\nNext: the rug.", bodyMarkdown: "Done with the lamp.", createdAt: "2026-10-21T20:00:00.000Z" };
const THREAD = { id: "dmt_boing", agentId: "boing", createdAt: "2026-10-21T18:00:00.000Z", lastMessageAt: "2026-10-22T07:05:00.174Z", unreadCount: 1 };

describe("round 34 fuzz: road 1's answers through the host", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  it("dm.created payloads of any shape and message answers of any shape: only well-shaped lines reach the tab, every read is one path segment, the host stands", async () => {
    const before = protoSnapshot();
    const base = installation();
    const routes: Record<string, unknown> = { ...base.routes };
    const answers = new Map<string, { status: number; body: unknown }>();
    const f = new Fuzz(SEEDS[0]!);
    // Two hundred message ids, each with its own fuzzed answer registered on the stub; and odd ids the stub never knows.
    const ids: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const id = `f${i}`;
      ids.push(id);
      const status = f.pick([200, 200, 200, 200, 200, 403, 404, 409, 500, 204]);
      const body = f.bool(0.4) ? { message: { ...MESSAGE, id } } : f.bool(0.5) ? { message: f.mutate({ ...MESSAGE, id }, f.int(1, 3)) } : f.value(3);
      answers.set(id, { status, body });
      routes[`/api/dm/messages/${id}`] = () => ({ status, body });
    }
    const stub = await createLoopsStub({ ...base, routes, keyReadsChat: true, dm: { threads: [THREAD], messages: { [MESSAGE.id]: MESSAGE } } });
    cleanup.push(() => stub.close());
    const lines: string[] = [];
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: (line) => lines.push(line) });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    await tab.next((m) => m.type === "status" && m.loops === "ok");
    // The payloads: the registered ids, odd ids, and shapes that are no payload at all.
    const payloads: unknown[] = [];
    for (const id of ids) payloads.push({ threadId: "dmt_boing", messageId: id, agentId: "boing" });
    for (const s of ODD_STRINGS) payloads.push({ threadId: "dmt_boing", messageId: s, agentId: "boing" });
    for (let i = 0; i < 100; i += 1) payloads.push(f.bool(0.5) ? f.mutate({ threadId: "dmt_boing", messageId: `f${i}`, agentId: "boing" }, f.int(1, 2)) : f.value(2));
    // In small batches: the host reads every agent message as it comes, one connection each, and a burst of hundreds
    // at once overflows a listen backlog (macOS 128), which is loops' concern on the day, not this test's.
    const expectRead = new Set<string>();
    for (const [i, payload] of payloads.entries()) {
      if (i % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 5));
      const actor = f.bool(0.9) ? { id: "boing", kind: "agent" } : f.pick([{ id: "nicky", kind: "user" }, { id: "x", kind: f.string(6) }, f.value(1)]);
      if (i < ids.length && typeof actor === "object" && actor !== null && (actor as { kind?: unknown }).kind === "agent") expectRead.add(ids[i]!);
      try {
        stub.emit({ type: "dm.created", project: null, ticket: null, actor, recipientIds: ["nicky"], payload } as Parameters<typeof stub.emit>[0]);
      } catch (error) {
        // The stub refuses an envelope it cannot serialise: that is the stub's shape, not the host's.
        assert.match(String(error), /JSON|circular|serial/i, replay(SEEDS[0]!, i, payload));
      }
    }
    // The sentinel: a message the stub knows whole, emitted last; its line comes after the others were tried.
    stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "boing", kind: "agent" }, recipientIds: ["nicky"], payload: { threadId: "dmt_boing", messageId: MESSAGE.id, agentId: "boing" } });
    try {
      await tab.next((m) => m.type === "chat" && (m.chat as { messageId: string }).messageId === MESSAGE.id, 8_000);
    } catch (error) {
      const statuses = tab.messages.filter((m) => m.type === "status").map((m) => `${m.loops}/${m.stream}`);
      const agentIds = tab.messages.filter((m) => m.type === "event").map((m) => m.envelope as { type: string; actor?: { kind?: unknown }; payload?: { messageId?: unknown } }).filter((e) => e.type === "dm.created" && e.actor?.kind === "agent" && typeof e.payload?.messageId === "string").map((e) => e.payload!.messageId as string);
      const readIds = new Set(stub.requests.filter((r) => r.path.startsWith("/api/dm/messages/")).map((r) => decodeURIComponent(r.path.slice("/api/dm/messages/".length))));
      const unread = agentIds.filter((id) => !readIds.has(id));
      const statusOf = (id: string) => answers.get(id)?.status ?? "?";
      const readList = [...readIds];
      assert.fail(`the sentinel's line never came (${String(error).slice(0, 60)}); unread statuses ${JSON.stringify(unread.slice(0, 40).map(statusOf))}; read statuses ${JSON.stringify(readList.slice(0, 40).map(statusOf))}; last read ${readList.at(-1)}; events ${tab.messages.filter((m) => m.type === "event").length}, agent dms ${agentIds.length}, unread ${unread.length} e.g. ${JSON.stringify(unread.slice(0, 6)).slice(0, 300)}; log errors: ${lines.filter((l) => /rror|unreadable|skipp/.test(l)).slice(0, 5).join(" | ").slice(0, 400)}; chats ${tab.messages.filter((m) => m.type === "chat").length}, statuses ${statuses.slice(-4).join(" ")}, reads ${stub.requests.filter((r) => r.path.startsWith("/api/dm/messages")).length}, health ${JSON.stringify((await health()).connection.stream)}, log: ${lines.slice(-6).join(" | ")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    const chats = tab.messages.filter((m) => m.type === "chat").map((m) => m.chat as { agentId: unknown; agentName?: unknown; text: unknown; at: unknown; messageId: unknown; threadId: unknown });
    assert.ok(chats.length > 20, `lines reached the tab: ${chats.length}`);
    for (const chat of chats) {
      assert.ok(typeof chat.text === "string" && chat.text !== "" && chat.text.length <= LINE_MAX && !/[\r\n]/.test(chat.text) && chat.text === chat.text.trim(), `a line's text: ${JSON.stringify(chat.text).slice(0, 80)}`);
      assert.ok(typeof chat.agentId === "string" && typeof chat.messageId === "string" && typeof chat.threadId === "string" && typeof chat.at === "string", JSON.stringify(chat).slice(0, 120));
      assert.ok(chat.agentName === undefined || typeof chat.agentName === "string", JSON.stringify(chat).slice(0, 120));
      assert.deepEqual(Object.keys(chat).filter((k) => k !== "agentName").sort(), ["agentId", "at", "messageId", "text", "threadId"]);
      if (typeof chat.messageId === "string" && answers.has(chat.messageId)) assert.equal(answers.get(chat.messageId)!.status, 200, `a line only from a 200: ${chat.messageId}`);
    }
    // Every registered id the stream named with an agent actor was read; a 200 with a readable message became a line.
    const agentIds = tab.messages.filter((m) => m.type === "event").map((m) => m.envelope as { type: string; actor?: { kind?: unknown }; payload?: { messageId?: unknown } }).filter((e) => e.type === "dm.created" && e.actor?.kind === "agent" && typeof e.payload?.messageId === "string").map((e) => e.payload!.messageId as string);
    const readIds = new Set(stub.requests.filter((r) => r.path.startsWith("/api/dm/messages/")).map((r) => decodeURIComponent(r.path.slice("/api/dm/messages/".length))));
    assert.deepEqual([...expectRead].filter((id) => !readIds.has(id)), [], "every whole payload an agent sent was read");
    assert.ok(agentIds.length > expectRead.size, "the stream named them all");
    const lined = new Set(chats.map((c) => c.messageId));
    for (const id of expectRead) if (answers.get(id)!.status === 200 && JSON.stringify(answers.get(id)!.body) === JSON.stringify({ message: { ...MESSAGE, id } })) assert.ok(lined.has(id), `${id}: a whole message answered 200 is a line`);
    // Every read loops saw: one segment after /api/dm/messages/, whatever the id looked like.
    const reads = stub.requests.filter((r) => r.path.startsWith("/api/dm/messages"));
    assert.ok(reads.length > 150, `reads made: ${reads.length}`);
    for (const r of reads) assert.match(r.path, /^\/api\/dm\/messages\/[^/]+$/, `a read's path: ${r.path.slice(0, 120)}`);
    assert.ok(!stub.requests.some((r) => /\.\.|%2e%2e/i.test(decodeURIComponent(r.path).replace(/[^/]*$/, ""))), "no id bent the path upwards");
    assert.ok(stub.requests.every((r) => r.cookie === undefined), "never a cookie");
    assert.equal((await health()).connection.stream.state, "ok", "the host still stands");
    assert.ok(!lines.some((l) => /TypeError|RangeError|at .*\.ts:\d+/.test(l)), `nothing thrown into the log: ${lines.filter((l) => /Error/.test(l)).join(" | ")}`);
    assert.equal(protoSnapshot(), before);
  });

  it("threads answers of any shape at the key check: the tab gets facts of the three fields or none, and the host says what it read", async () => {
    const f = new Fuzz(SEEDS[1]!);
    const bodies: unknown[] = [
      { threads: [THREAD, { id: "dmt_bad" }, null, 7, { agentId: "", lastMessageAt: "t" }, { agentId: "a", lastMessageAt: "t", unreadCount: -1 }, { agentId: "b", lastMessageAt: "t", unreadCount: 1.5 }, { agentId: "c", lastMessageAt: "t", unreadCount: 1e21 }] },
      JSON.parse(`{"__proto__":{"polluted":1},"threads":[{"__proto__":{"x":1},"agentId":"d","lastMessageAt":"t","unreadCount":2}]}`),
      { threads: Array.from({ length: 3000 }, (_, i) => ({ agentId: `a${i}`, lastMessageAt: "t", unreadCount: i })) },
      f.value(3),
      { threads: "not a list" },
      [],
    ];
    for (const [i, body] of bodies.entries()) {
      const before = protoSnapshot();
      const base = installation();
      const stub = await createLoopsStub({ ...base, routes: { ...base.routes, "/api/dm/threads": () => ({ status: 200, body }) }, keyReadsChat: true });
      cleanup.push(() => stub.close());
      const lines: string[] = [];
      const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: (line) => lines.push(line) });
      cleanup.push(() => host.close());
      const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
      await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
      assert.deepEqual((await health()).connection.session, { state: "key" }, `${i}: a 200 on the threads is the key road, whatever the body`);
      const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
      cleanup.push(() => tab.close());
      const threads = await tab.next((m) => m.type === "threads", 5_000);
      const rows = threads.threads as { agentId: unknown; lastMessageAt: unknown; unreadCount: unknown }[];
      assert.ok(Array.isArray(rows), `${i}`);
      for (const row of rows) {
        assert.deepEqual(Object.keys(row).sort(), ["agentId", "lastMessageAt", "unreadCount"], `${i}: ${JSON.stringify(row)}`);
        assert.ok(typeof row.agentId === "string" && row.agentId !== "" && typeof row.lastMessageAt === "string" && Number.isInteger(row.unreadCount) && (row.unreadCount as number) >= 0, `${i}: ${JSON.stringify(row)}`);
      }
      assert.ok(lines.some((l) => new RegExp(`the key reads the chat on this crewhub-loops: .*; ${rows.length} chat thread\\(s\\)`).test(l)), `${i}: the log counts what it read: ${lines.filter((l) => /reads the chat/.test(l)).join(" | ")}`);
      assert.equal(protoSnapshot(), before);
      for (const fn of cleanup.reverse()) await fn();
      cleanup.length = 0;
    }
  });
});
