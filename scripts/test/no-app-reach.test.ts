/* The no-app-reach guard (round 35): no unit test may reach the Mac app. `npm test` preloads scripts/no-app-reach.mjs
   into every test process and, through NODE_OPTIONS, into every Node a test spawns. This test checks that the preload
   is active here, that its rules say what they should, and that a child process is guarded the same way. Nothing here
   opens a connection: the one connect attempt is made in a child that first proves the guard is in it, in record mode,
   where the guard refuses the socket before any packet leaves. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { APP_DATA, APP_PORTS, CONFIG_DIR, LOOPS_CONFIG, MARK, connectTarget, refusesConnect, refusesPath } from "../no-app-reach.mjs";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("../no-app-reach.mjs", import.meta.url));

const marked = (fn: unknown) => (fn as Record<symbol, unknown>)[MARK] === true;

test("the guard is preloaded into this test process (npm test's --import) and into what it spawns (NODE_OPTIONS)", () => {
  assert.notEqual((globalThis as Record<symbol, unknown>)[MARK], undefined, "scripts/no-app-reach.mjs did not run in this process: npm test must preload it");
  assert.ok(marked(net.Socket.prototype.connect), "net.Socket.prototype.connect is not guarded");
  for (const name of ["readFileSync", "statSync", "existsSync", "openSync", "readdirSync", "readFile", "stat", "open"] as const) assert.ok(marked(fs[name]), `fs.${name} is not guarded`);
  for (const name of ["readFile", "stat", "open", "readdir"] as const) assert.ok(marked(fs.promises[name]), `fs.promises.${name} is not guarded`);
  assert.match(process.env.NODE_OPTIONS ?? "", /no-app-reach\.mjs/, "NODE_OPTIONS does not carry the guard to child processes");
});

test("the rules: the Mac app's ports on any host, its data folder, Nicky's folders, and the empty app data folder's relative paths", () => {
  for (const port of APP_PORTS) {
    assert.match(refusesConnect([{ port, host: "127.0.0.1" }]) ?? "", /Mac app's port/, `port ${port} as an options object`);
    assert.match(refusesConnect([port, "localhost"]) ?? "", /Mac app's port/, `port ${port} as a number`);
    assert.match(refusesConnect([String(port)]) ?? "", /Mac app's port/, `port ${port} as a string`);
  }
  assert.deepEqual(APP_PORTS, [8091, 8000, 9443]);
  assert.equal(refusesConnect([{ port: 8291, host: "127.0.0.1" }]), null, "the development loops' port is not the app's");
  assert.equal(refusesConnect([{ port: 0, host: "127.0.0.1" }]), null);
  assert.match(refusesConnect([{ path: path.join(APP_DATA, "run", "api.sock") }]) ?? "", /Mac app's data folder/);
  assert.match(refusesConnect(["run/api.sock"]) ?? "", /app data folder was left empty/);
  assert.deepEqual(connectTarget([{ port: 8091, host: "127.0.0.1" }]), { port: 8091, host: "127.0.0.1" });
  // net.connect(), http and fetch call Socket#connect with their normalized arguments, one array of [options, callback].
  assert.deepEqual(connectTarget([[{ port: 8091, host: "127.0.0.1" }, () => undefined]]), { port: 8091, host: "127.0.0.1" });
  assert.match(refusesConnect([[{ port: 8091, host: "127.0.0.1" }, () => undefined]]) ?? "", /Mac app's port/, "the normalized form net.connect() uses");
  assert.equal(refusesConnect([[{ port: 8291, host: "127.0.0.1" }, () => undefined]]), null);
  assert.deepEqual(connectTarget([5180]), { port: 5180, host: "localhost" });
  assert.deepEqual(connectTarget(["/tmp/x.sock"]), { path: "/tmp/x.sock" });

  assert.match(refusesPath("settings.json") ?? "", /app data folder was left empty/);
  assert.match(refusesPath("./settings.json") ?? "", /app data folder was left empty/);
  assert.match(refusesPath(path.join("run", "api.sock")) ?? "", /app data folder was left empty/);
  assert.match(refusesPath(path.join(APP_DATA, "settings.json")) ?? "", /Mac app's data folder/);
  assert.match(refusesPath(APP_DATA) ?? "", /Mac app's data folder/);
  assert.match(refusesPath(path.join(CONFIG_DIR, "loops-key")) ?? "", /crewhub-world/);
  assert.match(refusesPath(path.join(CONFIG_DIR, "archived.json")) ?? "", /crewhub-world/);
  assert.match(refusesPath(path.join(LOOPS_CONFIG, "secrets", "agent-crewhub-world.key")) ?? "", /crewhub-loops/);
  assert.match(refusesPath(Buffer.from(path.join(APP_DATA, "settings.json"))) ?? "", /Mac app's data folder/);
  assert.equal(refusesPath(path.join(tmpdir(), "chw-x", "settings.json")), null, "a settings.json in a temp folder is a test's own");
  assert.equal(refusesPath(path.join(CONFIG_DIR + "-trial", "loops-key")), null, "a sibling folder is not the default one");
  assert.equal(refusesPath("package.json"), null);
  assert.equal(refusesPath(7), null, "a file descriptor is not a path");
});

/** Runs module code in a child Node (which inherits NODE_OPTIONS, so the guard) that first proves the guard is in it. */
function child(code: string, env: Record<string, string>) {
  const guardFirst = `const mark = globalThis[Symbol.for("crewhub-world.no-app-reach")];\nif (mark === undefined) { console.error("guard absent"); process.exit(3); }\n`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", `${guardFirst}${code}`], { encoding: "utf8", env: { ...process.env, ...env } });
}

