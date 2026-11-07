/**
 * The one health reader (loopsHealth.ts, round 61 H4) against a small HTTP server on 127.0.0.1 port 0: what each
 * answer becomes, keyless always, and the client's `health()` over its own keyless transport with its read timeout.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { createLoopsClient } from "../src/loops.ts";
import { loopsAnswers, loopsHealth } from "../src/loopsHealth.ts";

type Answer = { status: number; body: string; delayMs?: number };

describe("loops' health, read once", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  /** A server answering `GET /api/health` as told, remembering each request's Authorization header. */
  async function serve(answer: Answer): Promise<{ url: string; authorizations: (string | undefined)[]; paths: string[]; accepts: (string | undefined)[] }> {
    const authorizations: (string | undefined)[] = [];
    const paths: string[] = [];
    const accepts: (string | undefined)[] = [];
    const server = createServer((req, res) => {
      authorizations.push(req.headers.authorization);
      paths.push(req.url ?? "");
      accepts.push(req.headers.accept);
      const send = () => {
        res.writeHead(answer.status, { "content-type": "application/json" });
        res.end(answer.body);
      };
      if (answer.delayMs === undefined) send();
      else setTimeout(send, answer.delayMs).unref();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    server.closeAllConnections;
    cleanup.push(() => server.closeAllConnections());
    const { port } = server.address() as AddressInfo;
    return { url: `http://127.0.0.1:${port}`, authorizations, paths, accepts };
  }
  const target = (url: string) => ({ transport: "tcp" as const, url });

  it("200 with ok and a version: ok, the version; the read is keyless and reads /api/health only", async () => {
    const s = await serve({ status: 200, body: JSON.stringify({ ok: true, version: "4cdcd383" }) });
    assert.deepEqual(await loopsHealth(target(s.url)), { status: 200, ok: true, version: "4cdcd383" });
    assert.equal(await loopsAnswers(target(s.url)), true);
    assert.deepEqual(s.authorizations, [undefined, undefined], "never the key");
    assert.deepEqual(s.paths, ["/api/health", "/api/health"]);
  });

  it("a 200 without ok, a version that is no string, a 503, a body that is not JSON: not ok, the status kept, the version only when it is a string", async () => {
    const rows: { what: string; answer: Answer; health: { status: number; ok: boolean; version?: string } }[] = [
      { what: "ok false", answer: { status: 200, body: JSON.stringify({ ok: false, version: "x" }) }, health: { status: 200, ok: false, version: "x" } },
      { what: "a version that is a number", answer: { status: 200, body: JSON.stringify({ ok: true, version: 7 }) }, health: { status: 200, ok: true } },
      { what: "ok that is truthy but not true", answer: { status: 200, body: JSON.stringify({ ok: "yes", version: "x" }) }, health: { status: 200, ok: false, version: "x" } },
      { what: "a 503 with ok", answer: { status: 503, body: JSON.stringify({ ok: true }) }, health: { status: 503, ok: false } },
      { what: "a 403 (a limited key would get it; keyless never does)", answer: { status: 403, body: "{}" }, health: { status: 403, ok: false } },
      { what: "not JSON", answer: { status: 200, body: "<html>another program</html>" }, health: { status: 200, ok: false } },
    ];
    for (const row of rows) {
      const s = await serve(row.answer);
      assert.deepEqual(await loopsHealth(target(s.url)), row.health, row.what);
      assert.equal(await loopsAnswers(target(s.url)), row.health.ok, row.what);
    }
  });

  it("nothing listening, or nothing answering within the timeout: null, and loopsAnswers false", async () => {
    const closed = await serve({ status: 200, body: "{}" });
    const url = closed.url;
    await cleanup.pop()!();
    await cleanup.pop()!();
    assert.equal(await loopsHealth(target(url)), null);
    assert.equal(await loopsAnswers(target(url)), false);
    const slow = await serve({ status: 200, body: JSON.stringify({ ok: true }), delayMs: 400 });
    assert.equal(await loopsHealth(target(slow.url), 50), null, "a health that takes longer than the timeout is no answer");
  });

  it("it asks for JSON (round 62, r62-mut-a: loopsHealth.ts:23)", async () => {
    const s = await serve({ status: 200, body: JSON.stringify({ ok: true }) });
    await loopsHealth(target(s.url));
    assert.deepEqual(s.accepts, ["application/json"]);
  });

  it("loopsAnswers keeps the caller's timeout: a health later than it is no answer (round 62, r62-mut-a: loopsHealth.ts:46)", async () => {
    const slow = await serve({ status: 200, body: JSON.stringify({ ok: true }), delayMs: 400 });
    assert.equal(await loopsAnswers(target(slow.url), 50), false);
  });

  it("with no timeout given, 1.5 s bounds both readers: an answer at 2.5 s comes too late (round 62, r62-mut-a: loopsHealth.ts:40, 45)", async () => {
    // The server is in this process: its 2.5 s timer cannot fire before the readers' 1.5 s, however loaded the machine.
    const late = await serve({ status: 200, body: JSON.stringify({ ok: true }), delayMs: 2500 });
    const [health, answers] = await Promise.all([loopsHealth(target(late.url)), loopsAnswers(target(late.url))]);
    assert.equal(health, null);
    assert.equal(answers, false);
  });

  it("the client's health(): the same reader over its keyless transport with its read timeout; the key never leaves", async () => {
    const s = await serve({ status: 200, body: JSON.stringify({ ok: true, version: "0.1.0" }) });
    const client = createLoopsClient(s.url, "chl_secret_key_0123456789", { readTimeoutMs: 1000 });
    assert.deepEqual(await client.health(), { status: 200, ok: true, version: "0.1.0" });
    assert.deepEqual(s.authorizations, [undefined], "keyless: crewhub-loops main refuses the public route to a limited key");
    const slow = await serve({ status: 200, body: JSON.stringify({ ok: true }), delayMs: 400 });
    assert.equal(await createLoopsClient(slow.url, "chl_secret_key_0123456789", { readTimeoutMs: 50 }).health(), null, "the client's read timeout bounds it");
  });
});
