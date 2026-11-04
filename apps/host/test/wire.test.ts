/**
 * The wire's contract (round 59d, C7): the real host and the stubs that stand in for it answer health and stream
 * messages the page's readers (loops-client `hostWire.ts`) take whole: nothing dropped, nothing missing, every kind
 * known. One table and one set of readers pin what the host writes and what the page and the stubs read.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { STUB_STATES, createConnectStub } from "../../../tools/lib/connectStub.mjs";
import { type HostMessage, readHostHealth, readHostMessage, worldApiPath } from "@crewhub/loops-client";
import { emptyTownDocument } from "@crewhub/world-model";
import { openWorldDb } from "../src/worldDb.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { testHost } from "./testHost.ts";
import { waitFor } from "./wait.ts";

/** The message read through the wire, or why it was refused; `deepEqual` against what arrived proves nothing was dropped. */
const read = (message: Record<string, unknown>): HostMessage | string => {
  const result = readHostMessage(message);
  return result.ok ? result.value : `${result.path}: ${result.message}`;
};

describe("the wire's contract: what the host and the stubs write, the page's readers take whole", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  it("the real host: health round-trips through readHostHealth; status, heartbeat, event, reset, threads, chat and town through readHostMessage", async () => {
    const THREAD = { id: "dmt_boing", agentId: "boing", createdAt: "2026-10-21T18:00:00.000Z", lastMessageAt: "2026-10-22T07:05:00.174Z", unreadCount: 1 };
    const MESSAGE = { id: "dm_k1", threadId: "dmt_boing", agentId: "boing", author: { id: "boing", kind: "agent", displayName: "Boing" }, bodyText: "Done with the lamp.", bodyMarkdown: "Done with the lamp.", createdAt: "2026-10-21T20:00:00.000Z" };
    const stub = await createLoopsStub({ ...installation(), keyReadsChat: true, dm: { threads: [THREAD], messages: { [MESSAGE.id]: MESSAGE } } });
    cleanup.push(() => stub.close());
    const dir = mkdtempSync(path.join(tmpdir(), "chw-wire-"));
    const db = openWorldDb(dir);
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    cleanup.push(() => db.close());
    const host = await testHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", checkout: "0a1b2c3d", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, worldDb: db, log: () => undefined });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}${worldApiPath("/health")}`)).json()) as Record<string, unknown>;
    await waitFor("the stream and the chat verdict", async () => {
      const h = await health();
      return (h.connection as { stream: { state: string }; session?: unknown }).stream.state === "ok" && (h.connection as { session?: unknown }).session !== undefined && h.loopsCommit !== undefined;
    });
    const sent = await health();
    assert.deepEqual(readHostHealth(sent), sent, "every field the host writes, the page reads: none dropped, none unknown");
    assert.equal(readHostHealth(sent)?.connection?.session?.state, "key");

    const tab = await openSse(`${host.url}${worldApiPath("/stream", {}, { cursor: "0" })}`);
    cleanup.push(() => tab.close());
    await tab.next((m) => m.type === "status");
    await tab.next((m) => m.type === "threads");
    stub.emit({ type: "ticket.moved", project: { slug: "atlas", key: "AT" }, ticket: { id: "tk_1", key: "AT-1", title: "First" }, actor: { id: "lead-1", kind: "agent" }, recipientIds: [], payload: { from: "planned", to: "in_progress" } });
    await tab.next((m) => m.type === "event");
    stub.heartbeat();
    await tab.next((m) => m.type === "heartbeat");
    stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "boing", kind: "agent" }, recipientIds: ["nicky"], payload: { threadId: THREAD.id, messageId: MESSAGE.id, agentId: "boing" } });
    await tab.next((m) => m.type === "chat");
    // A town written by a paired browser on an allowed origin: every tab hears `town` with the revision.
    const written = await fetch(`${host.url}${worldApiPath("/town")}`, { method: "PUT", headers: { origin: host.url, "content-type": "application/json" }, body: JSON.stringify({ document: { ...emptyTownDocument("greenhouse"), revision: 0 }, baseRev: 0 }) });
    assert.equal(written.status, 200);
    await tab.next((m) => m.type === "town");
    // A tab back at a cursor the buffer no longer reaches: the host resets it.
    const behind = await openSse(`${host.url}${worldApiPath("/stream", {}, { cursor: "999999" })}`);
    cleanup.push(() => behind.close());
    await behind.next((m) => m.type === "reset");
    const kinds = new Set<string>();
    for (const message of [...tab.messages, ...behind.messages]) {
      assert.deepEqual(read(message), message, `read whole: ${JSON.stringify(message)}`);
      kinds.add(message.type as string);
    }
    assert.deepEqual([...kinds].sort(), ["chat", "event", "heartbeat", "reset", "status", "threads", "town"]);
  });

  it("the Connect screens' stub, in every state: health round-trips; the busy state's own stream reads, and so does the Forget it tells the tabs", async () => {
    const stub = await createConnectStub({ state: "no-loops", log: () => undefined });
    cleanup.push(() => stub.close());
    for (const state of STUB_STATES) {
      await stub.setState(state);
      const sent = (await (await fetch(`${stub.url}${worldApiPath("/health")}`)).json()) as Record<string, unknown>;
      assert.deepEqual(readHostHealth(sent), sent, `state ${state}: every field the stub writes, the page reads`);
    }
    await stub.setState("busy");
    const tab = await openSse(`${stub.url}${worldApiPath("/stream")}`);
    cleanup.push(() => tab.close());
    const busy = await tab.next((m) => m.type === "status");
    assert.deepEqual(read(busy), busy);
    assert.equal((read(busy) as HostMessage & { type: "status" }).stream, "busy");
    await tab.next((m) => m.type === "heartbeat");
    // A Forget (DELETE /connect): the stub tells every open stream the host's word for no key, then ends them.
    const forgotten = await fetch(`${stub.url}${worldApiPath("/connect")}`, { method: "DELETE" });
    assert.equal(forgotten.status, 200);
    const none = await tab.next((m) => m.type === "status" && m.key === "none");
    assert.deepEqual(read(none), { type: "status", loops: "unauthorized", key: "none" });
    for (const message of tab.messages) assert.deepEqual(read(message), message, JSON.stringify(message));
  });
});
