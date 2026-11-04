/**
 * The chat path's teardown wirings in the host (review-c4, finding 10): the path built for a link is disposed when
 * that link goes (relink on a Forget or a pasted key, the stream's 401), so a threads re-read a dm event asked for
 * never fires with the old key; and its threads reach the tabs only for the link that stands (the gate in
 * `chatPathFor`), so a tab gets the list once, at attach, not also from the check inside relink. Against the stub;
 * `closeTimers.test.ts` pins the same for close(). The re-read waits THREADS_REFRESH_MS (1 s) after a dm event.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { testHost } from "./testHost.ts";
import { waitFor } from "./wait.ts";

const THREAD = { id: "dmt_boing", agentId: "boing", createdAt: "2026-10-21T18:00:00.000Z", lastMessageAt: "2026-10-22T07:05:00.174Z", unreadCount: 1 };
const KEY = `chl_${"k".repeat(24)}`;
const soak = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type Health = { cursor?: number; connection: { key: { state: string }; stream: { state: string }; session?: { state: string } } };

describe("the chat path goes with its link", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });
  async function start(key?: string) {
    const stub = await createLoopsStub({ ...installation(), key: KEY, keyReadsChat: true, dm: { threads: [THREAD], messages: {} } });
    cleanup.push(() => stub.close());
    const host = await testHost({ loopsUrl: stub.url, ...(key === undefined ? {} : { key, keyName: "crewhub-world", keySource: "env" }), pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: () => undefined });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Health;
    return { stub, host, health };
  }
  /** A person's dm on the stream: the chat path schedules the threads' re-read and reads no message. */
  async function dmEvent(stub: Awaited<ReturnType<typeof start>>["stub"], health: () => Promise<Health>) {
    const { seq } = stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "nicky", kind: "user" }, recipientIds: ["boing"], payload: { threadId: "dmt_boing", messageId: "dm_p1", agentId: "boing" } });
    await waitFor("the host heard the dm event", async () => (await health()).cursor === seq);
  }
  const threadReads = (stub: Awaited<ReturnType<typeof start>>["stub"], from: number) => stub.requests.slice(from).filter((r) => r.path === "/api/dm/threads");

  it("a Forget right after a dm event: the old link's re-read never fires (relink disposes the path)", async () => {
    const { stub, host, health } = await start(KEY);
    await waitFor("the chat road", async () => (await health()).connection.session?.state === "key");
    await dmEvent(stub, health);
    const forgot = await fetch(`${host.url}/world-api/connect`, { method: "DELETE", headers: { origin: host.url } });
    assert.equal(forgot.status, 200);
    const from = stub.requests.length;
    await soak(1300);
    assert.deepEqual(threadReads(stub, from), [], "a threads read with the forgotten key after the relink");
    assert.equal((await health()).connection.key.state, "none");
  });

  it("the stream's 401 right after a dm event: the re-read never fires with the refused key (the 401 path disposes the path)", async () => {
    const { stub, health } = await start(KEY);
    await waitFor("the chat road", async () => (await health()).connection.session?.state === "key");
    await dmEvent(stub, health);
    stub.revoke();
    await waitFor("the verdict", async () => (await health()).connection.key.state === "rejected");
    await waitFor("the stream stopped", async () => (await health()).connection.stream.state === "idle" && stub.openStreams() === 0);
    const from = stub.requests.length;
    await soak(1300);
    assert.deepEqual(threadReads(stub, from), [], "a threads read with the refused key after the stream's 401");
  });

  it("a tab attached before a key: after the pasted key the threads come once, at attach, not also from the check inside relink (the gate)", async () => {
    const { host, health } = await start();
    assert.equal((await health()).connection.key.state, "none");
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    await tab.next((m) => m.type === "status");
    const pasted = await fetch(`${host.url}/world-api/connect`, { method: "POST", headers: { origin: host.url, "content-type": "application/json" }, body: JSON.stringify({ key: KEY }) });
    assert.equal(pasted.status, 200, await pasted.text());
    await waitFor("the chat road", async () => (await health()).connection.session?.state === "key");
    await waitFor("the threads at attach", async () => tab.messages.some((m) => m.type === "threads"));
    await soak(300);
    const threads = tab.messages.filter((m) => m.type === "threads");
    assert.equal(threads.length, 1, `the threads once, at attach: ${JSON.stringify(tab.messages.map((m) => m.type))}`);
    assert.deepEqual(threads[0], { type: "threads", threads: [{ agentId: "boing", lastMessageAt: THREAD.lastMessageAt, unreadCount: 1 }] });
    const types = tab.messages.map((m) => m.type);
    assert.ok(types.indexOf("threads") > types.indexOf("status"), "after the status the attach sent");
  });
});
