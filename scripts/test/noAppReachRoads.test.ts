/* no-app-reach's three roads of round 58d (round 56's gaps): a child started with an explicit env still carries the
   guard and the real TMPDIR; process.kill reaches only the test's own children; node:sqlite opens only in the test's
   temp folders. Every proof is a decoy of the test's own: a listener it owns, a pid it started (or one no system can
   have), a database path in its temp folder or under a decoy home. No named port, no real process signalled. */
import assert from "node:assert/strict";
import * as cp from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as guard from "../no-app-reach.mjs";
import { decoyListener } from "./guardDecoy.ts";

const MARK = Symbol.for("crewhub-world.no-app-reach");
const GUARD_FILE = fileURLToPath(new URL("../no-app-reach.mjs", import.meta.url));

/** A temp folder of the test's own, removed at the end. */
function tempDir(): { dir: string; done: () => void } {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "chw-roads-"));
  return { dir, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** The child's script: it says whether the guard is in it and which real TMPDIR it knows, then (when `decoy` is given)
    tries the decoy the parent owns. Written to the test's temp folder and run by process.execPath. */
function childScript(dir: string, decoy: number | null): string {
  const file = path.join(dir, "child.mjs");
  const lines = [
    `const guarded = globalThis[Symbol.for("crewhub-world.no-app-reach")] !== undefined;`,
    `console.log("guard " + (guarded ? "on" : "off"));`,
    `console.log("real-tmpdir " + (process.env.CREWHUB_TEST_REAL_TMPDIR ?? "none"));`,
  ];
  if (decoy !== null)
    lines.push(
      `const { Socket } = await import("node:net");`,
      `await new Promise((resolve) => { const s = new Socket(); s.on("error", (e) => { console.log("net " + e.code); resolve(); }); s.on("connect", () => { console.log("net connected"); s.destroy(); resolve(); }); s.connect({ port: ${decoy}, host: "127.0.0.1" }); });`,
    );
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

/** The env a test hands a child explicitly: no NODE_OPTIONS, no CREWHUB_TEST_REAL_TMPDIR, only what it names. */
const bareEnv = (extra: Record<string, string>) => ({ PATH: process.env.PATH ?? "", ...extra });

const closed = (child: cp.ChildProcess) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr?.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("close", (status) => setImmediate(() => resolve({ status, stdout, stderr })));
  });

test("handDownEnv: an explicit env gets the guard's --import and the real TMPDIR, added and never replaced", () => {
  const parent = { NODE_OPTIONS: `--import "${GUARD_FILE}"`, CREWHUB_TEST_REAL_TMPDIR: "/tmp/real" };
  assert.deepEqual(guard.handDownEnv({ PATH: "/bin" }, parent, GUARD_FILE), { PATH: "/bin", NODE_OPTIONS: `--import ${JSON.stringify(GUARD_FILE)}`, CREWHUB_TEST_REAL_TMPDIR: "/tmp/real" });
  assert.deepEqual(guard.handDownEnv({ NODE_OPTIONS: "--max-old-space-size=64" }, parent, GUARD_FILE).NODE_OPTIONS, `--max-old-space-size=64 --import ${JSON.stringify(GUARD_FILE)}`, "the child's own options stay, the guard is added");
  const already = { NODE_OPTIONS: `--import ${JSON.stringify(GUARD_FILE)}`, CREWHUB_TEST_REAL_TMPDIR: "/tmp/decoy" };
  assert.deepEqual(guard.handDownEnv(already, parent, GUARD_FILE), already, "a child that has both keeps its own (a guard test's decoy TMPDIR stays)");
  assert.equal(guard.handDownEnv({}, {}, GUARD_FILE).CREWHUB_TEST_REAL_TMPDIR, undefined, "nothing to hand down: nothing made up");
});

test("guardedArgs: the options of every child_process form get the handed-down env; the caller's object is not changed", () => {
  const env = { PATH: "/bin" };
  const options = { env, cwd: "/tmp" };
  const cb = () => undefined;
  const handed = (args: unknown[]) => guard.guardedArgs(args) as unknown[];
  for (const args of [["node", ["a.mjs"], options], ["node a.mjs", options, cb], ["a.mjs", [], options, cb], ["node", undefined, options]] as unknown[][]) {
    const out = handed(args);
    const at = args.indexOf(options);
    const given = out[at] as { env: Record<string, string>; cwd: string };
    assert.notEqual(given, options, "a new options object");
    assert.equal(given.cwd, "/tmp");
    assert.match(given.env.NODE_OPTIONS ?? "", /no-app-reach\.mjs/);
    assert.equal(out.length, args.length);
    if (args.includes(cb)) assert.equal(out[out.length - 1], cb, "the callback stays where it was");
  }
  assert.deepEqual(options, { env: { PATH: "/bin" }, cwd: "/tmp" }, "the caller's options are as they were");
  const plain = ["node", ["a.mjs"], { cwd: "/tmp" }];
  assert.equal(handed(plain), plain, "no env given: the child inherits process.env, which has the guard already");
  const bare = ["node"];
  assert.equal(handed(bare), bare, "no options at all: the same");
});

test("the child_process functions are the guard's (marked), here and as ES module imports", () => {
  for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const) assert.equal((cp[name] as unknown as Record<symbol, unknown>)[MARK], true, `child_process.${name}`);
});

for (const form of ["spawn", "execFile", "exec", "fork"] as const) {
  test(`a child started by ${form} with an env that drops NODE_OPTIONS still carries the guard: its connect to the parent's decoy is refused`, async () => {
    const { dir, done } = tempDir();
    const decoy = await decoyListener();
    try {
      const log = path.join(dir, "reach.log");
      const script = childScript(dir, decoy.port);
      const env = bareEnv({ CREWHUB_TEST_GUARD_DECOY: String(decoy.port), CREWHUB_TEST_REACH_LOG: log });
      const child =
        form === "spawn"
          ? cp.spawn(process.execPath, [script], { env, stdio: ["ignore", "pipe", "pipe"] })
          : form === "execFile"
            ? cp.execFile(process.execPath, [script], { env })
            : form === "exec"
              ? cp.exec(`"${process.execPath}" "${script}"`, { env })
              : cp.fork(script, [], { env, execArgv: [], stdio: ["ignore", "pipe", "pipe", "ipc"] });
      const result = await closed(child);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^guard on$/m, result.stdout);
      assert.match(result.stdout, new RegExp(`^real-tmpdir ${process.env.CREWHUB_TEST_REAL_TMPDIR}$`, "m"), "the real TMPDIR is handed down too");
      assert.match(result.stdout, /^net ECONNREFUSED$/m, result.stdout);
      assert.equal(decoy.hits(), 0, "the decoy's own listener was reached");
    } finally {
      await decoy.close();
      done();
    }
  });
}

test("a child started by spawnSync, execFileSync or execSync with a bare env carries the guard and the real TMPDIR too", () => {
  const { dir, done } = tempDir();
  try {
    const script = childScript(dir, null);
    const env = bareEnv({});
    const outs = [
      cp.spawnSync(process.execPath, [script], { env, encoding: "utf8" }).stdout,
      cp.execFileSync(process.execPath, [script], { env, encoding: "utf8" }),
      cp.execSync(`"${process.execPath}" "${script}"`, { env, encoding: "utf8" }),
    ];
    for (const out of outs) {
      assert.match(out, /^guard on$/m, out);
      assert.match(out, new RegExp(`^real-tmpdir ${process.env.CREWHUB_TEST_REAL_TMPDIR}$`, "m"));
    }
  } finally {
    done();
  }
});
