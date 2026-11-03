/* A file of the built world that cannot be read after its stat (round 51, review H1): the host answers that one request
   and keeps serving; an unreadable file used to raise an `error` on a read stream nobody listened to, and end the host. */
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createHost, type Host } from "../src/host.ts";

describe("a file of the world that cannot be read", () => {
  let host: Host;
  let dir: string;
  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "world-dist-"));
    await writeFile(path.join(dir, "index.html"), "<!doctype html><title>World</title>");
    await writeFile(path.join(dir, "locked.js"), "console.log(1)");
    await chmod(path.join(dir, "locked.js"), 0o000);
    host = await createHost({ loopsUrl: "http://127.0.0.1:1", pairing: "off", staticDir: dir, retryMs: { min: 20, max: 100 }, log: () => undefined });
  });
  after(async () => {
    await host.close();
    await chmod(path.join(dir, "locked.js"), 0o600);
    await rm(dir, { recursive: true, force: true });
  });

  it("is a failed request, never the end of the host", async () => {
    const locked = await fetch(`${host.url}/locked.js`, { signal: AbortSignal.timeout(2000) }).then((r) => r.status, (error: Error) => error.name);
    assert.equal(locked, 500, "the host's own failure, answered");
    const index = await fetch(`${host.url}/`, { signal: AbortSignal.timeout(2000) });
    assert.equal(index.status, 200, "the host still serves");
    assert.equal(await index.text(), "<!doctype html><title>World</title>");
  });
});
