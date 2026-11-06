/* Design choice P1 (`fail`, round 72): a perf.mjs run with a FAILED line exits 1, so a script or CI that runs it sees the
   failure; before, every run ended with exit 0 whatever failed. The exit path is run for real: the tool against a port
   nobody listens on (a free one, taken and released here; never a named port), its one scenario `demo-town`, whose page
   open is refused at once, so the scenario prints "demo-town FAILED: …" and the run ends. The browser is launched (a
   few seconds), nothing is served, and the tool writes nothing (no --json). */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A port nobody listens on: taken from the system for a moment and given back. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

test("P1 (fail): a run with a FAILED line exits 1", { timeout: 120_000 }, async () => {
  const port = await freePort();
  const run = spawnSync(process.execPath, ["tools/perf.mjs", "--port", String(port), "demo-town"], { cwd: REPO, encoding: "utf8", timeout: 100_000, env: { ...process.env, NODE_OPTIONS: "" } });
  const out = `${run.stdout}\n${run.stderr}`;
  assert.match(out, /^demo-town\s+FAILED: /m, out.slice(-600));
  assert.equal(run.status, 1, `exit ${run.status}, signal ${run.signal}: ${out.slice(-300)}`);
});
