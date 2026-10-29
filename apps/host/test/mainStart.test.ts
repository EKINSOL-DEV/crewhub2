/* `node apps/host/src/main.ts` when it cannot start (round 48, review F16): the reason in one line, never a bare
   "configuration failed" and never a stack. The host is spawned with a folder, key file and loops of the test's own. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const MAIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "main.ts");

describe("the host's start, when it cannot", () => {
  const start = async (env: Record<string, string>) => {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-main-"));
    try {
      const keyFile = path.join(dir, "agent-crewhub-world.key");
      writeFileSync(keyFile, `chl_${"x".repeat(32)}\n`, { mode: 0o600 });
      const base = { PATH: process.env.PATH ?? "", NODE_OPTIONS: process.env.NODE_OPTIONS ?? "", CREWHUB_WORLD_CONFIG_DIR: dir, CREWHUB_WORLD_KEY_FILE: keyFile, CREWHUB_WORLD_LOOPS_URL: "http://127.0.0.1:1", CREWHUB_WORLD_PAIRING: "off", CREWHUB_WORLD_PORT: "0" };
      return spawnSync(process.execPath, [MAIN], { encoding: "utf8", env: { ...base, ...env }, timeout: 20000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("says why the configuration failed when the error is not one of its own words (a URL that does not parse)", async () => {
    const out = await start({ CREWHUB_WORLD_LOOPS_URL: "http://" });
    assert.equal(out.status, 1, out.stderr);
    assert.match(out.stderr, /configuration failed: Invalid URL/);
  });

  it("says in one line that the port is in use, without a stack", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", () => resolve()));
    const port = (blocker.address() as { port: number }).port;
    try {
      const out = await start({ CREWHUB_WORLD_PORT: String(port) });
      assert.equal(out.status, 1, out.stderr);
      assert.match(out.stderr, new RegExp(`port ${port} on 127\\.0\\.0\\.1 is in use`));
      assert.doesNotMatch(out.stderr, /^\s+at /m, "no stack");
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
