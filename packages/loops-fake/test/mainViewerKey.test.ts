/* `npm run loops:fake -- --viewer-key`, run for real (round 65, C, m1's review): the flag reaches the fake, so the key the
   command line hands out reads the chat, and without the flag it does not. `viewerKeyArgs.test.ts` holds the parser and
   the listening line says only what was parsed, so without this a main that dropped the option would still say "viewer
   key". Every run has `--port 0` and a key file of its own (`LOOPS_FAKE_KEY_FILE`): a start writes and chmods its key
   file, and `mainArgs.test.ts` watches the default one in parallel. A run waits for what main prints; its ceiling only
   ends a broken run. */
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type TestContext, test } from "node:test";

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
