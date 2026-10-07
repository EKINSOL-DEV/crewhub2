import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createHost, type Host } from "../src/host.ts";
import { type LoopsStub, createLoopsStub, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";

describe("static files and the host's own heartbeat", () => {
  let stub: LoopsStub;
  let host: Host;
  let dir: string;
  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "world-dist-"));
    await mkdir(path.join(dir, "assets"));
    await writeFile(path.join(dir, "index.html"), "<!doctype html><title>World</title>");
    await writeFile(path.join(dir, "assets", "index-a1b2c3d4e5.js"), "console.log(1)");
    stub = await createLoopsStub(installation());
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairing: "off", staticDir: dir, retryMs: { min: 20, max: 100 }, heartbeatMs: 100 });
  });
  after(async () => {
    await host.close();
    await stub.close();
  });

  it("serves the built world with an SPA fallback and never a file outside the folder", async () => {
    const index = await fetch(`${host.url}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type") ?? "", /text\/html/);
    const deep = await fetch(`${host.url}/building/atlas?x=1`);
    assert.equal(deep.status, 200);
    assert.equal(await deep.text(), "<!doctype html><title>World</title>", "an app route falls back to index.html");
    const asset = await fetch(`${host.url}/assets/index-a1b2c3d4e5.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type") ?? "", /javascript/);
    assert.match(asset.headers.get("cache-control") ?? "", /immutable/);
    const outside = await fetch(`${host.url}/..%2F..%2Fetc%2Fpasswd`);
    assert.equal(outside.status, 200);
    assert.equal(await outside.text(), "<!doctype html><title>World</title>", "a traversal gets the app, not a file");
    assert.equal((await fetch(`${host.url}/world-api/nothing`)).status, 404, "the API prefix never falls back to the app");
  });

  it("beats on its own while loops is down, with the last seq", async () => {
    const sse = await openSse(`${host.url}/world-api/stream`);
    try {
      await sse.next((m) => m.type === "status" && m.loops === "ok");
      await stub.close();
      const beat = await sse.next((m) => m.type === "heartbeat", 3000);
      assert.equal(beat.seq, 0);
      assert.equal(typeof beat.ts, "string");
    } finally {
      sse.close();
    }
  });
});
