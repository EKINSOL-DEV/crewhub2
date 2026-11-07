/* `npm run loops:fake -- --viewer-key` (round 65, C: the walkthroughs' tooling note "the command-line fake has no
   chat-reading key"): the flag is read, listed by --help, and refused as L-1 refuses when it cannot be meant. The parser's
   other rules are `fakeArgs.test.ts`; the exit codes and the no-start of a refusal are `mainArgs.test.ts` and below. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseFakeArgs } from "../src/fakeArgs.ts";

const USAGE = "Usage: npm run loops:fake -- --port 8391 [--scenario small-team] [--speed 1] [--builder-key] [--viewer-key] [--help]";
const BOTH = "--builder-key and --viewer-key cannot both be given: loops' builder key reads tickets, never the chat";
const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const KEY_FILE = fileURLToPath(new URL("../../../tools/out/loops-fake.key", import.meta.url));

function started(...argv: string[]) {
  const parsed = parseFakeArgs(argv);
  assert.equal(parsed.kind, "start", `${argv.join(" ")} starts`);
  return parsed.kind === "start" ? parsed : null;
}

function refusal(...argv: string[]): string {
  const parsed = parseFakeArgs(argv);
  assert.equal(parsed.kind, "refuse", `${argv.join(" ")} is refused`);
  return parsed.kind === "refuse" ? parsed.text : "";
}

test("--viewer-key is off by default and on wherever it stands", () => {
  assert.equal(started()?.viewerKey, false);
  assert.equal(started("--port", "0")?.viewerKey, false);
  assert.equal(started("--viewer-key")?.viewerKey, true);
  assert.deepEqual(started("--port", "0", "--viewer-key", "--speed", "4"), { kind: "start", port: 0, scenario: "small-team", speed: 4, builderKey: false, viewerKey: true });
  assert.deepEqual(started("--viewer-key", "--scenario", "studio"), { kind: "start", port: 8391, scenario: "studio", speed: 1, builderKey: false, viewerKey: true });
});

test("--help lists --viewer-key as one line, in the usage line too", () => {
  const parsed = parseFakeArgs(["--help"]);
  assert.equal(parsed.kind, "help");
  const lines = parsed.kind === "help" ? parsed.text.split("\n") : [];
  assert.equal(lines[0], USAGE);
  assert.equal(lines.length, 7);
  assert.match(lines[4] ?? "", /^ {2}--builder-key /);
  assert.match(lines[5] ?? "", /^ {2}--viewer-key {6}the key reads the chat.*viewer key.*bubbles/i);
  assert.match(lines[6] ?? "", /^ {2}--help, -h /);
});

test("the two keys together are refused in one sentence, in either order, after the unknown-flag rule and before the port's", () => {
  assert.equal(refusal("--builder-key", "--viewer-key"), BOTH);
  assert.equal(refusal("--viewer-key", "--port", "0", "--builder-key"), BOTH);
  assert.match(refusal("--viewer-key", "--builder-key", "--bogus"), /^"--bogus" /);
  assert.equal(refusal("--viewer-key", "--builder-key", "--port", "abc"), BOTH);
  assert.equal(parseFakeArgs(["--viewer-key", "--builder-key", "--help"]).kind, "help");
});

test("--viewer-key takes no value: a word after it is a stray word, as after --builder-key", () => {
  assert.equal(refusal("--viewer-key", "true"), `"true" is a stray word: the fake takes flags only\n${USAGE}`);
  assert.equal(refusal("--viewer-key=1"), `"--viewer-key=1" is not a flag of the fake\n${USAGE}`);
  assert.equal(refusal("--port", "--viewer-key"), "--port needs a value");
});

/** The key file's state, as `mainArgs.test.ts` watches it: a run that writes or chmods it changes this. */
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

test("main: --help names --viewer-key; the two keys together exit 2 with the one sentence on stderr, without starting", async () => {
  const before = keyFileState();
  const help = await run("--help", "--port", "0");
  assert.equal(help.code, 0, help.stdout.slice(0, 300));
  assert.equal(help.stdout.split("\n")[0], USAGE);
  assert.ok(help.stdout.includes("\n  --viewer-key "), "a line for --viewer-key");
  const both = await run("--viewer-key", "--builder-key", "--port", "0");
  assert.equal(both.code, 2, both.stdout.slice(0, 300));
  assert.equal(both.stdout, "");
  assert.equal(both.stderr, `${BOTH}\n`);
  assert.doesNotMatch(both.stdout, /listening on/);
  assert.deepEqual(keyFileState(), before, "the key file is left alone");
});
