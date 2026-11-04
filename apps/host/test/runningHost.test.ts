/* The program's road to a running host (runningHost.ts, round 60 H1): what a port answers a program, read once. The hosts
   are the test's own (testHost on port 0) or hand servers that answer whatever a port might; nothing named. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { runFilePath, writeRunFile } from "../src/runFile.ts";
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

  /** The run files go in a temp folder of the test's own: TMPDIR points there until the test ends (as runFile.test.ts). */
  function ownTmpdir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-road-"));
    const before = process.env["TMPDIR"];
    process.env["TMPDIR"] = dir;
    cleanup.push(() => {
      if (before === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = before;
      rmSync(dir, { recursive: true, force: true });
    });
    return dir;
  }

  it("mint: a link from the host that runs there, with the secret from its run file; on another origin when asked; null otherwise", async () => {
    ownTmpdir();
    const host = await testHost({ loopsUrl: "http://127.0.0.1:1", mintSecret: "the-run-file-secret", retryMs: { min: 20, max: 100 }, log: () => undefined });
    cleanup.push(() => host.close());
    assert.equal(await mint(host.port, null), null, "no run file yet: nothing is asked");
    const remove = writeRunFile(host.port, { pid: process.pid, url: host.url, mintSecret: "the-run-file-secret" });
    cleanup.push(remove);
    const link = await mint(host.port, null);
    assert.ok(link !== null && link.startsWith(`${host.url}/#pair=`), String(link));
    const elsewhere = await mint(host.port, "http://127.0.0.1:5294");
    assert.ok(elsewhere !== null && elsewhere.startsWith("http://127.0.0.1:5294/#pair="), String(elsewhere));
    assert.notEqual(elsewhere, link, "a fresh token each time");
    // Another process's run file on the same port (a wrong secret): the host answers not_found.
    writeFileSync(runFilePath(host.port), JSON.stringify({ pid: 1, url: host.url, mintSecret: "a-guess" }));
    assert.equal(await mint(host.port, null), null, "the wrong secret");
    // A hand-made file is no run file: only what writeRunFile writes (pid, url, mintSecret) is read.
    writeFileSync(runFilePath(host.port), JSON.stringify({ mintSecret: "the-run-file-secret" }));
    assert.equal(await mint(host.port, null), null, "no pid, no url: no run file");
  });

  it("mint: null when the port answers without a link or does not answer, and the secret travels in the mint header only", async () => {
    ownTmpdir();
    const seen: { url: string; header: string | undefined }[] = [];
    const server = createServer((req, res) => {
      seen.push({ url: req.url ?? "", header: req.headers[MINT_HEADER] as string | undefined });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(seen.length === 1 ? { ok: true } : { link: "http://127.0.0.1:1/pair/t" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const port = (server.address() as { port: number }).port;
    cleanup.push(writeRunFile(port, { pid: process.pid, url: `http://127.0.0.1:${port}`, mintSecret: "s3cret" }));
    assert.equal(await mint(port, null), null, "an answer without a link");
    assert.equal(await mint(port, null), "http://127.0.0.1:1/pair/t");
    assert.deepEqual(seen, [{ url: "/pair-mint", header: "s3cret" }, { url: "/pair-mint", header: "s3cret" }]);
    const closed = await closedPort();
    cleanup.push(writeRunFile(closed, { pid: process.pid, url: `http://127.0.0.1:${closed}`, mintSecret: "s3cret" }));
    assert.equal(await mint(closed, null), null, "nothing listens");
  });
});
