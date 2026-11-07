/* no-app-reach's folders from the real home as well as $HOME, and the real hosts' run files (round 56, r56-guard-home).
   A test that moves HOME is still refused ~/.config/crewhub-world and the rest under the user's own home (getpwuid), and
   no test reads a real host's run file (its mint secret) in the real TMPDIR. Every live proof uses decoys only: a temp
   "home" the guard is told about (CREWHUB_TEST_GUARD_HOME) and a temp "real TMPDIR" (CREWHUB_TEST_REAL_TMPDIR), with
   files the test wrote itself. The real home and TMPDIR appear in pure rule checks only, which open nothing. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as guard from "../no-app-reach.mjs";

const GUARD = fileURLToPath(new URL("../no-app-reach.mjs", import.meta.url));
const MARK = Symbol.for("crewhub-world.no-app-reach");

/** Module code in a child Node that carries the guard and first proves the guard, its fs patch and the rule (`rules`, a
    JS condition over the guard's exports) are in it; else it stops (exit 3) and reads nothing. */
function child(rules: string, code: string, env: Record<string, string>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const first = [
    `const mark = globalThis[Symbol.for("crewhub-world.no-app-reach")];`,
    'if (mark === undefined) { console.error("guard absent"); process.exit(3); }',
    'const guardFs = await import("node:fs");',
    'if (guardFs.default.readFileSync[Symbol.for("crewhub-world.no-app-reach")] !== true) { console.error("the fs patch is absent: nothing read"); process.exit(3); }',
    `const rules = await import(${JSON.stringify(GUARD)});`,
    `if (!(${rules})) { console.error("the rule is absent: nothing read"); process.exit(3); }`,
  ].join("\n");
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, ["--input-type=module", "-e", `${first}\n${code}`], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    proc.on("close", (status) => setImmediate(() => resolve({ status, stdout, stderr })));
  });
}

const logLines = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter((l) => l !== "") : []);

