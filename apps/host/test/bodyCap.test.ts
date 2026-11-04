/**
 * Question 15 (round 36): a size cap on what comes back from loops. Every body the host read from loops' URL was read
 * whole with no limit; now `readCapped` (bodyCap.ts) counts the bytes and stops at the cap (4 MB), the relay answers
 * 502 `upstream_too_large`, the host's own reads see a null body and say so in one line, and a stream line past the
 * cap is dropped while the stream goes on. Against servers of the test's own on 127.0.0.1 port 0 and the stub; the
 * cap is shortened where a boundary is tried, and the real 4 MB is tried once.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { UPSTREAM_BODY_LIMIT, UpstreamTooLarge, createRepeatLog, declaredLength, readCapped } from "../src/bodyCap.ts";
import { createHost } from "../src/host.ts";
import { createLoopsClient } from "../src/loops.ts";
import { SnapshotError, readTail } from "../src/snapshot.ts";
import { createTcpTransport } from "../src/transport.ts";
import { envelope, createLoopsStub, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { waitFor } from "./wait.ts";

const KEY = "chl_body_cap_test_key_0123456789";
const LIMIT = 1000;
/** A JSON body of exactly `bytes` bytes (ASCII). */
const jsonOf = (bytes: number): string => `{"pad":"${"x".repeat(bytes - 10)}"}`;

interface Answer {
  status?: number;
  body: string | Buffer;
  /** `length`: Content-Length as the body is; `chunked`: none; a number: a Content-Length that lies. */
  mode?: "length" | "chunked" | number;
  /** Written in pieces of this many bytes, one per tick, so a cancel can be seen before the end. */
  pieces?: number;
}

