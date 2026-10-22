import assert from "node:assert/strict";
import { request } from "node:http";
import { after, before, describe, it } from "node:test";
import { createHost, type Host } from "../src/host.ts";
import { type LoopsStub, createLoopsStub, installation } from "./loopsStub.ts";

describe("the Host and Origin guard", () => {
  let stub: LoopsStub;
  let host: Host;
  before(async () => {
    stub = await createLoopsStub(installation());
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", allowedOrigins: ["http://localhost:5173"], retryMs: { min: 20, max: 100 } });
  });
  after(async () => {
    await host.close();
    await stub.close();
  });
  /** A raw request: `fetch` would overwrite the Host header. */
  const get = (headers: Record<string, string>) =>
    new Promise<{ status: number }>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: host.port, path: "/world-api/health", method: "GET", headers: { host: `127.0.0.1:${host.port}`, ...headers } }, (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
      });
      req.on("error", reject);
      req.end();
    });

  it("accepts its own 127.0.0.1 and localhost Host headers", async () => {
    assert.equal((await get({ host: `127.0.0.1:${host.port}` })).status, 200);
    assert.equal((await get({ host: `localhost:${host.port}` })).status, 200);
  });

  it("refuses a foreign Host with 421 (DNS rebinding)", async () => {
    for (const bad of ["evil.example", `evil.example:${host.port}`, `127.0.0.1:${host.port + 1}`, "127.0.0.1"]) {
      assert.equal((await get({ host: bad })).status, 421, bad);
    }
  });

  it("answers OPTIONS on a write route with 405 and never sends an access-control header, so no cross-origin page can write (review N4)", async () => {
    const preflight = (path: string, headers: Record<string, string>) =>
      new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port: host.port, path, method: "OPTIONS", headers: { host: `127.0.0.1:${host.port}`, ...headers } }, (res) => {
          res.resume();
          res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
        });
        req.on("error", reject);
        req.end();
      });
    for (const path of ["/world-api/town", "/world-api/connect", "/world-api/dev-origin", "/world-api/health"]) {
      // From an allowed origin the method is refused (405); from a foreign one the origin is (403); never a CORS header.
      const allowed = await preflight(path, { origin: "http://localhost:5173", "access-control-request-method": "PUT", "access-control-request-headers": "content-type" });
      assert.equal(allowed.status, 405, path);
      assert.deepEqual(Object.keys(allowed.headers).filter((h) => h.startsWith("access-control-")), [], `${path}: no CORS header`);
      const foreign = await preflight(path, { origin: "http://127.0.0.1:5173", "access-control-request-method": "PUT" });
      assert.equal(foreign.status, 403, path);
      assert.deepEqual(Object.keys(foreign.headers).filter((h) => h.startsWith("access-control-")), [], `${path}: no CORS header for a foreign origin`);
    }
    const read = await new Promise<Record<string, string | string[] | undefined>>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: host.port, path: "/world-api/health", method: "GET", headers: { host: `127.0.0.1:${host.port}`, origin: "http://localhost:5173" } }, (res) => (res.resume(), res.on("end", () => resolve(res.headers))));
      req.on("error", reject);
      req.end();
    });
    assert.deepEqual(Object.keys(read).filter((h) => h.startsWith("access-control-")), [], "an allowed origin's read gets no CORS header either: the page is same-origin or behind the proxy");
  });

  it("refuses a foreign Origin with 403 and allows its own and the configured ones", async () => {
    assert.equal((await get({ origin: "https://localhost" })).status, 403);
    assert.equal((await get({ origin: "null" })).status, 403);
    assert.equal((await get({ origin: `http://127.0.0.1:${host.port + 1}` })).status, 403);
    assert.equal((await get({ origin: `http://127.0.0.1:${host.port}` })).status, 200);
    assert.equal((await get({ origin: `http://localhost:${host.port}` })).status, 200);
    assert.equal((await get({ origin: "http://localhost:5173" })).status, 200);
  });
});
