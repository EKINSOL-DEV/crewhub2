/* no-app-reach's three roads of round 58d (round 56's gaps): a child started with an explicit env still carries the
   guard and the real TMPDIR; process.kill reaches only the test's own children; node:sqlite opens only in the test's
   temp folders. Every proof is a decoy of the test's own: a listener it owns, a pid it started (or one no system can
   have), a database path in its temp folder or under a decoy home. No named port, no real process signalled. */
import assert from "node:assert/strict";
import * as cp from "node:child_process";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
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

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
      assert.match(result.stdout, new RegExp(`^real-tmpdir ${escape(process.env.CREWHUB_TEST_REAL_TMPDIR ?? "")}$`, "m"), "the real TMPDIR is handed down too");
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
      assert.match(out, new RegExp(`^real-tmpdir ${escape(process.env.CREWHUB_TEST_REAL_TMPDIR ?? "")}$`, "m"));
    }
  } finally {
    done();
  }
});

/** No process has this pid on Linux (pid_max is at most 2^22 = 4194304) or on macOS (pids end at 99999). */
const NO_SUCH_PID = 2 ** 22 + 1;

test("refusesKill: the test's own process and its own live children; anything else, a process group or signal 0 to another is refused", () => {
  const own = new Set([4242]);
  assert.equal(guard.refusesKill(4242, "SIGTERM", own, 100), null, "a child the test started");
  assert.equal(guard.refusesKill(100, "SIGINT", own, 100), null, "the test's own process");
  assert.equal(guard.refusesKill(100, 0, own, 100), null, "signal 0 to itself");
  assert.match(guard.refusesKill(4243, "SIGTERM", own, 100) ?? "", /pid 4243 is not a live child this test started/);
  assert.match(guard.refusesKill(4243, 0, own, 100) ?? "", /pid 4243 is not a live child this test started \(signal 0\)/, "signal 0 is a signal too");
  assert.match(guard.refusesKill(NO_SUCH_PID, undefined, own, 100) ?? "", /not a live child .*\(signal SIGTERM\)/, "the default signal named");
  for (const pid of [0, -1, -4242]) assert.match(guard.refusesKill(pid, "SIGTERM", own, 100) ?? "", /a process group/, `pid ${pid}`);
  assert.equal(guard.refusesKill("4243" as unknown as number, "SIGTERM", own, 100), null, "not a number: Node refuses it itself");
});

test("process.kill is the guard's (marked), and a child the test starts is its own until it exits", async () => {
  assert.equal((process.kill as unknown as Record<symbol, unknown>)[MARK], true);
  const child = cp.spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
  const pid = child.pid as number;
  assert.ok(guard.OWN_CHILDREN.has(pid), "the child's pid is tracked");
  const exited = new Promise((resolve) => child.once("exit", (_code, signal) => resolve(signal)));
  assert.equal(guard.refusesKill(pid, "SIGTERM"), null, "the rule allows it before the signal is sent");
  process.kill(pid, "SIGTERM");
  assert.equal(await exited, "SIGTERM");
  assert.ok(!guard.OWN_CHILDREN.has(pid), "an exited child is nobody's: its pid may be reused");
  assert.notEqual(guard.refusesKill(pid, "SIGTERM"), null);
});

test("in a child of the test's own (record mode): its own child is signalled; the reaped child's pid and a pid no system has are refused before any signal", async () => {
  const { dir, done } = tempDir();
  try {
    const log = path.join(dir, "reach.log");
    const script = path.join(dir, "kill.mjs");
    fs.writeFileSync(
      script,
      [
        `import { spawn } from "node:child_process";`,
        `import { pathToFileURL } from "node:url";`,
        `const rules = await import(pathToFileURL(${JSON.stringify(GUARD_FILE)}).href);`,
        `const kid = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });`,
        `const exited = new Promise((resolve) => kid.once("exit", (code, signal) => resolve(signal)));`,
        `process.kill(kid.pid, "SIGTERM");`,
        `console.log("own child " + (await exited));`,
        `const tryKill = (pid, signal) => { try { process.kill(pid, signal); return "sent"; } catch (e) { return e.code ?? e.message; } };`,
        // The reaped child's pid may be anybody's by now: tried only when the guard's patch and rule are both in place.
        `if (process.kill[Symbol.for("crewhub-world.no-app-reach")] !== true || rules.refusesKill?.(kid.pid, "SIGTERM") == null) console.log("reaped skipped: no guard to refuse it");`,
        `else console.log("reaped " + tryKill(kid.pid, "SIGTERM"));`,
        `console.log("none " + tryKill(${NO_SUCH_PID}, 0));`,
        `console.log("self " + tryKill(process.pid, 0));`,
      ].join("\n") + "\n",
    );
    const result = await closed(cp.spawn(process.execPath, [script], { env: { ...process.env, CREWHUB_TEST_REACH_LOG: log }, stdio: ["ignore", "pipe", "pipe"] }));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^own child SIGTERM$/m, result.stdout);
    assert.match(result.stdout, /^reaped ESRCH$/m, result.stdout);
    assert.match(result.stdout, /^none ESRCH$/m, result.stdout);
    assert.match(result.stdout, /^self sent$/m, result.stdout);
    const lines = fs.readFileSync(log, "utf8").split("\n");
    assert.equal(lines.filter((l) => / REFUSED kill pid \d+ is not a live child this test started/.test(l)).length, 2, `the reaped pid and the made-up one, refused by the guard (not by the kernel): ${lines.join("\n")}`);
    assert.ok(lines.some((l) => l.includes(`REFUSED kill pid ${NO_SUCH_PID} is not a live child this test started (signal 0)`)), lines.join("\n"));
  } finally {
    done();
  }
});

