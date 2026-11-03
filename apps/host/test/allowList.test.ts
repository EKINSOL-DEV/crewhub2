import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";
import { allowedLoopsPath, matchWorldRoute } from "../src/allowList.ts";
import { createHost, type Host } from "../src/host.ts";
import { type LoopsStub, createLoopsStub, installation } from "./loopsStub.ts";

describe("the allow-list", () => {
  let stub: LoopsStub;
  let host: Host;
  beforeEach(async () => {
    stub = await createLoopsStub(installation());
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 } });
  });
  afterEach(async () => {
    await host.close();
    await stub.close();
  });
  const get = (path: string, init: RequestInit = {}) => fetch(`${host.url}${path}`, init);

  it("answers 404 for a path that is not on the list, without a loops call", async () => {
    const before = stub.requests.length;
    for (const path of ["/world-api/agents", "/world-api/tickets", "/world-api/tickets/AT-1/history", "/world-api/deliveries", "/world-api/../api/projects", "/world-api/tickets/AT-1%2F..%2Fsecret"]) {
      const res = await get(path);
      assert.equal(res.status, 404, path);
    }
    assert.equal(stub.requests.slice(before).filter((r) => r.path.startsWith("/api/tickets") || r.path.startsWith("/api/deliveries")).length, 0);
  });

  it("answers 405 for every method but GET and nothing reaches loops", async () => {
    const before = stub.requests.length;
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      const res = await get("/world-api/tickets/AT-1", method === "HEAD" || method === "OPTIONS" ? { method } : { method, body: "{}" });
      assert.equal(res.status, 405, method);
      assert.equal(res.headers.get("allow"), "GET");
    }
    assert.equal(stub.requests.slice(before).filter((r) => r.path.includes("/api/tickets")).length, 0);
    assert.ok(stub.requests.every((r) => r.method === "GET"), "loops saw only GET");
  });

  it("passes refetch routes through with loops' status, and only limit/cursor of the query", async () => {
    const ok = await get("/world-api/tickets/AT-1?limit=5&project=x&q=drop");
    assert.equal(ok.status, 200);
    assert.deepEqual(((await ok.json()) as { ticket: { key: string } }).ticket.key, "AT-1");
    const sent = stub.requests.find((r) => r.path.startsWith("/api/tickets/AT-1"));
    assert.equal(sent?.path, "/api/tickets/AT-1", "no query on a single read");
    const comments = await get("/world-api/tickets/AT-1/comments?limit=10&cursor=abc&q=drop");
    assert.equal(comments.status, 200);
    assert.ok(stub.requests.some((r) => r.path === "/api/tickets/AT-1/comments?limit=10&cursor=abc"));
    const missing = await get("/world-api/tickets/AT-999");
    assert.equal(missing.status, 404);
    assert.equal(((await missing.json()) as { error: { code: string } }).error.code, "not_found");
  });

  it("answers 502 not_json for an answer that is not JSON, and never serves its page on the world's origin", async () => {
    // loops answers every route, its errors too, as JSON; an HTML page comes from a proxy in front of it or a wrong
    // CREWHUB_WORLD_LOOPS_URL (round 51, r51-review H4). Such a proxy, in front of the stub: two paths are its own.
    const own: Record<string, [number, string, string]> = {
      "/api/watchdog": [200, "text/html; charset=utf-8", "<!doctype html><title>Sign in</title><script>alert(1)</script>"],
      "/api/tickets/AT-2": [404, "text/plain", "Not Found"],
    };
    const proxy = createServer((req, res) => {
      const mine = own[new URL(req.url ?? "/", "http://127.0.0.1").pathname];
      if (mine !== undefined) return void res.writeHead(mine[0], { "content-type": mine[1] }).end(mine[2]);
      const ahead = request(`${stub.url}${req.url}`, { method: req.method, headers: req.headers }, (answer) => {
        // At once: the stream's head has no body behind it until an event, and the host waits for the head.
        res.writeHead(answer.statusCode ?? 502, answer.headers).flushHeaders();
        answer.pipe(res);
      });
      ahead.on("error", () => res.destroy());
      req.pipe(ahead);
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const behind = await createHost({ loopsUrl: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 }, log: () => undefined });
    try {
      for (const path of ["/world-api/watchdog", "/world-api/tickets/AT-2"]) {
        const res = await fetch(`${behind.url}${path}`);
        assert.equal(res.status, 502, path);
        assert.match(res.headers.get("content-type") ?? "", /^application\/json/, path);
        const text = await res.text();
        assert.equal((JSON.parse(text) as { error: string }).error, "not_json", path);
        assert.ok(!text.includes("<script>") && !text.includes("Not Found"), path);
      }
      const ticket = await fetch(`${behind.url}/world-api/tickets/AT-1`);
      assert.equal(ticket.status, 200, "loops' own JSON passes the proxy");
    } finally {
      await behind.close();
      proxy.closeAllConnections();
      await new Promise((resolve) => proxy.close(resolve));
    }
  });

  it("answers project-groups locally", async () => {
    const res = await get("/world-api/project-groups");
    assert.deepEqual(await res.json(), { groups: [] });
    assert.ok(!stub.requests.some((r) => r.path.includes("group")), "no loops call for groups");
  });

  it("gates every upstream path", () => {
    assert.equal(allowedLoopsPath("/api/board/atlas"), "/api/board/atlas");
    assert.equal(allowedLoopsPath("/api/tickets/AT-1/comments", { limit: "5", q: "x" }), "/api/tickets/AT-1/comments?limit=5");
    assert.throws(() => allowedLoopsPath("/api/deliveries"));
    assert.throws(() => allowedLoopsPath("/api/tickets/AT-1/history"));
    // Round 29: `ticket=` on the events read travels (crewhub-loops main filters by it); a key is never registered by
    // the world (loops main's `expectViewer` is the card's and the dialog's business): the keys route is not on the list.
    assert.equal(allowedLoopsPath("/api/events", { ticket: "tk_1", after: "5", limit: "50", types: "comment.created", expectViewer: "true" }), "/api/events?after=5&limit=50&ticket=tk_1&types=comment.created");
    assert.throws(() => allowedLoopsPath("/api/agents/crewhub-world/keys"));
    assert.equal(matchWorldRoute("/api/tickets/AT-1", new URLSearchParams()), null);
    assert.equal(matchWorldRoute("/world-api/tickets/a b", new URLSearchParams()), null);
  });
});
