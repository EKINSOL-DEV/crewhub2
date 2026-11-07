/* tools/loops-dev.sh's own folders and ports (round 48, review F7): the data folder may never be the Mac app's (its
   settings.json is the app's port, and `start` writes one) nor inside it, and the port never the app's or 5180. Run with
   a fake HOME and the `env` command, which writes nothing: no real folder is touched, whatever the script does. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "tools", "loops-dev.sh");

test("loops-dev.sh refuses the Mac app's data folder (or inside it) and the ports that are not its own; its own folder passes", () => {
  const home = mkdtempSync(path.join(tmpdir(), "loops-dev-home-"));
  try {
    const checkout = path.join(home, "crewhub-loops-world");
    mkdirSync(path.join(checkout, "services", "api"), { recursive: true });
    const app = path.join(home, "Library", "Application Support", "be.ekinsol.crewhub");
    const run = (env: Record<string, string>) => spawnSync("bash", [SCRIPT, "env"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: home, LOOPS_DEV_CHECKOUT: checkout, LOOPS_DEV_PORT: "8398", ...env } });
    for (const data of [app, `${app}/`, path.join(app, "dev"), path.join(home, "x", "..", "Library", "Application Support", "be.ekinsol.crewhub")]) {
      const out = run({ LOOPS_DEV_DATA: data });
      assert.equal(out.status, 2, `LOOPS_DEV_DATA=${data}: ${out.stdout}${out.stderr}`);
      assert.match(out.stderr, /the Mac app's data folder/);
      if (data === app) mkdirSync(app, { recursive: true }); // the later cases meet a folder that exists, as on a Mac
    }
    const port = run({ LOOPS_DEV_DATA: path.join(home, "crewhub-loops-dev"), LOOPS_DEV_PORT: "5180" });
    assert.equal(port.status, 2, port.stdout + port.stderr);
    assert.match(port.stderr, /5180/);
    const own = run({ LOOPS_DEV_DATA: path.join(home, "crewhub-loops-dev") });
    assert.equal(own.status, 0, own.stderr);
    assert.match(own.stdout, /^CHL_PORT=8398$/m);
    assert.deepEqual(readdirSync(app), [], "nothing was written in the app's folder");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
