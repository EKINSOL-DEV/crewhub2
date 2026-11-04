/* The program's road to a running host (runningHost.ts, round 60 H1): what a port answers a program, read once. The hosts
   are the test's own (testHost on port 0) or hand servers that answer whatever a port might; nothing named. */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterEach, describe, it } from "node:test";
import { MINT_HEADER, mint, portState, probe } from "../src/runningHost.ts";
import { testHost } from "./testHost.ts";

/** A port nothing listens on: taken from a server that listened on it and closed. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

const HEALTH = { loops: "ok", keyName: "crewhub-world", sharedKey: false, checkout: "9f2c1a7b3d4e", connection: { discovery: { state: "found" }, key: { state: "ok" }, stream: { state: "ok", reconnects: 0 } } };

describe("the road to a running host", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  /** A hand server on a port of its own that answers every request with `status` and `body` (JSON unless `type` says). */
  async function answering(status: number, body: unknown, type = "application/json"): Promise<number> {
    const server: Server = createServer((_req, res) => {
      res.writeHead(status, { "content-type": type });
      res.end(type === "application/json" ? JSON.stringify(body) : String(body));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    return (server.address() as { port: number }).port;
  }

  it("probe: a host answers with its health, read by the wire's reader (its id and key name; a path is not an id)", async () => {
    const host = await testHost({ loopsUrl: "http://127.0.0.1:1", checkout: "9f2c1a7b3d4e", retryMs: { min: 20, max: 100 }, log: () => undefined });
    cleanup.push(() => host.close());
    const answer = await probe(host.port);
    assert.equal(answer.kind, "host");
    assert.equal(answer.kind === "host" && answer.health.checkout, "9f2c1a7b3d4e");
    assert.equal(answer.kind === "host" && answer.health.keyName, "", "no key yet");
    const path = await probe(await answering(200, { ...HEALTH, checkout: "/Users/me/repo" }));
    assert.equal(path.kind, "host");
    assert.equal(path.kind === "host" && path.health.checkout, undefined, "a path is not an id: dropped, the host stands");
  });

  it("probe: silence where nothing listens; not a host when the answer is not a host's health or not a 2xx", async () => {
    assert.deepEqual(await probe(await closedPort(), 500), { kind: "silent" });
    assert.deepEqual(await probe(await answering(200, { status: "ok" })), { kind: "not-a-host" }, "some other service's health");
    // A 200 that is not JSON: the probe has always read it as silence (the body's read fails like a connection would);
    // the doctor's port state turns that into "taken" below. Unchanged; named in round 60's report.
    assert.deepEqual(await probe(await answering(200, "<html>", "text/html")), { kind: "silent" }, "not JSON");
    assert.deepEqual(await probe(await answering(200, null)), { kind: "not-a-host" });
    assert.deepEqual(await probe(await answering(500, HEALTH)), { kind: "not-a-host" }, "a host-shaped body on a failing status is no host");
  });

  it("portState: free where nothing listens, a host with its health, taken by anything else", async () => {
    assert.deepEqual(await portState(await closedPort()), { kind: "free" });
    const state = await portState(await answering(200, HEALTH));
    assert.equal(state.kind, "host");
    assert.equal(state.kind === "host" && state.health.connection?.key.state, "ok", "the states, typed");
    assert.deepEqual(await portState(await answering(200, "<html>", "text/html")), { kind: "taken" });
    assert.deepEqual(await portState(await answering(404, { error: "not_found" })), { kind: "taken" });
  });

  it("mint: a link from the host that runs there, with the run file's secret; on another origin when asked; null otherwise", async () => {
    const host = await testHost({ loopsUrl: "http://127.0.0.1:1", mintSecret: "the-run-file-secret", retryMs: { min: 20, max: 100 }, log: () => undefined });
    cleanup.push(() => host.close());
    const link = await mint(host.port, null, 1500, "the-run-file-secret");
    assert.ok(link !== null && link.startsWith(`${host.url}/pair/`), String(link));
    const elsewhere = await mint(host.port, "http://127.0.0.1:5294", 1500, "the-run-file-secret");
    assert.ok(elsewhere !== null && elsewhere.startsWith("http://127.0.0.1:5294/pair/"), String(elsewhere));
    assert.notEqual(elsewhere, link, "a fresh token each time");
    assert.equal(await mint(host.port, null, 1500, "a-guess"), null, "the wrong secret: the host answers not_found");
    assert.equal(await mint(host.port, null, 1500, null), null, "no run file to read: nothing is asked");
    assert.equal(await mint(await answering(200, { ok: true }), null, 1500, "s"), null, "an answer without a link");
    assert.equal(await mint(await closedPort(), null, 500, "s"), null, "nothing listens");
  });

  it("the secret travels in the mint header only, never in the path or a query", async () => {
    const seen: { url: string; header: string | undefined }[] = [];
    const server = createServer((req, res) => {
      seen.push({ url: req.url ?? "", header: req.headers[MINT_HEADER] as string | undefined });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ link: "http://127.0.0.1:1/pair/t" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const port = (server.address() as { port: number }).port;
    assert.equal(await mint(port, null, 1500, "s3cret"), "http://127.0.0.1:1/pair/t");
    assert.deepEqual(seen, [{ url: "/pair-mint", header: "s3cret" }]);
  });
});
