/* `GET` and `PUT /world-api/town` and `/town/export` (round 20): the gate (pairing, origin, method), no loops means no
   installation, no town is 404, a create, a conflict, the export, and the `town` message on every tab's stream. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { createHost, type Host } from "../src/host.ts";
import { openWorldDb, type WorldDb } from "../src/worldDb.ts";
import { createLoopsStub, installation, type LoopsStub } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { waitFor } from "./wait.ts";

const DOC = (n: number) => ({ format: "crewhub-town/1", revision: n, styleId: "greenhouse", plots: [], placements: [], userProps: [], rules: {} });

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
    assert.deepEqual([created.status, await created.json()], [200, { ok: true, rev: 1 }]);
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
    assert.deepEqual(await second.json(), { ok: true, rev: 2 });
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

  it("without a world database the route says so; without a loops found the town has no installation yet", async () => {
    stub = await createLoopsStub(installation());
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 } });
    const none = await get("/town");
    assert.deepEqual([none.status, ((await none.json()) as { error: string }).error], [503, "no_world_db"]);
    await host.close();
    dir = mkdtempSync(path.join(tmpdir(), "chw-town-"));
    db = openWorldDb(dir);
    const appData = mkdtempSync(path.join(tmpdir(), "chw-app-"));
    host = await createHost({ discovery: { appData, intervalMs: 40 }, pairing: "off", retryMs: { min: 20, max: 100 }, worldDb: db });
    const lost = await get("/town");
    assert.deepEqual([lost.status, ((await lost.json()) as { error: string }).error], [503, "no_loops"]);
    rmSync(appData, { recursive: true, force: true });
  });
});
