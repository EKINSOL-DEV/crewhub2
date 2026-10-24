/* `GET` and `PUT /world-api/town` and `/town/export` (round 20): the gate (pairing, origin, method), no loops means no
   installation, no town is 404, a create, a conflict, the export, and the `town` message on every tab's stream. */
import assert from "node:assert/strict";
import { emptyTownDocument } from "@crewhub/world-model";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { createHost, type Host } from "../src/host.ts";
import { MIGRATIONS, openWorldDb, type Migration, type WorldDb } from "../src/worldDb.ts";
import { createLoopsStub, installation, type LoopsStub } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { waitFor } from "./wait.ts";

/** A port nobody listens on right now (bound once on the loopback and closed again). */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** A whole, valid document at revision `n` (review F7: the host now validates what it keeps, as the browsers do). */
const DOC = (n: number) => ({ ...emptyTownDocument("greenhouse"), revision: n });

describe("the town routes", () => {
  let stub: LoopsStub | null = null;
  let host: Host | null = null;
  let db: WorldDb | null = null;
  let dir = "";
  afterEach(async () => {
    await host?.close();
    await stub?.close();
    db?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
    host = stub = db = null;
    dir = "";
  });

  async function start(extra: Partial<Parameters<typeof createHost>[0]> = {}) {
    stub = await createLoopsStub(installation());
    dir = mkdtempSync(path.join(tmpdir(), "chw-town-"));
    db = openWorldDb(dir);
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, worldDb: db, ...extra });
    await waitFor("the stream", async () => ((await (await fetch(`${host!.url}/world-api/health`)).json()) as { connection: { stream: { state: string } } }).connection.stream.state === "ok");
    return { host, stub, db };
  }
  const get = (path: string) => fetch(`${host!.url}/world-api${path}`);
  const put = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${host!.url}/world-api/town`, { method: "PUT", headers: { origin: host!.url, "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

  it("no town yet is revision 0 with the installation (no error); a create, a read, an export and the revision check", async () => {
    await start();
    const none = await get("/town");
    assert.equal(none.status, 200);
    const empty = (await none.json()) as { installation: string; rev: number; document: unknown; updatedAt: unknown };
    assert.deepEqual([empty.rev, empty.document, empty.updatedAt], [0, null, null]);
    const key = empty.installation;
    assert.match(key, /^127\.0\.0\.1-\d+$/, "the installation is the loops web app's host and port");
    assert.equal((await get("/town/export")).status, 404, "the export of nothing is a 404");
    const created = await put({ document: DOC(0), baseRev: 0 });
    assert.deepEqual([created.status, await created.json()], [200, { ok: true, rev: 1, document: DOC(0), canUndo: false, canRedo: false, changed: true }]);
    const read = await get("/town");
    const body = (await read.json()) as { installation: string; rev: number; updatedAt: string; document: unknown };
    assert.equal(read.status, 200);
    assert.deepEqual([body.installation, body.rev, body.document], [key, 1, DOC(0)]);
    assert.match(body.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    const exported = await get("/town/export");
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get("content-disposition"), 'attachment; filename="crewhub-town-r1.json"');
    assert.equal(await exported.text(), JSON.stringify(DOC(0)), "the same bytes as stored: build mode's format");
    // Another browser still on revision 0 (or 1 after a second write) is told the host's town, never overwrites it.
    const second = await put({ document: DOC(1), baseRev: 1 });
    assert.deepEqual(((await second.json()) as { rev: number; canUndo: boolean }).rev, 2);
    const late = await put({ document: DOC(9), baseRev: 1 });
    assert.equal(late.status, 409);
    const conflict = (await late.json()) as { error: string; rev: number; document: unknown };
    assert.deepEqual([conflict.error, conflict.rev, conflict.document], ["town_conflict", 2, DOC(1)]);
    const importOverExisting = await put({ document: DOC(0), baseRev: 0 });
    assert.equal(importOverExisting.status, 409, "a browser's import (baseRev 0) never lands on a town the host has");
    assert.equal(db!.getTown(key)?.rev, 2);
  });

  it("every tab on the stream hears a written revision", async () => {
    await start();
    const a = await openSse(`${host!.url}/world-api/stream?cursor=0`);
    const b = await openSse(`${host!.url}/world-api/stream?cursor=0`);
    try {
      await put({ document: DOC(0), baseRev: 0 });
      assert.deepEqual(await a.next((m) => m.type === "town"), { type: "town", rev: 1 });
      assert.deepEqual(await b.next((m) => m.type === "town"), { type: "town", rev: 1 });
      await put({ document: DOC(1), baseRev: 1 });
      assert.deepEqual(await b.next((m) => m.type === "town"), { type: "town", rev: 2 });
    } finally {
      a.close();
      b.close();
    }
  });

  it("the gate: the Origin header, JSON, a document of the town's format and a baseRev; the methods; pairing", async () => {
    await start();
    assert.equal((await fetch(`${host!.url}/world-api/town`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ document: DOC(0), baseRev: 0 }) })).status, 403, "no Origin");
    assert.equal((await fetch(`${host!.url}/world-api/town`, { method: "PUT", headers: { origin: host!.url, "content-type": "text/plain" }, body: "x" })).status, 415);
    assert.equal((await put("{not json")).status, 400);
    assert.equal((await put({ document: { format: "something-else/1" }, baseRev: 0 })).status, 400);
    assert.equal((await put({ document: DOC(0), baseRev: -1 })).status, 400);
    assert.equal((await put({ document: DOC(0) })).status, 400);
    assert.equal((await fetch(`${host!.url}/world-api/town`, { method: "DELETE", headers: { origin: host!.url } })).status, 405);
    assert.equal((await fetch(`${host!.url}/world-api/town/export`, { method: "PUT", headers: { origin: host!.url } })).status, 405);
    assert.equal(db!.getTown("127.0.0.1-1")?.rev, undefined);
    // Paired hosts refuse an unpaired browser as they do every other route.
    await host!.close();
    host = await createHost({ loopsUrl: stub!.url, key: stub!.key, keyName: "crewhub-world", keySource: "env", pairing: "on", retryMs: { min: 20, max: 100 }, worldDb: db! });
    assert.equal((await get("/town")).status, 401);
    assert.equal((await put({ document: DOC(0), baseRev: 0 })).status, 401);
  });

  it("a document the browsers would refuse is refused by the host with a plain reason (review F7): unknown keys, too many plots, a bad cell", async () => {
    await start();
    const refused = async (document: unknown, baseRev = 0) => {
      const r = await put({ document, baseRev });
      const body = (await r.json()) as { error: string; message: string };
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(body.error, "validation_error");
      return body.message;
    };
    assert.match(await refused({ ...DOC(0), pad: "x".repeat(1000) }), /^The document does not validate: pad: unknown key/);
    assert.match(await refused({ ...DOC(0), plots: Array.from({ length: 257 }, (_, i) => ({ slug: `p${i}`, cell: { x: i % 100, z: Math.floor(i / 100) } })) }), /plots: must have at most 256/);
    assert.match(await refused({ ...DOC(0), plots: [{ slug: "p", cell: { x: -1, z: 0 } }] }), /plots\[0\]\.cell\.x/);
    assert.match(await refused({ format: "crewhub-town/1" }), /^The document does not validate: /, "the format alone is not a document");
    assert.equal(db!.getTown("127.0.0.1-1")?.rev, undefined, "nothing was kept");
    assert.equal((await put({ document: DOC(0), baseRev: 0 })).status, 200, "a valid one is kept");
    assert.equal((await put({ document: { ...DOC(1), styleId: "another-style" }, baseRev: 1 })).status, 200, "the style registry is the browser's: the host takes the document's own style id");
  });

  it("without a world database the route says so; without a loops found the town has no installation yet", async () => {
    stub = await createLoopsStub(installation());
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 } });
    const none = await get("/town");
    assert.deepEqual([none.status, await none.json()], [200, { installation: null, rev: null, document: null, reason: "no_world_db" }], "a read is no error, only no revision");
    assert.equal((await put({ document: DOC(0), baseRev: 0 })).status, 503, "a write is refused with the reason");
    assert.equal((await get("/town/export")).status, 503);
    await host.close();
    dir = mkdtempSync(path.join(tmpdir(), "chw-town-"));
    db = openWorldDb(dir);
    // The app data folder names a port nobody listens on: without a settings.json the discovery falls back to 8091, the
    // Mac app's port, and on a Mac where the app runs the host finds it (an installation, revision 0) when its probe
    // wins the race against the read below (round 35).
    const appData = mkdtempSync(path.join(tmpdir(), "chw-app-"));
    writeFileSync(path.join(appData, "settings.json"), `{"port": ${await freePort()}}\n`);
    host = await createHost({ discovery: { appData, intervalMs: 40 }, pairing: "off", retryMs: { min: 20, max: 100 }, worldDb: db });
    const lost = await get("/town");
    assert.deepEqual([lost.status, ((await lost.json()) as { reason: string; rev: unknown }).reason, ((await (await get("/town")).json()) as { rev: unknown }).rev], [200, "no_loops", null]);
    assert.equal((await put({ document: DOC(0), baseRev: 0 })).status, 503);
    rmSync(appData, { recursive: true, force: true });
  });
});

describe("the town routes' history and backups (round 21)", () => {
  let stub: LoopsStub | null = null;
  let host: Host | null = null;
  let db: WorldDb | null = null;
  let dir = "";
  afterEach(async () => {
    await host?.close();
    await stub?.close();
    db?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
    host = stub = db = null;
    dir = "";
  });
  const get = (path: string) => fetch(`${host!.url}/world-api${path}`);
  const put = (body: unknown) => fetch(`${host!.url}/world-api/town`, { method: "PUT", headers: { origin: host!.url, "content-type": "application/json" }, body: JSON.stringify(body) });

  it("an undo and a redo move the host's history, tell every tab, and meet the revision check; the read says canUndo", async () => {
    stub = await createLoopsStub(installation());
    dir = mkdtempSync(path.join(tmpdir(), "chw-town-"));
    db = openWorldDb(dir);
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, worldDb: db });
    await waitFor("the stream", async () => ((await (await fetch(`${host!.url}/world-api/health`)).json()) as { connection: { stream: { state: string } } }).connection.stream.state === "ok");
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    try {
      assert.deepEqual(await (await put({ document: DOC(0), baseRev: 0 })).json(), { ok: true, rev: 1, document: DOC(0), canUndo: false, canRedo: false, changed: true });
      assert.deepEqual((await (await put({ op: "commit", document: DOC(1), baseRev: 1 })).json() as { rev: number; canUndo: boolean }).canUndo, true);
      const undone = (await (await put({ op: "undo", baseRev: 2 })).json()) as { rev: number; document: unknown; canUndo: boolean; canRedo: boolean };
      assert.deepEqual([undone.rev, undone.document, undone.canUndo, undone.canRedo], [3, DOC(0), false, true]);
      assert.deepEqual(await tab.next((m) => m.type === "town" && m.rev === 3), { type: "town", rev: 3 });
      const read = (await (await get("/town")).json()) as { rev: number; canUndo: boolean; canRedo: boolean; document: unknown };
      assert.deepEqual([read.rev, read.canUndo, read.canRedo, read.document], [3, false, true, DOC(0)]);
      const redone = (await (await put({ op: "redo", baseRev: 3 })).json()) as { rev: number; document: unknown };
      assert.deepEqual([redone.rev, redone.document], [4, DOC(1)]);
      // A stale undo (another browser moved first) is a conflict with the town as held.
      const stale = await put({ op: "undo", baseRev: 3 });
      assert.equal(stale.status, 409);
      assert.equal(((await stale.json()) as { rev: number }).rev, 4);
      // An op the host does not know, or a commit without a document, is refused.
      assert.equal((await put({ op: "merge", baseRev: 4 })).status, 400);
      assert.equal((await put({ op: "commit", baseRev: 4 })).status, 400);
      // Nothing to redo: no new revision, no message.
      const noop = (await (await put({ op: "redo", baseRev: 4 })).json()) as { rev: number; changed: boolean };
      assert.deepEqual([noop.rev, noop.changed], [4, false]);
    } finally {
      tab.close();
    }
  });

  it("the backups list and read this installation's town out of a copy; a name that is no backup is 404", async () => {
    stub = await createLoopsStub(installation());
    dir = mkdtempSync(path.join(tmpdir(), "chw-town-"));
    const old = openWorldDb(dir, { migrations: [MIGRATIONS[0] as Migration] });
    old.close();
    db = openWorldDb(dir);
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, worldDb: db });
    await waitFor("the stream", async () => ((await (await fetch(`${host!.url}/world-api/health`)).json()) as { connection: { stream: { state: string } } }).connection.stream.state === "ok");
    const key = ((await (await get("/town")).json()) as { installation: string }).installation;
    const listed = (await (await get("/town/backups")).json()) as { installation: string; backups: { name: string; version: number }[] };
    assert.deepEqual([listed.installation, listed.backups.map((b) => [b.name, b.version])], [key, [["world.db.bak-v1", 1]]]);
    assert.equal((await get("/town/backups/world.db.bak-v1")).status, 404, "the copy was made before this installation had a town");
    // A copy with the town in it: written by hand into the backup file, as a copy of an earlier run would have it.
    const copy = openWorldDb(path.join(dir, "copy"), { migrations: [MIGRATIONS[0] as Migration] });
    copy.putTown(key, JSON.stringify(DOC(5)), 0);
    copy.close();
    const { copyFileSync } = await import("node:fs");
    copyFileSync(path.join(dir, "copy", "world.db"), path.join(dir, "world.db.bak-v1"));
    const read = (await (await get("/town/backups/world.db.bak-v1")).json()) as { name: string; rev: number; document: unknown };
    assert.deepEqual([read.name, read.rev, read.document], ["world.db.bak-v1", 1, DOC(5)]);
    assert.equal((await get("/town/backups/world.db")).status, 404);
    assert.equal((await get("/town/backups/nothing")).status, 404);
    assert.equal((await fetch(`${host.url}/world-api/town/backups`, { method: "PUT", headers: { origin: host.url } })).status, 405);
  });
});
