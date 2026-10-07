import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { allowedLoopsPath, matchWorldRoute } from "../src/allowList.ts";
import { createHost, type Host } from "../src/host.ts";
import { type LoopsStub, createLoopsStub, installation } from "./loopsStub.ts";

describe("the allow-list", () => {
  let stub: LoopsStub;
  let host: Host;
  beforeEach(async () => {
    stub = await createLoopsStub(installation());
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
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
    assert.equal(matchWorldRoute("/api/tickets/AT-1", new URLSearchParams()), null);
    assert.equal(matchWorldRoute("/world-api/tickets/a b", new URLSearchParams()), null);
  });
});
