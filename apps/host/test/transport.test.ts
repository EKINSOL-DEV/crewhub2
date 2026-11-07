/**
 * The transport seam follows no redirect (round 33, a mutation survivor): a loops, or whatever answers at its URL,
 * that redirects an allowed path to another one must not make the host fetch that other path with the key. Over
 * TCP `fetch` is told `redirect: "error"`; over the socket a 3xx is rejected by hand. Against a tiny server of the
 * test's own on 127.0.0.1 port 0 and a socket in a temp folder.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { createTcpTransport, createUnixTransport, type LoopsTransport } from "../src/transport.ts";

const KEY_HEADER = { Authorization: "Bearer chl_redirect_test_key" };

/** A server that redirects `/api/health` to `/api/agents/lead-1/keys` (a path off the allow-list) and records what reaches it. */
function redirecting(): { server: Server; seen: { path: string; authorization: string | undefined }[] } {
  const seen: { path: string; authorization: string | undefined }[] = [];
  const server = createServer((req, res) => {
    seen.push({ path: req.url ?? "", authorization: req.headers.authorization });
    if (req.url === "/api/health") {
      res.writeHead(302, { location: "/api/agents/lead-1/keys" });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: ["would-be-a-secret"] }));
  });
  return { server, seen };
}

describe("the transport follows no redirect", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  async function proves(transport: LoopsTransport, seen: { path: string; authorization: string | undefined }[]): Promise<void> {
    await assert.rejects(transport.request("/api/health", {}, { accept: "application/json", timeoutMs: 2000 }), (e: unknown) => e instanceof Error && (/redirect/i.test(e.message) || /redirect/i.test(String((e as { cause?: { message?: unknown } }).cause?.message ?? ""))), "a 3xx from loops is a failed read, never a followed one");
    assert.deepEqual(seen.map((r) => r.path), ["/api/health"], "the redirect's target was never asked for");
    assert.ok(seen.every((r) => r.authorization === KEY_HEADER.Authorization), "the key went to the allowed path only");
  }

  it("over TCP: a 302 to a path off the allow-list is not followed, and the key never reaches that path", async () => {
    const { server, seen } = redirecting();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanup.push(() => new Promise<void>((resolve) => (server.closeAllConnections(), server.close(() => resolve()))));
    const port = (server.address() as AddressInfo).port;
    await proves(createTcpTransport(`http://127.0.0.1:${port}`, KEY_HEADER), seen);
  });

  it("over the Unix socket: the same", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const socketPath = path.join(dir, "loops.sock");
    assert.ok(socketPath.length < 100, "macOS caps a socket path at 104 bytes");
    const { server, seen } = redirecting();
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    cleanup.push(() => new Promise<void>((resolve) => (server.closeAllConnections(), server.close(() => resolve()))));
    await proves(createUnixTransport(socketPath, KEY_HEADER), seen);
  });
});
