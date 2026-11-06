/* Design choice H1 (round 72, `warn`), the start log's line (main.ts): a config folder that exists and is looser than
   0700 is named once at the start, as the doctor warns, and left as it is; a 0700 folder gets no such line. The host is
   started as a child the way mainStart.test.ts does (a folder, key file and loops of the test's own, the port taken by
   the test's own listener so the start ends after the log and before any bind), and the line is read from its stderr. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const MAIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "main.ts");

describe("the host's start log on its own folder (H1, warn)", () => {
  const start = async (mode: number) => {
    const base = mkdtempSync(path.join(tmpdir(), "chw-loose-"));
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", () => resolve()));
    const port = (blocker.address() as { port: number }).port;
    try {
      const own = path.join(base, "own");
      mkdirSync(own, { mode });
      chmodSync(own, mode);
      const keyFile = path.join(base, "agent-crewhub-world.key");
      writeFileSync(keyFile, `chl_${"x".repeat(32)}\n`, { mode: 0o600 });
      // An app data folder of the test's own, naming the test's port: the discovery never looks at the Mac app's.
      const appData = path.join(base, "app-data");
      mkdirSync(appData);
      writeFileSync(path.join(appData, "settings.json"), JSON.stringify({ port }));
      const env = { PATH: process.env.PATH ?? "", NODE_OPTIONS: process.env.NODE_OPTIONS ?? "", CREWHUB_WORLD_CONFIG_DIR: own, CREWHUB_WORLD_LOOPS_APP_DATA: appData, CREWHUB_WORLD_KEY_FILE: keyFile, CREWHUB_WORLD_LOOPS_URL: "http://127.0.0.1:1", CREWHUB_WORLD_PAIRING: "off", CREWHUB_WORLD_PORT: String(port) };
      const out = spawnSync(process.execPath, [MAIN], { encoding: "utf8", env, timeout: 20000 });
      return { own, port, status: out.status, lines: out.stderr.split("\n").filter((l) => l !== ""), modeAfter: statSync(own).mode & 0o777 };
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
      rmSync(base, { recursive: true, force: true });
    }
  };
  const loose = (lines: string[]) => lines.filter((l) => /looser than 0700/.test(l));

  it("names an existing folder looser than 0700 once, after the folder line and before the bind, and leaves its mode", async () => {
    const run = await start(0o750);
    assert.equal(run.status, 1, run.lines.join(" | "));
    const said = loose(run.lines);
    assert.equal(said.length, 1, `once: ${run.lines.join(" | ")}`);
    assert.match(said[0] ?? "", new RegExp(`config folder ${run.own.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")} is mode 0750, looser than 0700: the host leaves it as it is \\(chmod 700 "`));
    const at = run.lines.findIndex((l) => /looser than 0700/.test(l));
    assert.ok(run.lines.findIndex((l) => /config folder/.test(l) && !/looser/.test(l)) < at, `after the folder line: ${run.lines.join(" | ")}`);
    assert.ok(at < run.lines.findIndex((l) => new RegExp(`port ${run.port} on 127\\.0\\.0\\.1 is in use`).test(l)), `before the bind: ${run.lines.join(" | ")}`);
    assert.equal(run.modeAfter, 0o750, "left as it is");
  });

  it("says nothing about a 0700 folder", async () => {
    const run = await start(0o700);
    assert.equal(run.status, 1, run.lines.join(" | "));
    assert.deepEqual(loose(run.lines), [], run.lines.join(" | "));
    assert.equal(run.modeAfter, 0o700);
  });
});
