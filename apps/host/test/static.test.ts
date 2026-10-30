import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
    await rm(dir, { recursive: true, force: true });
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

  it("the served world may be framed by its own origin only, and nothing the host answers is to be sniffed (review F6)", async () => {
    const index = await fetch(`${host.url}/`);
    assert.equal(index.headers.get("content-security-policy"), "frame-ancestors 'self'");
    assert.equal(index.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(index.headers.get("x-content-type-options"), "nosniff");
    const deep = await fetch(`${host.url}/building/atlas`);
    assert.equal(deep.headers.get("content-security-policy"), "frame-ancestors 'self'", "the SPA fallback is HTML too");
    const asset = await fetch(`${host.url}/assets/index-a1b2c3d4e5.js`);
    assert.equal(asset.headers.get("x-content-type-options"), "nosniff");
    assert.equal(asset.headers.get("content-security-policy"), null, "framing headers are for pages, not scripts");
    assert.equal(asset.headers.get("x-frame-options"), null);
    const json = await fetch(`${host.url}/world-api/health`);
    assert.equal(json.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await fetch(`${host.url}/world-api/nothing`)).headers.get("x-content-type-options"), "nosniff", "a 404 as well");
    host.setBuilding(true);
    try {
      const building = await fetch(`${host.url}/`);
      assert.equal(building.headers.get("content-security-policy"), "frame-ancestors 'self'", "the Building page as well");
    } finally {
      host.setBuilding(false);
    }
  });

  it("while the world is being built, every page is the Building page with its header; after, the world", async () => {
    host.setBuilding(true);
    try {
      const page = await fetch(`${host.url}/`);
      assert.equal(page.status, 200);
      assert.equal(page.headers.get("x-world-building"), "1");
      const html = await page.text();
      assert.match(html, /Building the world…/);
      assert.match(html, /fetch\(location\.href/, "the page asks the host for its own URL");
      assert.match(html, /<noscript><meta http-equiv="refresh" content="1">/, "without scripts it refreshes");
      assert.equal((await fetch(`${host.url}/building/atlas`)).headers.get("x-world-building"), "1", "an app route too");
      assert.equal((await fetch(`${host.url}/world-api/health`)).headers.get("x-world-building"), null, "the API is not the page");
    } finally {
      host.setBuilding(false);
    }
    const index = await fetch(`${host.url}/`);
    assert.equal(index.headers.get("x-world-building"), null, "the world's page carries no building header");
    assert.equal(await index.text(), "<!doctype html><title>World</title>");
  });

  it("beats on its own while loops is down, with the last seq", async () => {
    const sse = await openSse(`${host.url}/world-api/stream`);
    try {
      await sse.next((m) => m.type === "status" && m.loops === "ok");
      await stub.close();
      const beat = await sse.next((m) => m.type === "heartbeat");
      assert.equal(beat.seq, 0);
      assert.equal(typeof beat.ts, "string");
    } finally {
      sse.close();
    }
  });
});