test("refusesDatabase: :memory: and a path in the test's temp folders pass; elsewhere, and a guarded folder even in a temp folder, are refused", () => {
  const tmp = ["/tmp/run", "/private/tmp/run"];
  const folders = guard.guardedFolders(["/tmp/run/decoy-home"]);
  const refuses = (location: unknown) => guard.refusesDatabase(location, folders, tmp);
  assert.equal(refuses(":memory:"), null);
  assert.equal(refuses(""), null, "an anonymous database SQLite keeps to itself");
  assert.equal(refuses("/tmp/run/chw-x/world.db"), null);
  assert.equal(refuses(Buffer.from("/private/tmp/run/chw-x/world.db")), null);
  assert.equal(refuses(new URL("file:///tmp/run/chw-x/world.db")), null);
  assert.match(refuses("/srv/data/world.db") ?? "", /^\/srv\/data\/world\.db is outside the test's temp folders/);
  assert.match(refuses("/tmp/running/world.db") ?? "", /outside the test's temp folders/, "a sibling folder is not the temp folder");
  assert.match(refuses("relative.db") ?? "", new RegExp(`^${escape(path.resolve("relative.db"))} is outside`), "a relative path is the cwd's");
  assert.match(refuses("/tmp/run/decoy-home/.config/crewhub-world/world.db") ?? "", /crewhub-world/, "a guarded folder is refused even in a temp folder");
  assert.equal(refuses(7), null, "not a path: SQLite's own error");
});

test("node:sqlite's DatabaseSync is the guard's (marked, also as an ES module import); :memory: and the test's temp folder open as before", () => {
  assert.equal((DatabaseSync as unknown as Record<symbol, unknown>)[MARK], true);
  const memory = new DatabaseSync(":memory:");
  assert.deepEqual({ ...memory.prepare("select 1 + 1 as two").get() }, { two: 2 });
  memory.close();
  const { dir, done } = tempDir();
  try {
    const db = new DatabaseSync(path.join(dir, "world.db"));
    db.exec("create table t (x)");
    db.close();
    assert.ok(fs.existsSync(path.join(dir, "world.db")));
    assert.ok(new DatabaseSync(path.join(dir, "world.db"), { readOnly: true }) instanceof DatabaseSync);
  } finally {
    done();
  }
});

test("in a child of the test's own (record mode, its TMPDIR and real TMPDIR two of the test's folders): a database under a decoy home or outside both is refused; in its TMPDIR it opens", async () => {
  const { dir, done } = tempDir();
  try {
    const own = path.join(dir, "tmp");
    const real = path.join(dir, "real");
    const home = path.join(dir, "home");
    for (const d of [own, real, path.join(home, ".config", "crewhub-world"), path.join(dir, "elsewhere")]) fs.mkdirSync(d, { recursive: true });
    const log = path.join(dir, "reach.log");
    const homeDb = path.join(home, ".config", "crewhub-world", "world.db");
    const outside = path.join(dir, "elsewhere", "x.db");
    const script = path.join(dir, "db.mjs");
    fs.writeFileSync(
      script,
      [
        `import { DatabaseSync } from "node:sqlite";`,
        // open: false, so a guard that let these through still creates nothing.
        `const tryOpen = (file) => { try { new DatabaseSync(file, { open: false }); return "made"; } catch (e) { return e.code ?? e.message; } };`,
        `console.log("home " + tryOpen(${JSON.stringify(homeDb)}));`,
        `console.log("outside " + tryOpen(${JSON.stringify(outside)}));`,
        `const ok = new DatabaseSync(${JSON.stringify(path.join(own, "ok.db"))}); ok.exec("create table t (x)"); ok.close();`,
        `console.log("own opened");`,
      ].join("\n") + "\n",
    );
    const env = { ...process.env, CREWHUB_TEST_REACH_LOG: log, CREWHUB_TEST_GUARD_HOME: home, TMPDIR: own, CREWHUB_TEST_REAL_TMPDIR: real };
    const result = await closed(cp.spawn(process.execPath, [script], { env, stdio: ["ignore", "pipe", "pipe"] }));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^home ENOENT$/m, result.stdout);
    assert.match(result.stdout, /^outside ENOENT$/m, result.stdout);
    assert.match(result.stdout, /^own opened$/m, result.stdout);
    const lines = fs.readFileSync(log, "utf8").split("\n");
    assert.ok(lines.some((l) => l.includes(`REFUSED sqlite ${homeDb}`) && /crewhub-world/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => l.includes(`REFUSED sqlite ${outside} is outside the test's temp folders`)), lines.join("\n"));
    assert.ok(!fs.existsSync(homeDb) && !fs.existsSync(outside), "nothing was made where it was refused");
    assert.ok(fs.existsSync(path.join(own, "ok.db")));
  } finally {
    done();
  }
});
