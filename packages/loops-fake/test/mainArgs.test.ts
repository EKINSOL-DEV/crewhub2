/* `npm run loops:fake`'s own command line, run for real (round 64, L-1): `--help` answers and an unknown flag or a stray
   word is refused, and neither starts the fake. The old main ignored them and listened, on 8391 when no --port came.
   Every run here passes `--port 0`, so that a main which does start takes a free port and never that one; the 10 s timer
   ends it. The parser's rules are `fakeArgs.test.ts`; this file holds the exit codes, the streams and the no-start. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const KEY_FILE = fileURLToPath(new URL("../../../tools/out/loops-fake.key", import.meta.url));
const USAGE_LINE = "npm run loops:fake -- --port 8391 [--scenario small-team] [--speed 1] [--builder-key] [--help]";

/** The key file's state: a run that writes it or chmods it changes this (a chmod moves the ctime, even to the same mode). */
function keyFileState(): { mtimeMs: number; ctimeMs: number } | null {
  const stat = statSync(KEY_FILE, { throwIfNoEntry: false });
  return stat === undefined ? null : { mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
}

async function run(...args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [MAIN, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  const code = await new Promise<number | null>((resolve) => child.on("close", (c) => resolve(c)));
  clearTimeout(timer);
  return { code, stdout, stderr };
}

for (const args of [
  ["--help", "--port", "0"],
  ["--port", "0", "--help"],
  ["-h", "--port", "0"],
]) {
  test(`${args.join(" ")} prints the usage to stdout and exits 0, without starting`, async () => {
    const before = keyFileState();
    const { code, stdout, stderr } = await run(...args);
    assert.equal(code, 0, stdout.slice(0, 300));
    assert.equal(stdout.split("\n")[0], `Usage: ${USAGE_LINE}`);
    for (const option of ["--port <port>", "--scenario <id>", "--speed <n>", "--builder-key", "--help, -h"]) assert.ok(stdout.includes(`\n  ${option}`), `a line for ${option}`);
    assert.equal(stderr, "");
    assert.doesNotMatch(stdout, /listening on/);
    assert.deepEqual(keyFileState(), before, "the key file is left alone");
  });
}

for (const { args, named } of [
  { args: ["--bogus", "--port", "0"], named: '"--bogus"' },
  { args: ["--prot", "5386", "--port", "0"], named: '"--prot"' },
  { args: ["--port=5386", "--port", "0"], named: '"--port=5386"' },
  { args: ["-p", "--port", "0"], named: '"-p"' },
  { args: ["stray", "--port", "0"], named: '"stray"' },
  { args: ["--port", "0", "5386"], named: '"5386"' },
]) {
  test(`${args.join(" ")} is refused with exit 2, naming ${named} and the usage line on stderr, without starting`, async () => {
    const before = keyFileState();
    const { code, stdout, stderr } = await run(...args);
    assert.equal(code, 2, stdout.slice(0, 300));
    assert.equal(stdout, "");
    const lines = stderr.trimEnd().split("\n");
    assert.equal(lines.length, 2, stderr);
    assert.ok(lines[0]?.includes(named), lines[0]);
    assert.equal(lines[1], `Usage: ${USAGE_LINE}`);
    assert.deepEqual(keyFileState(), before, "the key file is left alone");
  });
}

test("a bad value is one sentence with exit 2, as the scenario's refusal is, not a stack trace", async () => {
  const before = keyFileState();
  const { code, stdout, stderr } = await run("--port", "0", "--speed", "3");
  assert.equal(code, 2, stdout.slice(0, 300));
  assert.equal(stdout, "");
  assert.equal(stderr, "--speed must be one of 0, 1, 4, 16\n");
  assert.deepEqual(keyFileState(), before, "the key file is left alone");
});
