/**
 * The wire's contract (round 59d, C7): the real host and the stubs that stand in for it answer health and stream
 * messages the page's readers (loops-client `hostWire.ts`) take whole: nothing dropped, nothing missing, every kind
 * known. One table and one set of readers pin what the host writes and what the page and the stubs read.
 */
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { STUB_STATES, createConnectStub } from "../../../tools/lib/connectStub.mjs";
import { type HostMessage, readConnectAnswer, readHostHealth, readHostMessage, readTownBackup, readTownBackups, readTownConflict, readTownRead, readTownWritten, worldApiPath } from "@crewhub/loops-client";
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

  it("the real host's town answers round-trip through the town's readers: none yet, fresh, held, written, the conflict, the backups, and a host without a database or a loops", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const dir = mkdtempSync(path.join(tmpdir(), "chw-wire-town-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const db = openWorldDb(path.join(dir, "db"));
    cleanup.push(() => db.close());
    const host = await testHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, worldDb: db, log: () => undefined });
    cleanup.push(() => host.close());
    const town = worldApiPath("/town");
    const get = async (p: string) => {
      const response = await fetch(`${host.url}${p}`);
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };
    const put = async (body: Record<string, unknown>) => {
      const response = await fetch(`${host.url}${town}`, { method: "PUT", headers: { origin: host.url, "content-type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };
    await waitFor("the stream", async () => ((await get(worldApiPath("/health"))).body.connection as { stream: { state: string } }).stream.state === "ok");
    const fresh = await get(town);
    assert.equal(fresh.status, 200);
    assert.deepEqual(readTownRead(200, fresh.body), fresh.body, "a fresh host: revision 0, no document, every field read");
    assert.equal((readTownRead(200, fresh.body) as { rev: number }).rev, 0);
    const document = { ...emptyTownDocument("greenhouse"), revision: 0 };
    const written = await put({ document, baseRev: 0 });
    assert.equal(written.status, 200);
    assert.deepEqual(readTownWritten(200, written.body), written.body, "a write's answer, whole");
    const held = await get(town);
    assert.deepEqual(readTownRead(200, held.body), held.body, "the held town, whole");
    assert.equal((readTownRead(200, held.body) as { rev: number }).rev, 1);
    const conflict = await put({ document, baseRev: 0 });
    assert.equal(conflict.status, 409);
    assert.deepEqual(readTownConflict(409, conflict.body), conflict.body, "the conflict, with the host's town");
    const undone = await put({ op: "undo", baseRev: 1 });
    assert.deepEqual(readTownWritten(undone.status, undone.body), undone.body);
    // A backup copy beside the database (the file is copied whole: journal_mode DELETE), read back as this installation's town.
    copyFileSync(db.file, path.join(path.dirname(db.file), "world.db.bak-v1"));
    const backups = await get(worldApiPath("/town/backups"));
    assert.equal(backups.status, 200);
    assert.deepEqual(readTownBackups(backups.status, backups.body), backups.body);
    assert.deepEqual((readTownBackups(200, backups.body) ?? { backups: [] }).backups.map((b) => [b.name, b.version]), [["world.db.bak-v1", 1]]);
    const backup = await get(worldApiPath("/town/backups/{name}", { name: "world.db.bak-v1" }));
    assert.equal(backup.status, 200);
    assert.deepEqual(readTownBackup(backup.status, backup.body), backup.body);
    // A host with no database, and one with no loops found: a 200 that names the reason (the page's offline note).
    const bare = await testHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", log: () => undefined });
    cleanup.push(() => bare.close());
    const noDb = (await (await fetch(`${bare.url}${town}`)).json()) as Record<string, unknown>;
    assert.deepEqual(readTownRead(200, noDb), noDb);
    assert.equal((readTownRead(200, noDb) as { reason: string }).reason, "no_world_db");
    const appData = mkdtempSync(path.join(tmpdir(), "chw-wire-app-"));
    cleanup.push(() => rmSync(appData, { recursive: true, force: true }));
    mkdirSync(path.join(appData, "run"));
    const free = createServer();
    await new Promise<void>((resolve) => free.listen(0, "127.0.0.1", resolve));
    const port = (free.address() as AddressInfo).port;
    await new Promise<void>((resolve) => free.close(() => resolve()));
    writeFileSync(path.join(appData, "settings.json"), `{"port": ${port}}\n`);
    const db2 = openWorldDb(path.join(dir, "db2"));
    cleanup.push(() => db2.close());
    const noLoops = await testHost({ discovery: { appData, intervalMs: 40 }, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", worldDb: db2, log: () => undefined });
    cleanup.push(() => noLoops.close());
    const none = (await (await fetch(`${noLoops.url}${town}`)).json()) as Record<string, unknown>;
    assert.deepEqual(readTownRead(200, none), none);
    assert.equal((readTownRead(200, none) as { reason: string }).reason, "no_loops");
  });

  it("the real host's connect answers round-trip through readConnectAnswer: a key loops rejects, loops not answering, no loops found, a key taken, the key forgotten", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const host = await testHost({ loopsUrl: stub.url, pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: () => undefined });
    cleanup.push(() => host.close());
    const connect = worldApiPath("/connect");
    const post = async (url: string, key: string) => {
      const response = await fetch(`${url}${connect}`, { method: "POST", headers: { origin: url, "content-type": "application/json" }, body: JSON.stringify({ key }) });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };
    const rejected = await post(host.url, "chl_" + "x".repeat(43));
    assert.equal(rejected.status, 403);
    assert.deepEqual(readConnectAnswer(403, rejected.body), rejected.body);
    assert.equal(rejected.body.error, "key_rejected");
    stub.outage({ status: 503 });
    const down = await post(host.url, stub.key);
    assert.equal(down.status, 503);
    assert.deepEqual(readConnectAnswer(503, down.body), down.body);
    assert.equal(down.body.error, "loops_down");
    stub.outage(null);
    const taken = await post(host.url, stub.key);
    assert.equal(taken.status, 200);
    assert.deepEqual(readConnectAnswer(200, taken.body), taken.body, "ok and the whole connection");
    const forgotten = await fetch(`${host.url}${connect}`, { method: "DELETE", headers: { origin: host.url } });
    const forgottenBody = (await forgotten.json()) as Record<string, unknown>;
    assert.equal(forgotten.status, 200);
    assert.deepEqual(readConnectAnswer(200, forgottenBody), forgottenBody);
    const appData = mkdtempSync(path.join(tmpdir(), "chw-wire-app2-"));
    cleanup.push(() => rmSync(appData, { recursive: true, force: true }));
    mkdirSync(path.join(appData, "run"));
    const free = createServer();
    await new Promise<void>((resolve) => free.listen(0, "127.0.0.1", resolve));
    const port = (free.address() as AddressInfo).port;
    await new Promise<void>((resolve) => free.close(() => resolve()));
    writeFileSync(path.join(appData, "settings.json"), `{"port": ${port}}\n`);
    const noLoops = await testHost({ discovery: { appData, intervalMs: 40 }, pairing: "off", log: () => undefined });
    cleanup.push(() => noLoops.close());
    const none = await post(noLoops.url, stub.key);
    assert.equal(none.status, 503);
    assert.deepEqual(readConnectAnswer(503, none.body), none.body);
    assert.equal(none.body.error, "no_loops");
  });

  it("the Connect screens' stub refuses a key with the host's own word, key_rejected, so the page's readers meet one wire", async () => {
    const stub = await createConnectStub({ state: "connect", log: () => undefined });
    cleanup.push(() => stub.close());
    const response = await fetch(`${stub.url}${worldApiPath("/connect")}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "chl_bad" + "x".repeat(40) }) });
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(response.status, 403);
    assert.deepEqual(readConnectAnswer(403, body), body);
    assert.equal(body.error, "key_rejected", "the host's word (host.ts connect), not one of the stub's own");
    // A request's own fault: the host's word is validation_error (review-h2 2), for a key that is no key and a body that is no JSON.
    const noKey = await fetch(`${stub.url}${worldApiPath("/connect")}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "nope" }) });
    const noKeyBody = (await noKey.json()) as Record<string, unknown>;
    assert.equal(noKey.status, 400);
    assert.deepEqual(readConnectAnswer(noKey.status, noKeyBody), noKeyBody);
    assert.equal(noKeyBody.error, "validation_error");
    const noJson = await fetch(`${stub.url}${worldApiPath("/connect")}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    assert.equal(((await noJson.json()) as Record<string, unknown>).error, "validation_error");
  });
});