/** A server answering what the test queued, per request, and recording whether the client hung up before the end. */
function answering(): { server: Server; queue: Answer[]; closedEarly: boolean[]; url: () => string } {
  const queue: Answer[] = [];
  const closedEarly: boolean[] = [];
  const server = createServer((req, res) => {
    const answer = queue.shift() ?? { body: "{}" };
    const body = Buffer.isBuffer(answer.body) ? answer.body : Buffer.from(answer.body, "utf8");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (answer.mode === undefined || answer.mode === "length") headers["content-length"] = String(body.length);
    else if (typeof answer.mode === "number") headers["content-length"] = String(answer.mode);
    const at = closedEarly.length;
    closedEarly.push(false);
    let finished = false;
    res.on("close", () => {
      if (!finished) closedEarly[at] = true;
    });
    res.writeHead(answer.status ?? 200, headers);
    if (answer.pieces === undefined) {
      finished = true;
      res.end(body);
      return;
    }
    let offset = 0;
    const tick = () => {
      if (res.destroyed) return;
      const next = Math.min(body.length, offset + (answer.pieces as number));
      res.write(body.subarray(offset, next));
      offset = next;
      if (offset >= body.length) {
        finished = true;
        res.end();
      } else setTimeout(tick, 2);
    };
    tick();
    void req;
  });
  return { server, queue, closedEarly, url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe("question 15: a size cap on an upstream body", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });
  async function listen(server: Server): Promise<void> {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanup.push(() => new Promise<void>((resolve) => (server.closeAllConnections(), server.close(() => resolve()))));
  }

  it("readCapped: just under, at and one past the cap with a Content-Length; counted when chunked; a lying Content-Length either way", async () => {
    const { server, queue, closedEarly, url } = answering();
    await listen(server);
    const transport = createTcpTransport(url(), { Authorization: `Bearer ${KEY}` });
    const read = async (answer: Answer) => {
      queue.push(answer);
      return readCapped(await transport.request("/api/health", {}, { accept: "application/json", timeoutMs: 2000 }), LIMIT);
    };
    const tooLarge = async (answer: Answer): Promise<UpstreamTooLarge> => {
      try {
        await read(answer);
      } catch (error) {
        assert.ok(error instanceof UpstreamTooLarge, `an UpstreamTooLarge, not ${String(error)}`);
        return error;
      }
      assert.fail(`read whole: ${JSON.stringify({ mode: answer.mode, bytes: answer.body.length, pieces: answer.pieces })}`);
    };
    assert.equal((await read({ body: jsonOf(LIMIT - 1) })).length, LIMIT - 1, "just under: whole");
    assert.equal((await read({ body: jsonOf(LIMIT) })).length, LIMIT, "at the cap: whole");
    const declared = await tooLarge({ body: jsonOf(LIMIT + 1) });
    assert.deepEqual([declared.declared, declared.bytes, declared.limit, declared.status], [true, LIMIT + 1, LIMIT, 200], "one past, declared: refused before reading");
    assert.match(declared.message, /past 1000 bytes \(declared 1001\)/);
    // Chunked: no Content-Length, so the bytes are counted as they come.
    assert.equal((await read({ body: jsonOf(LIMIT), mode: "chunked" })).length, LIMIT, "chunked at the cap: whole");
    const counted = await tooLarge({ body: jsonOf(LIMIT + 1), mode: "chunked" });
    assert.deepEqual([counted.declared, counted.bytes >= LIMIT + 1, counted.bytes <= LIMIT + 1], [true && false, true, true], "one past, chunked: counted and stopped");
    // A Content-Length that lies low under a big body: the transport itself cuts the body at the declared length (fetch
    // reads no further), so nothing past it is read and the cap has no say. One that lies high over a small body:
    // refused before reading, as the page says it may be.
    const liedLow = await read({ body: jsonOf(3 * LIMIT), mode: 500 });
    assert.ok(liedLow.length <= 500, `cut at the declared length: ${liedLow.length}`);
    const liedHigh = await tooLarge({ body: "{}", mode: LIMIT + 1 });
    assert.deepEqual([liedHigh.declared, liedHigh.bytes], [true, LIMIT + 1]);
    // A long chunked body streamed slowly: the connection is let go once the cap is passed, never read to the end.
    const slow = await tooLarge({ body: jsonOf(200 * LIMIT), mode: "chunked", pieces: 700 });
    assert.ok(slow.bytes < 200 * LIMIT, `stopped at ${slow.bytes}`);
    await waitFor("the server saw the hang-up", () => closedEarly[closedEarly.length - 1] === true, 3000);
    assert.equal(declaredLength(new Headers({ "content-length": " 42 " })), 42);
    assert.equal(declaredLength(new Headers({ "content-length": "-1" })), null);
    assert.equal(declaredLength(new Headers()), null);
  });

  it("the real cap is 4 MB: a 4 MB body passes, 4 MB and one byte is refused", async () => {
    assert.equal(UPSTREAM_BODY_LIMIT, 4 * 1024 * 1024);
    const { server, queue, url } = answering();
    await listen(server);
    const client = createLoopsClient(url(), KEY);
    queue.push({ body: jsonOf(UPSTREAM_BODY_LIMIT) });
    assert.equal((await client.get("/api/health")).text.length, UPSTREAM_BODY_LIMIT);
    queue.push({ body: jsonOf(UPSTREAM_BODY_LIMIT + 1) });
    await assert.rejects(client.get("/api/health"), (e: unknown) => e instanceof UpstreamTooLarge && e.declared && e.bytes === UPSTREAM_BODY_LIMIT + 1);
  });

  it("the client: get throws, getJson and getPublicJson answer the status with a null body and say the path once; the tail reads as loops down", async () => {
    const { server, queue, url } = answering();
    await listen(server);
    const said: string[] = [];
    const client = createLoopsClient(url(), KEY, { bodyLimit: LIMIT, onTooLarge: (path, error) => said.push(`${path} ${error.status} ${error.bytes}`) });
    queue.push({ body: jsonOf(LIMIT + 5), status: 207 });
    assert.deepEqual(await client.getJson("/api/health"), { status: 207, body: null });
    queue.push({ body: jsonOf(LIMIT + 5), mode: "chunked" });
    assert.deepEqual(await client.getPublicJson("/api/health"), { status: 200, body: null });
    queue.push({ body: jsonOf(LIMIT) });
    assert.deepEqual(await client.getJson("/api/health"), { status: 200, body: { pad: "x".repeat(LIMIT - 10) } }, "at the cap: parsed");
    assert.deepEqual(said, ["/api/health 207 1005", `/api/health 200 ${LIMIT + 5}`]);
    queue.push({ body: jsonOf(LIMIT + 1) });
    await assert.rejects(readTail(client), (e: unknown) => e instanceof SnapshotError && e.reason === "loops_down", "the tail: a SnapshotError, as for any body that is no tail");
    assert.equal(said.length, 3);
  });

  it("through the host: the relay answers 502 upstream_too_large and the page hears the size; a body at the cap passes; the log says it once per path", async () => {
    const base = installation();
    const cap = 2048;
    const big = { ticket: { id: "tk_9", key: "AT-9", title: "x".repeat(cap) } };
    const fits = { ticket: { id: "tk_8", key: "AT-8", title: "y".repeat(cap - 60) } };
    assert.ok(JSON.stringify(fits).length <= cap && JSON.stringify(big).length > cap);
    const stub = await createLoopsStub({ ...base, routes: { ...base.routes, "/api/tickets/AT-9": big, "/api/tickets/AT-8": fits } });
    cleanup.push(() => stub.close());
    const lines: string[] = [];
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, upstreamBodyLimit: cap, log: (line) => lines.push(line) });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    const refused = await fetch(`${host.url}/world-api/tickets/AT-9`);
    assert.equal(refused.status, 502);
    const body = (await refused.json()) as { error: string; limit: number; bytes: number };
    assert.equal(body.error, "upstream_too_large");
    assert.equal(body.limit, cap);
    assert.ok(body.bytes > cap && body.bytes === JSON.stringify(big).length, `the size said: ${body.bytes}`);
    const passed = await fetch(`${host.url}/world-api/tickets/AT-8`);
    assert.equal(passed.status, 200);
    assert.deepEqual(await passed.json(), fits);
    // Asked again within the log's pause: another 502, no second line.
    assert.equal((await fetch(`${host.url}/world-api/tickets/AT-9`)).status, 502);
    const tooLarge = lines.filter((l) => /past 2048 bytes/.test(l));
    assert.equal(tooLarge.length, 1, tooLarge.join(" | "));
    // The stub answers chunked (no Content-Length), so the bytes were counted.
    assert.match(tooLarge[0]!, /^loops answered GET \/api\/tickets\/AT-9 200 with a body past 2048 bytes \(read \d+\): cut off, 502 to the page$/);
    assert.ok(!lines.some((l) => l.includes("x".repeat(20))), "never the body in the log");
    assert.ok(!lines.some((l) => l.includes(stub.key)), "never the key");
    assert.equal((await health()).connection.stream.state, "ok", "the host stands");
  });

  it("through the host: the snapshot, the threads and a chat message past the cap are read as no body, with one line each", async () => {
    const base = installation();
    const cap = 2048;
    const MESSAGE = { id: "dm_big", threadId: "dmt_boing", agentId: "boing", author: { id: "boing", kind: "agent", displayName: "Boing" }, bodyText: "z".repeat(cap), createdAt: "2026-10-21T20:00:00.000Z" };
    const SMALL = { ...MESSAGE, id: "dm_small", bodyText: "Small enough." };
    const stub = await createLoopsStub({
      ...base,
      routes: { ...base.routes, "/api/board/atlas": { pad: "b".repeat(cap) }, "/api/dm/threads": { threads: Array.from({ length: 40 }, (_, i) => ({ id: `dmt_${i}`, agentId: `a${i}`, lastMessageAt: "2026-10-22T07:05:00.174Z", unreadCount: 1 })) } },
      keyReadsChat: true,
      dm: { messages: { [MESSAGE.id]: MESSAGE, [SMALL.id]: SMALL } },
    });
    cleanup.push(() => stub.close());
    const lines: string[] = [];
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, upstreamBodyLimit: cap, log: (line) => lines.push(line) });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    // The threads list past the cap: the key still reads the chat (loops answered 200), with no thread facts.
    assert.deepEqual((await health()).connection.session, { state: "key" });
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    const threads = await tab.next((m) => m.type === "threads");
    assert.deepEqual(threads.threads, [], "the threads past the cap: none");
    // The snapshot: a board past the cap is a read with no body, and the snapshot fails as for any unreadable answer.
    const snapshot = await fetch(`${host.url}/world-api/snapshot`);
    assert.equal(snapshot.status, 503);
    assert.equal(((await snapshot.json()) as { error: string }).error, "loops_down");
    await waitFor("the snapshot's verdict", async () => (await health()).connection.snapshot?.state === "failed");
    // A chat message past the cap is no bubble; the small one after it is.
    for (const id of [MESSAGE.id, SMALL.id]) stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "boing", kind: "agent" }, recipientIds: ["nicky"], payload: { threadId: "dmt_boing", messageId: id, agentId: "boing" } });
    const chat = await tab.next((m) => m.type === "chat");
    assert.equal((chat.chat as { messageId: string }).messageId, SMALL.id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(tab.messages.filter((m) => m.type === "chat").length, 1, "the big one made no bubble");
    const said = lines.filter((l) => /past 2048 bytes/.test(l));
    const paths = said.map((l) => /GET (\S+) /.exec(l)?.[1]);
    assert.ok(paths.includes("/api/dm/threads") && paths.includes("/api/board/atlas") && paths.includes("/api/dm/messages/dm_big"), said.join(" | "));
    for (const line of said) assert.match(line, /cut off, read as no body/);
    assert.ok(!lines.some((l) => l.includes("z".repeat(20)) || l.includes("b".repeat(20))), "never the body in the log");
  });

  it("the stream: a line past the cap is dropped and said, a line at the cap and the next events still arrive, split across chunks or not", async () => {
    const cap = 2048;
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const lines: string[] = [];
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, upstreamBodyLimit: cap, log: (line) => lines.push(line) });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    await tab.next((m) => m.type === "status" && m.loops === "ok");
    // A line of exactly the cap (the newline not counted) passes; one past it is dropped; a plain one after each arrives.
    const shape = { type: "ticket.updated", project: { slug: "atlas", key: "AT" }, ticket: null, actor: { id: "lead-1", kind: "agent" }, recipientIds: [] };
    const sized = (seq: number, bytes: number) => {
      const bare = JSON.stringify(envelope(seq, shape.type, { ...shape, seq, payload: { pad: "" } })).length;
      return { pad: "p".repeat(bytes - bare) };
    };
    const seq0 = stub.lastSeq() + 1;
    const atCap = stub.emit({ ...shape, payload: sized(seq0, cap) });
    assert.equal(JSON.stringify(atCap).length, cap, "the probe's size");
    const past = stub.emit({ ...shape, payload: sized(seq0 + 1, cap + 1) });
    assert.equal(JSON.stringify(past).length, cap + 1);
    const after = stub.emit({ ...shape, payload: { small: true } });
    // A line far past the cap, written in pieces (its newline comes chunks later), and a plain one right behind it.
    const huge = stub.emit({ ...shape, payload: { pad: "h".repeat(40 * cap) } });
    const last = stub.emit({ ...shape, payload: { last: true } });
    await tab.next((m) => m.type === "event" && (m.envelope as { seq: number }).seq === last.seq);
    const seqs = tab.messages.filter((m) => m.type === "event").map((m) => (m.envelope as { seq: number }).seq);
    assert.deepEqual(seqs, [atCap.seq, after.seq, last.seq], "the two past the cap are gone, the rest arrived in order");
    void past;
    void huge;
    const dropped = lines.filter((l) => /line past 2048 bytes dropped/.test(l));
    assert.equal(dropped.length, 2, dropped.join(" | "));
    for (const line of dropped) assert.match(line, /the stream goes on from the next line$/);
    assert.ok(!lines.some((l) => l.includes("h".repeat(20))), "never the line in the log");
    assert.equal((await health()).connection.stream.state, "ok", "no reconnect: the stream went on");
    assert.equal(stub.streamsOpened(), 1, "one stream, never reopened");
  });

  it("the repeat log: a line at once, repeats within the pause held and counted into the next, keys apart", () => {
    const out: string[] = [];
    let now = 1000;
    const say = createRepeatLog((line) => out.push(line), 5000, () => now);
    say("a", "a happened");
    say("a", "a happened");
    say("b", "b happened");
    now += 4999;
    say("a", "a happened");
    now += 1;
    say("a", "a happened");
    say("b", "b happened");
    assert.deepEqual(out, ["a happened", "b happened", "a happened (and 2 more like it since the last line)", "b happened"]);
  });
});
