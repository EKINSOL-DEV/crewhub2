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

  it("refuses a foreign Origin with 403 and allows its own and the configured ones", async () => {
    assert.equal((await get({ origin: "https://localhost" })).status, 403);
    assert.equal((await get({ origin: "null" })).status, 403);
    assert.equal((await get({ origin: `http://127.0.0.1:${host.port + 1}` })).status, 403);
    assert.equal((await get({ origin: `http://127.0.0.1:${host.port}` })).status, 200);
    assert.equal((await get({ origin: `http://localhost:${host.port}` })).status, 200);
    assert.equal((await get({ origin: "http://localhost:5173" })).status, 200);
  });
});
