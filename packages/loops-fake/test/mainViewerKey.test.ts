/* `npm run loops:fake -- --viewer-key`, run for real (round 65, C, m1's review): the flag reaches the fake, so the key the
   command line hands out reads the chat, and without the flag it does not. `viewerKeyArgs.test.ts` holds the parser and
   the listening line says only what was parsed, so without this a main that dropped the option would still say "viewer
   key". Every run has `--port 0` and a key file of its own (`LOOPS_FAKE_KEY_FILE`): a start writes and chmods its key
   file, and `mainArgs.test.ts` watches the default one in parallel. A run waits for what main prints; its ceiling only
   ends a broken run. */
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type TestContext, test } from "node:test";
import { fakeKeyFileVerdict } from "../src/fakeArgs.ts";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const DEFAULT_KEY_FILE = fileURLToPath(new URL("../../../tools/out/loops-fake.key", import.meta.url));
const CEILING_MS = 30_000;

function defaultKeyFileState(): { mtimeMs: number; ctimeMs: number } | null {
  const stat = statSync(DEFAULT_KEY_FILE, { throwIfNoEntry: false });
  return stat === undefined ? null : { mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
}

/** Starts main with `args` and its own key file; answers once main has printed the key file's line, the last it needs. */
async function started(t: TestContext, ...args: string[]): Promise<{ url: string; key: string; firstLine: string; keyFile: string }> {
  const folder = mkdtempSync(path.join(tmpdir(), "loops-fake-main-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const keyFile = path.join(folder, "the.key");
  const child: ChildProcess = spawn(process.execPath, [MAIN, "--port", "0", "--speed", "0", ...args], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LOOPS_FAKE_KEY_FILE: keyFile } });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = new Promise((resolve) => child.once("close", resolve));
    child.kill("SIGTERM");
    await closed;
  });
  let out = "";
  child.stderr?.on("data", (chunk: Buffer) => (out += chunk.toString()));
  await new Promise<void>((resolve, reject) => {
    const ceiling = setTimeout(() => reject(new Error(`main printed no key file line: ${out.slice(0, 400)}`)), CEILING_MS);
    child.once("close", (code) => {
      clearTimeout(ceiling);
      reject(new Error(`main ended with ${code}: ${out.slice(0, 400)}`));
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes("Start the host against it with:")) {
        clearTimeout(ceiling);
        resolve();
      }
    });
  });
  const url = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(out)?.[1];
  assert.ok(url !== undefined, out.slice(0, 400));
  return { url, key: readFileSync(keyFile, "utf8").trim(), firstLine: out.split("\n")[0] ?? "", keyFile };
}

async function viewerWord(fake: { url: string; key: string }): Promise<unknown> {
  const res = await fetch(`${fake.url}/api/agents`, { headers: { authorization: `Bearer ${fake.key}` } });
  const body = (await res.json()) as { agents: { id: string; viewer?: unknown }[] };
  assert.equal(res.status, 200);
  return body.agents.find((agent) => agent.id === "crewhub-world")?.viewer;
}

async function messagesStatus(fake: { url: string; key: string }): Promise<number> {
  const res = await fetch(`${fake.url}/api/dm/threads/g-man/messages`, { headers: { authorization: `Bearer ${fake.key}` } });
  await res.text();
  return res.status;
}

test("main --viewer-key: the key it hands out reads the chat, and /agents names it a viewer", async (t) => {
  const before = defaultKeyFileState();
  const fake = await started(t, "--viewer-key");
  assert.match(fake.firstLine, /viewer key: reads the chat/);
  assert.equal(await viewerWord(fake), true);
  assert.equal(await messagesStatus(fake), 200);
  assert.equal(statSync(fake.keyFile).mode & 0o777, 0o600, "the key file of its own is 0600 too");
  assert.deepEqual(defaultKeyFileState(), before, "the default key file is left alone");
});

test("main without the flag: the same fake's key reads no chat, as a plain external bot's", async (t) => {
  const fake = await started(t);
  assert.doesNotMatch(fake.firstLine, /viewer key/);
  assert.equal(await viewerWord(fake), undefined);
  assert.equal(await messagesStatus(fake), 403);
});

