/**
 * Question 14 (round 35): a burst of agent messages on the key's stream no longer loses bubbles. Until round 34 the
 * host read every agent `dm.created` on its own connection as it came, so 440 in one instant opened 440 connections
 * and the listen backlog (macOS 128) failed the surplus: those bubbles were lost. Now the reads pass a gate of
 * DM_READ_LIMIT at once in the stream's order, and a read loops did not refuse is tried once more. Against the stub,
 * whose message route here answers slowly, so the test can count how many reads loops holds open at the same time.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DM_READ_LIMIT } from "../src/dmReads.ts";
import { createHost } from "../src/host.ts";
import { type StubAnswer, createLoopsStub, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { waitFor } from "./wait.ts";

const message = (i: number) => ({ id: `dm_${i}`, threadId: `dmt_${i % 3}`, agentId: "boing", author: { id: "boing", kind: "agent", displayName: "Boing" }, bodyText: `Line ${i} of the burst.`, bodyMarkdown: `Line ${i}`, createdAt: new Date(1_761_000_000_000 + i * 1000).toISOString() });
const dmCreated = (i: number) => ({ type: "dm.created", project: null, ticket: null, actor: { id: "boing", kind: "agent" }, recipientIds: ["nicky"], payload: { threadId: `dmt_${i % 3}`, messageId: `dm_${i}`, agentId: "boing" } });
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("question 14: the cap on the host's parallel reads of agent messages", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  async function start(routes: Record<string, unknown>, options: { dmReads?: { limit?: number; retryMs?: number; lostLogMs?: number } } = {}) {
    const base = installation();
    const stub = await createLoopsStub({ ...base, routes: { ...base.routes, ...routes }, keyReadsChat: true, dm: { threads: [] } });
    cleanup.push(() => stub.close());
    const lines: string[] = [];
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: (line) => lines.push(line), ...options });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    await tab.next((m) => m.type === "status" && m.loops === "ok");
    const chats = () => tab.messages.filter((m) => m.type === "chat").map((m) => m.chat as { messageId: string; threadId: string; text: string });
    return { stub, host, lines, health, tab, chats };
  }

  it("440 agent messages in one instant: every one becomes a bubble line, the reads start in the stream's order, and loops never holds more than DM_READ_LIMIT of them at once", async (t) => {
    const N = 440;
    let open = 0;
    let peak = 0;
    const routes: Record<string, unknown> = {};
    for (let i = 0; i < N; i += 1) {
      routes[`/api/dm/messages/dm_${i}`] = async (): Promise<StubAnswer> => {
        open += 1;
        peak = Math.max(peak, open);
        // A slow loops: every read in flight at the host is open here while it waits, so `peak` is what the host had in flight.
        await pause(4);
        open -= 1;
        return { status: 200, body: { message: message(i) } };
      };
    }
    const { stub, chats, health, lines } = await start(routes);
    const started = Date.now();
    for (let i = 0; i < N; i += 1) stub.emit(dmCreated(i) as Parameters<typeof stub.emit>[0]);
    await waitFor(`${N} lines`, () => chats().length >= N);
    const took = Date.now() - started;
    const lined = chats();
    assert.equal(lined.length, N, "no bubble lost, none doubled");
    assert.deepEqual(new Set(lined.map((c) => c.messageId)), new Set(Array.from({ length: N }, (_, i) => `dm_${i}`)));
    const reads = stub.requests.filter((r) => r.path.startsWith("/api/dm/messages/"));
    assert.deepEqual([...reads.map((r) => r.path)].sort(), Array.from({ length: N }, (_, i) => `/api/dm/messages/dm_${i}`).sort(), "one read each, no retry");
    // Started in the stream's order: a read starts only when the one DM_READ_LIMIT ahead of it is done, so at loops it
    // can arrive at most that many places from its own (the sockets of the reads in flight race by a few places).
    for (const [at, r] of reads.entries()) {
      const i = Number(r.path.slice("/api/dm/messages/dm_".length));
      assert.ok(Math.abs(at - i) < DM_READ_LIMIT, `read ${i} arrived at place ${at}`);
    }
    assert.ok(peak <= DM_READ_LIMIT, `at most ${DM_READ_LIMIT} open at loops at once, saw ${peak}`);
    assert.ok(peak >= 2, `the reads do run side by side (peak ${peak})`);
    // What the cap costs a burst: N / limit round trips of a 4 ms loops, so about a quarter second here (generous: a loaded machine).
    assert.ok(took < 5_000, `the burst took ${took} ms`);
    t.diagnostic(`the burst of ${N}: ${took} ms through a loops that takes 4 ms a read, at most ${peak} open at once`);
    assert.equal((await health()).connection.stream.state, "ok");
    assert.ok(!lines.some((l) => /not read|lost|Error/.test(l)), lines.filter((l) => /not read|lost|Error/.test(l)).join(" | "));
  });

  it("a read loops fails with a 503 or drops is tried once more and becomes a line; a 404 is final with one read; a read lost after the retry is counted in one log line", async () => {
    let flaky = 0;
    let reset = 0;
    let stubborn = 0;
    const routes: Record<string, unknown> = {
      "/api/dm/messages/dm_flaky": (): StubAnswer => (flaky++ === 0 ? { status: 503, body: { error: { code: "unavailable", message: "later" } } } : { status: 200, body: { message: { ...message(1), id: "dm_flaky" } } }),
      "/api/dm/messages/dm_reset": async (): Promise<StubAnswer> => {
        // The first time loops never answers: the read times out at the host (no status); the second time it answers.
        if (reset++ === 0) await pause(400);
        return { status: 200, body: { message: { ...message(2), id: "dm_reset" } } };
      },
      "/api/dm/messages/dm_gone": (): StubAnswer => ({ status: 404, body: { error: { code: "not_found", message: "No such message" } } }),
      "/api/dm/messages/dm_stubborn": (): StubAnswer => (stubborn++, { status: 500, body: { error: { code: "boom", message: "still" } } }),
      "/api/dm/messages/dm_stubborn2": (): StubAnswer => ({ status: 502, body: null }),
    };
    const base = installation();
    const stub = await createLoopsStub({ ...base, routes: { ...base.routes, ...routes }, keyReadsChat: true, dm: { threads: [] } });
    cleanup.push(() => stub.close());
    const lines: string[] = [];
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, readTimeoutMs: 150, dmReads: { retryMs: 30, lostLogMs: 200 }, log: (line) => lines.push(line) });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    await tab.next((m) => m.type === "status" && m.loops === "ok");
    for (const id of ["dm_flaky", "dm_reset", "dm_gone", "dm_stubborn", "dm_stubborn2"]) stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "boing", kind: "agent" }, recipientIds: ["nicky"], payload: { threadId: "dmt_0", messageId: id, agentId: "boing" } });
    const chats = () => tab.messages.filter((m) => m.type === "chat").map((m) => (m.chat as { messageId: string }).messageId);
    await waitFor("the two retried lines", () => chats().includes("dm_flaky") && chats().includes("dm_reset"));
    const readsOf = (id: string) => stub.requests.filter((r) => r.path === `/api/dm/messages/${id}`).length;
    await waitFor("the stubborn retries", () => readsOf("dm_stubborn") === 2 && readsOf("dm_stubborn2") === 2);
    await pause(100);
    assert.deepEqual(chats().sort(), ["dm_flaky", "dm_reset"], "the retried reads are lines; the refused and the lost are not");
    assert.equal(readsOf("dm_flaky"), 2, "a 503 is tried once more");
    assert.equal(readsOf("dm_reset"), 2, "no answer is tried once more");
    assert.equal(readsOf("dm_gone"), 1, "a 404 is final");
    assert.equal(readsOf("dm_stubborn"), 2, "one retry, not more");
    assert.equal(readsOf("dm_stubborn2"), 2, "one retry, not more");
    // The lost ones are said once, counted, after the log's pause (DM_LOST_LOG_MS; 200 ms here): one line for two.
    await waitFor("the lost line", () => lines.some((l) => /not read after one retry/.test(l)));
    const lost = lines.filter((l) => /not read after one retry/.test(l));
    assert.equal(lost.length, 1, lost.join(" | "));
    assert.match(lost[0]!, /^chat: 2 agent message\(s\) not read after one retry, those bubbles are lost \(last: dm_stubborn2?, 50[02]\)$/);
    assert.equal((await health()).connection.stream.state, "ok", "the host stands");
  });

  it("the reads of a link that is gone are not started: a burst still waiting when the host closes makes no more requests", async () => {
    const N = 120;
    const routes: Record<string, unknown> = {};
    for (let i = 0; i < N; i += 1) {
      routes[`/api/dm/messages/dm_${i}`] = async (): Promise<StubAnswer> => {
        await pause(15);
        return { status: 200, body: { message: message(i) } };
      };
    }
    const { stub, host, chats } = await start(routes);
    for (let i = 0; i < N; i += 1) stub.emit(dmCreated(i) as Parameters<typeof stub.emit>[0]);
    await waitFor("the first lines", () => chats().length >= DM_READ_LIMIT);
    await host.close();
    // The reads in flight at the close land at the stub a moment later; after that, nothing more: the queue was skipped.
    // Unstopped, the 120 would take 15 rounds of 15 ms, so 300 ms of silence on the stub is the proof.
    const made = () => stub.requests.filter((r) => r.path.startsWith("/api/dm/messages/")).length;
    await pause(100);
    const after = made();
    await pause(300);
    assert.equal(made(), after, "nothing more read after the close");
    assert.ok(after < N / 2, `the waiting reads were skipped (${after} of ${N} made)`);
  });
});