test("the rules: the folders under $HOME, the user's own home and a decoy home are refused; a moved HOME does not move the real one", () => {
  const real = userInfo().homedir;
  assert.ok(guard.GUARDED_HOMES.includes(path.resolve(real)), "the user's own home (getpwuid) is guarded");
  // Pure: what the guard would answer for a test that moved HOME to /tmp/moved. Nothing is opened.
  const homes = guard.guardedHomes({}, "/tmp/moved", real);
  assert.deepEqual(homes, ["/tmp/moved", path.resolve(real)]);
  const folders = guard.guardedFolders(homes);
  assert.match(guard.refusesPath(path.join(real, ".config", "crewhub-world", "loops-key"), folders) ?? "", /crewhub-world/, "the real config folder");
  assert.match(guard.refusesPath(path.join(real, "Library", "Application Support", "be.ekinsol.crewhub", "settings.json"), folders) ?? "", /Mac app's data folder/);
  assert.match(guard.refusesPath(path.join(real, ".config", "crewhub-loops", "secrets", "agent-crewhub-world.key"), folders) ?? "", /crewhub-loops/);
  assert.match(guard.refusesPath("/tmp/moved/.config/crewhub-world/loops-key", folders) ?? "", /crewhub-world/, "and the moved HOME's, as before");
  assert.equal(guard.refusesPath("/tmp/elsewhere/.config/crewhub-world/loops-key", folders), null, "a third folder is nobody's");
  assert.deepEqual(guard.guardedHomes({ CREWHUB_TEST_GUARD_HOME: "/tmp/decoy-home" }, "/h", "/u"), ["/h", "/u", "/tmp/decoy-home"], "a decoy home adds, never replaces");
  assert.deepEqual(guard.guardedHomes({ CREWHUB_TEST_GUARD_HOME: "decoy-home" }, "/h", "/u"), ["/h", "/u"], "a relative decoy is ignored");
  assert.deepEqual(guard.guardedHomes({}, "/same", "/same"), ["/same"], "one home once");
});

test("the rules: a real host's run file in a real TMPDIR is refused; a test's own (port 0 lands at 32768 or up, port 1, a subfolder) is not", () => {
  const tmp = "/tmp/real-tmp";
  assert.equal(guard.isRealRunFile(`${tmp}/crewhub-world-host-5390.json`, [tmp]), true, "a chosen port");
  assert.equal(guard.isRealRunFile(`${tmp}/crewhub-world-host-1024.json`, [tmp]), true);
  assert.equal(guard.isRealRunFile(`${tmp}/crewhub-world-host-32767.json`, [tmp]), true);
  // A test's host listens on port 0: Linux gives 32768-60999, macOS 49152-65535 (round 56b).
  for (const port of [32768, 40000, 49151, 49152, 60999]) assert.equal(guard.isRealRunFile(`${tmp}/crewhub-world-host-${port}.json`, [tmp]), false, `${port}: a test host's port`);
  assert.equal(guard.isRealRunFile(`${tmp}/crewhub-world-host-65001.json`, [tmp]), false);
  assert.equal(guard.isRealRunFile(`${tmp}/crewhub-world-host-1.json`, [tmp]), false, "port 1: runFile.test.ts's 'no host there'");
  assert.equal(guard.isRealRunFile(`${tmp}/crewhub-run-x/crewhub-world-host-5390.json`, [tmp]), false, "a test's own mkdtemp folder");
  assert.equal(guard.isRealRunFile(`${tmp}/crewhub-world-host-5390.json.tmp`, [tmp]), false);
  assert.equal(guard.isRealRunFile("/tmp/other/crewhub-world-host-5390.json", [tmp]), false, "another folder");
  assert.match(guard.refusesPath(`${tmp}/crewhub-world-host-5390.json`, [], [tmp]) ?? "", /real host's run file/);
  // This process's own TMPDIR and the handed-down one are both guarded, as named and resolved.
  const dirs = guard.realTmpDirs({ CREWHUB_TEST_REAL_TMPDIR: "/tmp/first" }, "/tmp/own");
  assert.ok(dirs.includes("/tmp/own") && dirs.includes("/tmp/first"), dirs.join(" "));
  assert.deepEqual(guard.realTmpDirs({ CREWHUB_TEST_REAL_TMPDIR: "relative" }, "/tmp/own").filter((d) => !d.startsWith("/private")), ["/tmp/own"], "a relative one is ignored");
  assert.ok(guard.realTmpDirs().includes(path.resolve(tmpdir())), "this process's TMPDIR");
  assert.ok(typeof process.env.CREWHUB_TEST_REAL_TMPDIR === "string", "the preload hands the real TMPDIR down to children");
});

test("a child that moved HOME is still refused the decoy home's config folder in record mode, and the moved HOME's; it reads none of them", async () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "chw-home-"));
  const log = path.join(dir, "reach.log");
  const decoyHome = path.join(dir, "real-home");
  const moved = path.join(dir, "moved-home");
  const decoyKey = path.join(decoyHome, ".config", "crewhub-world", "loops-key");
  const movedKey = path.join(moved, ".config", "crewhub-world", "loops-key");
  for (const file of [decoyKey, movedKey]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "decoy-key-text\n");
  }
  try {
    const result = await child(
      `rules.refusesPath(${JSON.stringify(decoyKey)}) !== null && rules.refusesPath(${JSON.stringify(movedKey)}) !== null`,
      [
        'import { readFileSync, existsSync } from "node:fs";',
        `for (const [name, file] of [["decoy", ${JSON.stringify(decoyKey)}], ["moved", ${JSON.stringify(movedKey)}]]) {`,
        "  let read; try { read = readFileSync(file, 'utf8').trim(); } catch (e) { read = e.code; }",
        "  console.log(`${name} ${read} exists=${existsSync(file)}`);",
        "}",
      ].join("\n"),
      { CREWHUB_TEST_REACH_LOG: log, HOME: moved, CREWHUB_TEST_GUARD_HOME: decoyHome },
    );
    assert.equal(result.status, 0, `the child: ${result.stderr}`);
    assert.match(result.stdout, /^decoy ENOENT exists=false$/m, result.stdout);
    assert.match(result.stdout, /^moved ENOENT exists=false$/m, result.stdout);
    assert.doesNotMatch(result.stdout, /decoy-key-text/, "a key was read");
    const lines = logLines(log);
    assert.ok(lines.some((l) => l.includes(`REFUSED fs ${decoyKey} is under the default config folder`)), lines.join("\n"));
    assert.ok(lines.some((l) => l.includes(`REFUSED fs ${movedKey} is under the default config folder`)), lines.join("\n"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a child is refused a decoy host's run file in its real TMPDIR, also after it moved TMPDIR; its own run files and subfolders it reads", async () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "chw-runfile-"));
  const log = path.join(dir, "reach.log");
  const realTmp = path.join(dir, "real-tmp");
  const ownTmp = path.join(dir, "own-tmp");
  const theirs = path.join(realTmp, "crewhub-world-host-5390.json");
  const files = { theirs, own: path.join(realTmp, "crewhub-world-host-50123.json"), sub: path.join(realTmp, "crewhub-run-x", "crewhub-world-host-5390.json"), moved: path.join(ownTmp, "crewhub-world-host-65001.json") };
  for (const file of Object.values(files)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"mintSecret":"decoy-secret"}\n');
  }
  try {
    const result = await child(
      `rules.refusesPath(${JSON.stringify(theirs)}) !== null`,
      [
        'import { readFileSync } from "node:fs";',
        `for (const [name, file] of Object.entries(${JSON.stringify(files)})) {`,
        "  let read; try { read = JSON.parse(readFileSync(file, 'utf8')).mintSecret; } catch (e) { read = e.code; }",
        "  console.log(`${name} ${read}`);",
        "}",
      ].join("\n"),
      { CREWHUB_TEST_REACH_LOG: log, CREWHUB_TEST_REAL_TMPDIR: realTmp, TMPDIR: ownTmp },
    );
    assert.equal(result.status, 0, `the child: ${result.stderr}`);
    assert.match(result.stdout, /^theirs ENOENT$/m, result.stdout);
    for (const name of ["own", "sub", "moved"]) assert.match(result.stdout, new RegExp(`^${name} decoy-secret$`, "m"), `${name}: ${result.stdout}`);
    const lines = logLines(log);
    assert.ok(lines.some((l) => l.includes(`REFUSED fs ${theirs} is a real host's run file`)), lines.join("\n"));
    assert.equal(lines.filter((l) => l.includes("REFUSED")).length, 1, lines.join("\n"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("in guard mode a read under a moved HOME's real (decoy) home is loud and fails the process even when swallowed", async () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "chw-home-"));
  const decoyHome = path.join(dir, "real-home");
  const decoyKey = path.join(decoyHome, ".config", "crewhub-world", "loops-key");
  fs.mkdirSync(path.dirname(decoyKey), { recursive: true });
  fs.writeFileSync(decoyKey, "decoy-key-text\n");
  try {
    const result = await child(
      `rules.refusesPath(${JSON.stringify(decoyKey)}) !== null`,
      ['import { readFileSync } from "node:fs";', `try { console.log(readFileSync(${JSON.stringify(decoyKey)}, "utf8").trim()); } catch (e) { console.log(e.message); }`].join("\n"),
      { CREWHUB_TEST_REACH_LOG: "", HOME: path.join(dir, "moved-home"), CREWHUB_TEST_GUARD_HOME: decoyHome },
    );
    assert.equal(result.status, 1, `exit ${result.status}: ${result.stdout} ${result.stderr}`);
    assert.match(result.stdout, /^no-app-reach: a test reached for .*loops-key is under the default config folder/m, result.stdout);
    assert.doesNotMatch(result.stdout, /decoy-key-text/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal((fs.readFileSync as unknown as Record<symbol, unknown>)[MARK], true);
});
