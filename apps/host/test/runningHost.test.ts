/* The program's road to a running host (runningHost.ts, round 60 H1): what a port answers a program, read once. The hosts
   are the test's own (testHost on port 0) or hand servers that answer whatever a port might; nothing named. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it, mock } from "node:test";
import { runFilePath, writeRunFile } from "../src/runFile.ts";
import { MINT_HEADER, mint, portState, probe, tellOrigin, tellOutcome } from "../src/runningHost.ts";
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
    assert.ok(link !== null && link.startsWith(`${host.url}/pair/`), String(link));
    const elsewhere = await mint(host.port, "http://127.0.0.1:5294");
    assert.ok(elsewhere !== null && elsewhere.startsWith("http://127.0.0.1:5294/pair/"), String(elsewhere));
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

  /** A hand server that gives every request to `listener`; its cleanup drops whatever is still open. */
  async function serving(listener: RequestListener): Promise<{ port: number; server: Server }> {
    const server = createServer(listener);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    cleanup.push(() => new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    }));
    return { port: (server.address() as { port: number }).port, server };
  }

  const DEV = "http://127.0.0.1:5294";
  const CHECKOUT = "9f2c1a7b3d4e";
  /** What each of the road's three questions wants to hear. */
  const ANY_ANSWER = JSON.stringify({ ...HEALTH, link: "http://127.0.0.1:1/pair/t", origins: [DEV] });

  /** A port that answers everything well, `delayMs` late. The server is in this process, so its timer cannot fire before a shorter abort, however loaded the machine. */
  async function answeringAfter(delayMs: number): Promise<number> {
    const { port } = await serving((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(ANY_ANSWER);
      }, delayMs).unref();
    });
    return port;
  }
  const runFileFor = (port: number) => cleanup.push(writeRunFile(port, { pid: process.pid, url: `http://127.0.0.1:${port}`, mintSecret: "s3cret" }));

  it("what a program sends: the address by number, JSON asked, the secret in x-crewhub-world-mint read from the run file, never an Origin (round 62, r62-mut-a: runningHost.ts:18, 32, 74, 100, 105, 108)", async () => {
    ownTmpdir();
    const seen: Record<string, string | undefined>[] = [];
    const { port } = await serving((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        seen.push({ request: `${req.method} ${req.url}`, host: req.headers.host, accept: req.headers.accept, type: req.headers["content-type"], mint: req.headers["x-crewhub-world-mint"] as string | undefined, origin: req.headers.origin, body });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(ANY_ANSWER);
      });
    });
    runFileFor(port);
    assert.equal((await probe(port)).kind, "host");
    assert.equal(await mint(port, null), "http://127.0.0.1:1/pair/t");
    assert.deepEqual(await tellOrigin(port, DEV, CHECKOUT), { kind: "accepted", origins: [DEV] }, "with neither a timeout nor a secret given");
    const host = `127.0.0.1:${port}`;
    const [asked, minted, told] = seen;
    assert.deepEqual(asked, { request: "GET /world-api/health", host, accept: "application/json", type: undefined, mint: undefined, origin: undefined, body: "" });
    assert.deepEqual({ ...minted, accept: undefined }, { request: "GET /pair-mint", host, accept: undefined, type: undefined, mint: "s3cret", origin: undefined, body: "" });
    assert.deepEqual(told, { request: "POST /world-api/dev-origin", host, accept: "application/json", type: "application/json", mint: "s3cret", origin: undefined, body: JSON.stringify({ origin: DEV, checkout: CHECKOUT }) });
  });

  it("tellOrigin with no secret given and no run file: not told where something answers, silence where nothing does (round 62, r62-mut-a: runningHost.ts:100)", async () => {
    ownTmpdir();
    assert.deepEqual(await tellOrigin(await answeringAfter(0), DEV, CHECKOUT), { kind: "no-run-file" });
    assert.deepEqual(await tellOrigin(await closedPort(), DEV, CHECKOUT), { kind: "silent" });
  });

  it("with no timeout given, 1.5 s bounds probe, mint and tellOrigin: an answer at 2.5 s comes too late (round 62, r62-mut-a: runningHost.ts:28, 74, 100)", async () => {
    ownTmpdir();
    const port = await answeringAfter(2500);
    runFileFor(port);
    const [asked, minted, told] = await Promise.all([probe(port), mint(port, null), tellOrigin(port, DEV, CHECKOUT)]);
    assert.deepEqual(asked, { kind: "silent" });
    assert.equal(minted, null);
    assert.deepEqual(told, { kind: "silent" });
  });

  it("a caller's timeout is kept, on the no-run-file road too: an answer later than it is silence (round 62, r62-mut-a: runningHost.ts:32, 103, 107)", async () => {
    const port = await answeringAfter(400);
    assert.deepEqual(await probe(port, 50), { kind: "silent" });
    assert.deepEqual(await tellOrigin(port, DEV, CHECKOUT, 50, "s3cret"), { kind: "silent" });
    assert.deepEqual(await tellOrigin(port, DEV, CHECKOUT, 50, null), { kind: "silent" });
  });

  it("tellOutcome reads a body leniently: null or no list is an empty list, what is no string is left out (round 62, r62-mut-a: runningHost.ts:89, 90)", () => {
    assert.deepEqual(tellOutcome(500, null), { kind: "refused", status: 500, message: "status 500" });
    assert.deepEqual(tellOutcome(200, null), { kind: "accepted", origins: [] });
    assert.deepEqual(tellOutcome(200, {}), { kind: "accepted", origins: [] });
    assert.deepEqual(tellOutcome(200, { origins: "http://127.0.0.1:5294" }), { kind: "accepted", origins: [] });
    assert.deepEqual(tellOutcome(200, { origins: [DEV, 7, null] }), { kind: "accepted", origins: [DEV] });
  });

  it("tellOrigin: an answer that is not JSON is read by its status alone (round 62, r62-mut-a: runningHost.ts:113 to 116)", async () => {
    assert.deepEqual(await tellOrigin(await answering(500, "<html>", "text/html"), DEV, CHECKOUT, 1500, "s3cret"), { kind: "refused", status: 500, message: "status 500" });
    assert.deepEqual(await tellOrigin(await answering(200, "<html>", "text/html"), DEV, CHECKOUT, 1500, "s3cret"), { kind: "accepted", origins: [] });
  });

  it("portState closes the socket it asked with (round 62, r62-mut-a: runningHost.ts:50)", async () => {
    const { port } = await serving((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(ANY_ANSWER);
    });
    // Read on the asking side, the moment the answer is back, with no clock: left alone, its one-second timeout would close it anyway.
    const original = Socket.prototype.connect as (...args: unknown[]) => Socket;
    const sockets: Socket[] = [];
    const connect = mock.method(Socket.prototype, "connect", function (this: Socket, ...args: unknown[]) {
      sockets.push(this);
      return original.apply(this, args);
    } as never);
    try {
      assert.equal((await portState(port)).kind, "host");
    } finally {
      connect.mock.restore();
    }
    assert.equal(sockets[0]?.destroyed, true, "the connect's socket is gone; the probe asks on a connection of its own");
  });

  it("portState: a connect that never completes reads as free after a second, its socket dropped (round 62, r62-mut-a: runningHost.ts:54 to 56)", async () => {
    const port = await closedPort();
    const sockets: Socket[] = [];
    const connect = mock.method(Socket.prototype, "connect", function (this: Socket) {
      sockets.push(this);
      return this;
    } as never);
    let timer: NodeJS.Timeout | undefined;
    try {
      const stop = new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve("still waiting"), 5000);
      });
      assert.deepEqual(await Promise.race([portState(port), stop]), { kind: "free" });
    } finally {
      clearTimeout(timer);
      connect.mock.restore();
    }
    assert.equal(sockets.length, 1);
    assert.equal(sockets[0]?.destroyed, true);
  });

  it("portState asks 127.0.0.1 by number: a server on the IPv6 loopback alone leaves that port free (round 62, r62-mut-a: runningHost.ts:48)", async (t) => {
    const server = createServer();
    const listening = await new Promise<boolean>((resolve) => {
      server.once("error", () => resolve(false));
      server.listen(0, "::1", () => resolve(true));
    });
    if (!listening) return t.skip("no IPv6 loopback here");
    cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    assert.deepEqual(await portState((server.address() as { port: number }).port), { kind: "free" });
  });
});
