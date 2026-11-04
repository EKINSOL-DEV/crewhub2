/** The wire between the host and the page (`src/hostWire.ts`), read and built through its interface alone. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { type ConnectDoneSent, type TownConflictSent, type TownReadSent, type TownWrittenSent, WORLD_API_PREFIX, WORLD_ROUTES, isSegment, readConnectAnswer, readHostHealth, readHostMessage, readHostRefusal, readTownBackup, readTownBackups, readTownConflict, readTownRead, readTownWritten, worldApiPath } from "../src/hostWire.ts";

test("worldApiPath builds the page's path from the one table: the prefix, the segments encoded, the query the route takes", () => {
  assert.equal(worldApiPath("/health"), `${WORLD_API_PREFIX}/health`);
  assert.equal(worldApiPath("/tickets/{ref}", { ref: "CL-85" }), "/world-api/tickets/CL-85");
  assert.equal(worldApiPath("/tickets/{ref}/comments", { ref: "CL 85/x" }), "/world-api/tickets/CL%2085%2Fx/comments", "a segment is encoded, never spliced");
  assert.equal(worldApiPath("/town/backups/{name}", { name: "world.db.bak-v2" }), "/world-api/town/backups/world.db.bak-v2");
  assert.equal(worldApiPath("/stream", {}, { cursor: "-1" }), "/world-api/stream?cursor=-1", "the cursor the source resumes at, -1 before the first");
  assert.equal(worldApiPath("/projects/{slug}/milestones", { slug: "atlas" }, { limit: "50" }), "/world-api/projects/atlas/milestones?limit=50");
  assert.throws(() => worldApiPath("/health", {}, { cursor: "1" }), /takes no query parameter cursor/, "a query the route drops is the page's error, said here");
});

test("every pattern of the table builds a path the host's matcher accepts; a segment the rule refuses is refused by both", () => {
  for (const route of WORLD_ROUTES) {
    const params = Object.fromEntries([...route.pattern.matchAll(/\{(\w+)\}/g)].map((m) => [m[1] as string, "CL-1"]));
    const path = worldApiPath(route.pattern as Parameters<typeof worldApiPath>[0], params);
    assert.ok(path.startsWith(`${WORLD_API_PREFIX}/`), path);
    assert.ok(!path.includes("{"), `${path}: a segment left unfilled`);
  }
  assert.ok(isSegment("CL-111.2") && isSegment("tk_abc") && isSegment("ops-tooling"));
  assert.ok(!isSegment("") && !isSegment(".hidden") && !isSegment("a/b") && !isSegment(7) && !isSegment("x".repeat(129)));
});

test("readHostHealth keeps a host's whole answer, the dev origins included, and nothing it does not know", () => {
  const sent = {
    loops: "ok",
    keyName: "crewhub-world",
    sharedKey: false,
    loopsWebUrl: "http://127.0.0.1:5384",
    paired: true,
    pairing: "on",
    connection: { discovery: { state: "found", via: "env-url" }, key: { state: "ok", name: "crewhub-world", source: "stored" }, stream: { state: "ok", reconnects: 0, cursor: 12 }, archived: { source: "none", count: 0 }, snapshot: { state: "idle" } },
    checkout: "0a1b2c3d",
    devOrigins: ["http://127.0.0.1:5383"],
    loopsCommit: "4cdcd383",
    loopsCommitBefore: "053b5f47",
    cursor: 12,
    transport: "unix",
  };
  assert.deepEqual(readHostHealth(sent), sent, "every field a current host writes comes through as it was");
  const { loopsWebUrl: _url, checkout: _checkout, transport: _transport, ...rest } = sent;
  const odd = readHostHealth({ ...sent, secret: "chl_never", loopsWebUrl: "javascript:alert(1)", checkout: "not-hex", devOrigins: ["http://127.0.0.1:1", 7], transport: "carrier-pigeon" });
  assert.deepEqual(odd, { ...rest, devOrigins: ["http://127.0.0.1:1"] }, "a field in a shape the page does not know is dropped, never passed on");
  assert.ok(!JSON.stringify(odd).includes("chl_"), "an unknown field never passes (it could be a secret)");
});

test("readHostHealth reads a host from before (states only) and answers null for anything that is not a host's", () => {
  assert.deepEqual(readHostHealth({ loops: "down", keyName: "", sharedKey: false }), { loops: "down", keyName: "", sharedKey: false });
  assert.equal(readHostHealth({ loops: "sleeping", keyName: "x" }), null, "a loops word the page does not know is no host");
  assert.equal(readHostHealth({ loops: "ok" }), null, "without the key's name it is no host");
  assert.equal(readHostHealth(null), null);
  assert.equal(readHostHealth("ok"), null);
});

const envelope = (seq: number): Record<string, unknown> => ({ ...JSON.parse(readFileSync(new URL("./fixtures/envelope-ticket-moved.json", import.meta.url), "utf8")), seq });
const read = (value: unknown) => {
  const result = readHostMessage(value);
  return result.ok ? result.value : `${result.path}: ${result.message}`;
};

test("readHostMessage reads every kind the host sends, as it was sent", () => {
  const chat = { agentId: "ag-1", agentName: "Lead", text: "Done.", at: "2026-11-04T10:00:00Z", messageId: "dm_1", threadId: "th_1" };
  const sent: unknown[] = [
    { type: "status", loops: "ok", key: "ok" },
    { type: "status", loops: "down", stream: "busy", reason: "stream budget exhausted (429): another host or tab uses this key", key: "ok" },
    { type: "status", loops: "unauthorized", key: "none" },
    { type: "status", loops: "ok" },
    { type: "event", envelope: envelope(101) },
    { type: "heartbeat", seq: 101, ts: "2026-11-04T10:00:15Z" },
    { type: "chat", chat },
    { type: "town", rev: 7 },
    { type: "threads", threads: [{ agentId: "ag-1", lastMessageAt: "2026-11-04T10:00:00Z", unreadCount: 1 }] },
    { type: "reset", reason: "gone" },
    { type: "reset", reason: "reconnected" },
    { type: "reset", reason: "cursor" },
  ];
  for (const message of sent) assert.deepEqual(read(message), message, JSON.stringify(message));
});

test("readHostMessage: lenient on a loops word or a key word it does not know, strict on every shape; says why", () => {
  assert.deepEqual(read({ type: "status", loops: "ok", key: "banana" }), { type: "status", loops: "ok" }, "a key word it does not know is dropped, the status stands");
  assert.deepEqual(read({ type: "status", loops: "sleeping" }), { type: "status", loops: "down" }, "a loops word it does not know is down, as the world from before took it");
  assert.deepEqual(read({ type: "status", loops: "ok", stream: "slow" }), { type: "status", loops: "ok" }, "only busy is a stream word");
  assert.equal(read({ type: "status" }), "$.loops: expected one of ok, down, unauthorized, got undefined");
  assert.equal(read({ type: "heartbeat", seq: "101", ts: "x" }), "$.seq: expected a number");
  assert.equal(read({ type: "heartbeat", seq: 101 }), "$.ts: expected a string");
  for (const rev of [1.5, -1, "7", null]) assert.equal(read({ type: "town", rev }), "$.rev: expected a whole number from 0 up", String(rev));
  assert.deepEqual(read({ type: "town", rev: 0 }), { type: "town", rev: 0 });
  assert.match(String(read({ type: "chat", chat: { agentId: "", text: "x" } })), /^\$\.chat: /);
  assert.equal(read({ type: "threads", threads: "none" }), "$.threads: expected a list of thread facts");
  assert.deepEqual(read({ type: "threads", threads: [{ agentId: "ag-1", lastMessageAt: "t", unreadCount: -1 }, 7] }), { type: "threads", threads: [] }, "a bad row is dropped, the list stands");
  assert.match(String(read({ type: "event", envelope: { ...envelope(101), v: 2 } })), /^\$\.envelope\.v: /, "the envelope's own validator, its path under envelope");
  assert.deepEqual(read({ type: "reset" }), { type: "reset", reason: "gone" }, "a reset without a reason still resets (the page re-snapshots whatever the reason, which it never reads)");
  assert.deepEqual(read({ type: "reset", reason: 7 }), { type: "reset", reason: "gone" });
  assert.deepEqual(read({ type: "reset", reason: "restored" }), { type: "reset", reason: "restored" }, "a newer host's reason passes through");
  assert.equal(read({ type: "sing" }), '$.type: unknown message type "sing"');
  assert.equal(read({}), "$.type: unknown message type undefined");
  assert.equal(read(null), "$: expected a message object");
  assert.equal(read([]), "$: expected a message object");
});

test("the town's readers keep a host's whole answer: a held town, a fresh host, a host with none yet, a write, a conflict, the backups", () => {
  const held: TownReadSent = { installation: "i", rev: 3, updatedAt: "2026-11-04T10:00:00.000Z", document: { format: "crewhub-town/1", plots: [] }, canUndo: true, canRedo: false };
  assert.deepEqual(readTownRead(200, held), held);
  const fresh: TownReadSent = { installation: "i", rev: 0, updatedAt: null, document: null, canUndo: false, canRedo: false };
  assert.deepEqual(readTownRead(200, fresh), fresh);
  const none: TownReadSent = { installation: null, rev: null, document: null, reason: "no_world_db" };
  assert.deepEqual(readTownRead(200, none), none);
  const written: TownWrittenSent = { ok: true, rev: 4, document: { format: "crewhub-town/1", plots: [] }, canUndo: true, canRedo: false, changed: true };
  assert.deepEqual(readTownWritten(200, written), written);
  const conflict: TownConflictSent = { error: "town_conflict", message: "Another browser changed the town", rev: 5, document: null, canUndo: false, canRedo: false };
  assert.deepEqual(readTownConflict(409, conflict), conflict);
  const backups = { installation: "i", backups: [{ name: "world.db.bak-v2", version: 2, bytes: 4096, at: "2026-11-04T10:00:00.000Z" }, { name: "world.db.bak-v1", version: 1, bytes: 2048, at: "2026-11-03T10:00:00.000Z" }] };
  assert.deepEqual(readTownBackups(200, backups), backups);
  const backup = { installation: "i", name: "world.db.bak-v2", rev: 7, document: { format: "crewhub-town/1", plots: [] } };
  assert.deepEqual(readTownBackup(200, backup), backup);
});

test("the town's readers: lenient on what the page never read (the history flags, the stamp, the installation), strict on the status, the revision and the one word", () => {
  // A host from before the history (round 21) says no flags: the page then knows nothing about undo, as before.
  assert.deepEqual(readTownRead(200, { rev: 2, document: null }), { rev: 2, document: null });
  assert.deepEqual(readTownRead(200, { rev: 2, document: null, canUndo: true }), { rev: 2, document: null }, "one flag without the other says nothing");
  assert.deepEqual(readTownRead(200, { rev: null }), { rev: null }, "no reason given: the page says 'no revision' itself");
  assert.equal(readTownRead(200, { rev: "3", document: null }), null, "a revision that is no whole number");
  assert.equal(readTownRead(200, { rev: -1, document: null }), null);
  assert.equal(readTownRead(404, { rev: 1, document: null }), null, "not a 200");
  assert.equal(readTownRead(200, null), null);
  assert.equal(readTownRead(200, []), null);
  assert.deepEqual(readTownWritten(200, { ok: true, rev: 1, document: null }), { ok: true, rev: 1, document: null });
  assert.equal(readTownWritten(200, { rev: 1, document: null }), null, "a write's 200 carries the host's own ok");
  assert.equal(readTownWritten(409, { ok: true, rev: 1, document: null }), null);
  assert.deepEqual(readTownConflict(409, { error: "town_conflict", rev: 2, document: null }), { error: "town_conflict", rev: 2, document: null });
  assert.equal(readTownConflict(409, { error: "other", rev: 2, document: null }), null, "a 409 with another word is not a town conflict");
  assert.equal(readTownConflict(409, { error: "town_conflict", document: null }), null, "a conflict names the revision");
  assert.equal(readTownConflict(200, { error: "town_conflict", rev: 2, document: null }), null);
  assert.deepEqual(readTownBackups(200, { backups: [{ name: "x", version: 1 }, { name: 3, version: 1 }, { version: 2 }] }), { backups: [{ name: "x", version: 1 }] }, "a row without a name or a version is dropped");
  assert.equal(readTownBackups(200, { backups: "none" }), null);
  assert.equal(readTownBackups(503, { backups: [] }), null);
  assert.equal(readTownBackup(404, { error: "no_town" }), null);
  assert.equal(readTownBackup(200, { document: {} }), null, "a backup's town names its revision");
});

test("readConnectAnswer: done on a 2xx with the host's own ok (the connection when it reads), the refusal's words otherwise, null for no object", () => {
  const done: ConnectDoneSent = { ok: true, connection: { discovery: { state: "found", via: "env-url", target: "http://127.0.0.1:1" }, key: { state: "ok", name: "crewhub-world", source: "stored" }, stream: { state: "ok", reconnects: 0 }, archived: { source: "none", count: 0, slugs: [] }, snapshot: { state: "idle" } } };
  assert.deepEqual(readConnectAnswer(200, done), done);
  assert.deepEqual(readConnectAnswer(200, { ok: true }), { ok: true }, "a stub without a connection");
  assert.deepEqual(readConnectAnswer(200, { ok: true, connection: "later" }), { ok: true }, "a connection that does not read is left out, not invented");
  assert.deepEqual(readConnectAnswer(403, { error: "key_rejected", reason: "crewhub-loops does not know this key" }), { error: "key_rejected", reason: "crewhub-loops does not know this key" });
  assert.deepEqual(readConnectAnswer(503, { error: "no_loops", message: "open Crewhub.app" }), { error: "no_loops", message: "open Crewhub.app" });
  assert.deepEqual(readConnectAnswer(401, { error: "not_paired" }), { error: "not_paired" });
  assert.deepEqual(readConnectAnswer(200, { ok: false }), {}, "a 200 without ok is no success: the refusal has no words");
  assert.deepEqual(readConnectAnswer(500, { error: 7, message: ["x"] }), {}, "words that are not strings are dropped");
  assert.equal(readConnectAnswer(204, null), null, "the dev server's 204 while the host is down");
  assert.equal(readConnectAnswer(0, null), null);
  assert.deepEqual(readHostRefusal({ error: "validation_error", message: "baseRev must be…" }), { error: "validation_error", message: "baseRev must be…" });
  assert.equal(readHostRefusal("no"), null);
});
