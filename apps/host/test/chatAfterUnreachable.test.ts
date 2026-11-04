/**
 * The chat road after an unreachable verdict on a key that was ok (round 62, H-1; rv-host's red proof adopted): loops
 * goes away and comes back with health answering but the key check still 503 (half up after a restart). The key keeps
 * `ok` (nothing is known against it), the link is built and the stream keeps trying; once the stream opens, the second
 * opinion changes no word (it was `ok` already), so the ear must ask the chat road on its own: before the fix the only
 * `chat.check()` of the link sat under "the word changed", and health said `session: unknown` with no threads and no
 * bubbles for the whole life of the link. Through `testConnection` against the stub on an app-data folder (port 0).
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { testConnection } from "./testHost.ts";
import { waitFor } from "./wait.ts";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("the chat road after an unreachable verdict on a key that was ok", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  it("loops back after a restart, 503 to the key check with health ok: the key stays ok, the link is built, and once the stream opens the chat road is asked on that link", async () => {
    const port = await freePort();
    const first = await createLoopsStub({ ...installation(), port, keyReadsChat: true });
    const appData = mkdtempSync(path.join(tmpdir(), "chw-h1-"));
    cleanup.push(() => rmSync(appData, { recursive: true, force: true }));
    mkdirSync(path.join(appData, "run"));
    writeFileSync(path.join(appData, "settings.json"), `{"port": ${port}}\n`);
    const lines: string[] = [];
    const conn = testConnection({
      discovery: { loopsUrl: null, loopsSocket: null, loopsWebUrl: null, appData, intervalMs: 40 },
      key: { key: first.key, name: "crewhub-world", source: "stored" },
      timings: { retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 } },
      log: (line) => lines.push(line),
    });
    cleanup.push(() => conn.close());
    conn.start();
    const state = async () => {
      await conn.settled();
      return conn.state(true);
    };
    await waitFor("the chat road on the first link", async () => (await state()).session?.state === "key");
    await first.close();
    await waitFor("searching", async () => (await state()).discovery.state === "searching");
    // The same loops again on its port, health answering, the API still 503: the verdict is unreachable, the key keeps ok.
    const again = await createLoopsStub({ ...installation(), port, key: first.key, keyReadsChat: true });
    cleanup.push(() => again.close());
    again.outage({ status: 503, healthOk: true });
    await waitFor("found again, the key check unreachable, the stream down", async () => {
      const s = await state();
      return s.discovery.state === "found" && s.stream.state === "down" && s.key.state === "ok";
    });
    assert.ok(lines.some((l) => /key crewhub-world \(stored\) ok: crewhub-loops answered 503/.test(l)), lines.join("\n"));
    const threadsBefore = again.requests.filter((r) => r.path === "/api/dm/threads").length;
    again.outage(null);
    await waitFor("the stream back", async () => (await state()).stream.state === "ok");
    await waitFor("the chat road asked on this link (session: key)", async () => (await state()).session?.state === "key", 3000).catch((error: Error) => {
      const threads = again.requests.filter((r) => r.path === "/api/dm/threads").length - threadsBefore;
      assert.fail(`${error.message}; session=${JSON.stringify((conn.state(true) as { session?: unknown }).session)}; threads reads on the second link: ${threads}; log tail: ${lines.slice(-4).join(" | ")}`);
    });
    assert.ok(again.requests.some((r) => r.path === "/api/dm/threads"), "the road was read on the second link");
  });
});