/* The key file seam is for a test: the plain command has no preload to guard it, and a start reads, chmods and may write
   the file it names. So a path outside the temp folder is refused as a bad flag is. The decoys are under the repo's
   git-ignored tools/out, in a folder of this test's own; nothing here names a real folder. */
const TOOLS_OUT = fileURLToPath(new URL("../../../tools/out/", import.meta.url));

function decoyFolder(t: TestContext): string {
  mkdirSync(TOOLS_OUT, { recursive: true });
  const folder = mkdtempSync(path.join(TOOLS_OUT, "key-file-decoy-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
}

/** Runs main to its end; a main that starts anyway is ended at its listening line, and the words say it started. */
async function runToEnd(keyFile: string, cwd: string, ...args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [MAIN, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LOOPS_FAKE_KEY_FILE: keyFile } });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
    if (stdout.includes("Start the host against it with:")) child.kill("SIGKILL");
  });
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  const ceiling = setTimeout(() => child.kill("SIGKILL"), CEILING_MS);
  const code = await new Promise<number | null>((resolve) => child.once("close", (c) => resolve(c)));
  clearTimeout(ceiling);
  return { code, stdout, stderr };
}

test("main refuses a key file outside the temp folder: one sentence, exit 2, no start, nothing made", async (t) => {
  const folder = decoyFolder(t);
  const missing = path.join(folder, "new", "folders", "the.key");
  const { code, stdout, stderr } = await runToEnd(missing, folder, "--port", "0");
  assert.equal(stdout, "");
  assert.equal(code, 2, stderr.slice(0, 200));
  assert.equal(stderr.trimEnd().split("\n").length, 1, stderr);
  assert.match(stderr, /^LOOPS_FAKE_KEY_FILE .*outside the temp folder/);
  assert.equal(existsSync(path.join(folder, "new")), false, "no folder made");
});

test("main refuses an existing file outside the temp folder: its words and its mode stay, an empty one is not filled", async (t) => {
  const folder = decoyFolder(t);
  for (const words of ["not a key\n", ""]) {
    const file = path.join(folder, `file-${words.length}`);
    writeFileSync(file, words, { mode: 0o644 });
    const { code, stdout } = await runToEnd(file, folder, "--port", "0");
    assert.equal(stdout, "");
    assert.equal(code, 2);
    assert.equal(readFileSync(file, "utf8"), words);
    assert.equal(statSync(file).mode & 0o777, 0o644);
  }
});

test("main refuses a relative path that lands outside the temp folder", async (t) => {
  const folder = decoyFolder(t);
  const { code, stdout } = await runToEnd("relative.key", folder, "--port", "0");
  assert.equal(stdout, "");
  assert.equal(code, 2);
  assert.equal(existsSync(path.join(folder, "relative.key")), false);
});

test("the arguments are read first: --help still answers, a bad flag is still the first refusal", async (t) => {
  const folder = decoyFolder(t);
  const outside = path.join(folder, "the.key");
  const help = await runToEnd(outside, folder, "--help", "--port", "0");
  assert.equal(help.code, 0);
  assert.match(help.stdout, /^Usage: /);
  const flag = await runToEnd(outside, folder, "--bogus", "--port", "0");
  assert.equal(flag.code, 2);
  assert.match(flag.stderr, /^"--bogus" /);
  assert.equal(existsSync(outside), false);
});

test("fakeKeyFileVerdict: inside the temp folder only, by the resolved path; unset or empty is the default", () => {
  const temp = path.join(path.sep, "some", "temp");
  assert.deepEqual(fakeKeyFileVerdict(undefined, temp), { ok: true, file: null });
  assert.deepEqual(fakeKeyFileVerdict("", temp), { ok: true, file: null });
  const inside = path.join(temp, "a", "the.key");
  assert.deepEqual(fakeKeyFileVerdict(inside, temp), { ok: true, file: inside });
  for (const outside of [temp, `${temp}-sibling${path.sep}the.key`, path.join(temp, "..", "the.key"), `${temp}${path.sep}..${path.sep}..${path.sep}the.key`, path.join(path.sep, "elsewhere", "the.key"), "relative.key"]) {
    const verdict = fakeKeyFileVerdict(outside, temp);
    assert.equal(verdict.ok, false, outside);
  }
});