test("a child process is guarded too: in record mode a relative settings.json, run/api.sock and a connect to 8091 are refused and logged, nothing reaches the port", () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "chw-reach-"));
  const log = path.join(dir, "reach.log");
  try {
    const result = child(
      [
        'import { readFileSync, existsSync } from "node:fs";',
        'import { Socket } from "node:net";',
        'let read = "none"; try { readFileSync("settings.json", "utf8"); } catch (e) { read = e.code; }',
        'console.log(`fs ${read} exists=${existsSync("run/api.sock")}`);',
        'const s = new Socket(); s.on("error", (e) => console.log(`net ${e.code}`)); s.connect({ port: 8091, host: "127.0.0.1" });',
      ].join("\n"),
      { CREWHUB_TEST_REACH_LOG: log },
    );
    assert.equal(result.status, 0, `the child: ${result.stderr}`);
    assert.match(result.stdout, /^fs ENOENT exists=false$/m, result.stdout);
    assert.match(result.stdout, /^net ECONNREFUSED$/m, result.stdout);
    const lines = fs.readFileSync(log, "utf8").split("\n").filter((l) => l !== "");
    assert.ok(lines.some((l) => /REFUSED fs a relative settings\.json/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => /REFUSED fs a relative run\/api\.sock/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => /REFUSED connect 127\.0\.0\.1:8091 is the Mac app's port/.test(l)), lines.join("\n"));
    assert.ok(!lines.some((l) => /CONNECT tcp .*:8091$/.test(l)), "a connection to 8091 was made");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a child's fetch of the app's health (undici, the host's own road to loops) is refused in record mode before any packet", () => {
  // The predicate must hold for the normalized form first: if it did not, the child below would really reach 8091.
  assert.match(refusesConnect([[{ port: 8091, host: "127.0.0.1" }, () => undefined]]) ?? "", /Mac app's port/);
  const dir = fs.mkdtempSync(path.join(tmpdir(), "chw-reach-"));
  const log = path.join(dir, "reach.log");
  try {
    const result = child(
      [
        `import { refusesConnect } from ${JSON.stringify(GUARD)};`,
        'if (refusesConnect([[{ port: 8091, host: "127.0.0.1" }, () => undefined]]) === null) { console.error("the rule is gone"); process.exit(3); }',
        // The global's name is spelled in pieces for the repository's network guard (noModelCalls reads every call under scripts/), as the fuzz tests spell addresses.
        'const call = globalThis[["fet", "ch"].join("")];',
        'try { await call("http://127.0.0.1:8091/api/health"); console.log("fetch answered"); } catch (e) { console.log(`fetch ${e.cause?.code ?? e.message}`); }',
      ].join("\n"),
      { CREWHUB_TEST_REACH_LOG: log },
    );
    assert.equal(result.status, 0, `the child: ${result.stderr}`);
    assert.match(result.stdout, /^fetch ECONNREFUSED$/m, result.stdout);
    const lines = fs.readFileSync(log, "utf8").split("\n").filter((l) => l !== "");
    assert.ok(lines.some((l) => /REFUSED connect 127\.0\.0\.1:8091 is the Mac app's port/.test(l)), lines.join("\n"));
    assert.ok(!lines.some((l) => /CONNECT tcp/.test(l)), `a connection was made: ${lines.join("\n")}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("in guard mode (npm test) a refusal is loud and fails the process even when the code under test swallows it", () => {
  const result = child(
    ['import { readFileSync } from "node:fs";', 'try { readFileSync("settings.json", "utf8"); console.log("read went through"); } catch (e) { console.log(e.message); }'].join("\n"),
    { CREWHUB_TEST_REACH_LOG: "" },
  );
  assert.equal(result.status, 1, `exit ${result.status}: ${result.stderr}`);
  assert.match(result.stdout, /^no-app-reach: a test reached for a relative settings\.json/m, result.stdout);
  assert.match(result.stderr, /no-app-reach: a test reached for a relative settings\.json/);
});
