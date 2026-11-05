/* The `town` message names the move that changed the town (round 65, w6-12): a commit, an undo, a redo, an amend, so
   a browser can say "Undone in another browser". */
import assert from "node:assert/strict";
import { emptyTownDocument } from "@crewhub/world-model";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { openWorldDb } from "../src/worldDb.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { testHost } from "./testHost.ts";
import { waitFor } from "./wait.ts";

const DOC = (n: number) => ({ ...emptyTownDocument("greenhouse"), revision: n });

test("w6-12: every tab hears which move changed the town: commit, undo, redo", async () => {
  const stub = await createLoopsStub(installation());
  const dir = mkdtempSync(path.join(tmpdir(), "chw-town-op-"));
  const db = openWorldDb(dir);
  const host = await testHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, worldDb: db });
  try {
    await waitFor("the stream", async () => ((await (await fetch(`${host.url}/world-api/health`)).json()) as { connection: { stream: { state: string } } }).connection.stream.state === "ok");
    const put = (body: unknown) => fetch(`${host.url}/world-api/town`, { method: "PUT", headers: { origin: host.url, "content-type": "application/json" }, body: JSON.stringify(body) });
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    try {
      await put({ document: DOC(0), baseRev: 0 });
      assert.deepEqual(await tab.next((m) => m.type === "town"), { type: "town", rev: 1, op: "commit" });
      await put({ document: DOC(1), baseRev: 1 });
      assert.deepEqual(await tab.next((m) => m.type === "town" && m.rev === 2), { type: "town", rev: 2, op: "commit" });
      await put({ op: "undo", baseRev: 2 });
      assert.deepEqual(await tab.next((m) => m.type === "town" && m.rev === 3), { type: "town", rev: 3, op: "undo" });
      await put({ op: "redo", baseRev: 3 });
      assert.deepEqual(await tab.next((m) => m.type === "town" && m.rev === 4), { type: "town", rev: 4, op: "redo" });
    } finally {
      tab.close();
    }
  } finally {
    await host.close();
    await stub.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
