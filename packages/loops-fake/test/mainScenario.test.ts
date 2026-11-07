/* `npm run loops:fake -- --scenario`: an unknown id is refused with the known ids and exit 2 (round 54, r54-review), not
   taken silently as small-team; --speed refused a bad value already. The fake never starts, so no port and no key file. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { SCENARIO_IDS } from "@crewhub/demo";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));

test("an unknown --scenario stops the fake before it starts: exit 2, and the known ids named", async () => {
  const child = spawn(process.execPath, [MAIN, "--port", "0", "--scenario", "smal-team"], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (out += chunk.toString()));
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  const code = await new Promise<number | null>((resolve) => child.on("exit", (c) => resolve(c)));
  clearTimeout(timer);
  assert.equal(code, 2, out.slice(0, 300));
  assert.match(out, /--scenario smal-team/);
  for (const id of SCENARIO_IDS) assert.ok(out.includes(id), `names ${id}`);
  assert.doesNotMatch(out, /listening on/);
});
