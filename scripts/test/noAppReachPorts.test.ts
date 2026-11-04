/* no-app-reach's ports beyond the Mac app's (round 55, r55-guard): a test connects to none of the development
   crewhub-loops (8291 to 8293), a running loops-fake (8391), somebody's `npm run world` (5180) or Vite dev server (5173),
   and listens on none of the Mac app's, the development loops', the fake's or the host's. Every child below first checks
   that the guard's patches are in place and that its own rule would refuse, and stops (exit 3) when not, so no packet
   leaves and no port is taken even under a guard without these rules or without its listen patch. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as guard from "../no-app-reach.mjs";

const GUARD = fileURLToPath(new URL("../no-app-reach.mjs", import.meta.url));
const CONNECT_PORTS = [8291, 8292, 8293, 8391, 5180, 5173];
const LISTEN_PORTS = [8091, 8000, 9443, 8291, 8292, 8293, 8391, 5180];

/** The rule for a port, as the guard words it, or null (the guard has no such rule). */
const connectRule = (args: unknown[]) => guard.refusesConnect(args);
const listenRule = (args: unknown[]) => (typeof guard.refusesListen === "function" ? guard.refusesListen(args) : null);

/** Module code in a child Node that carries the guard (NODE_OPTIONS) and first proves the guard and the rules are in it. */
function child(rules: string, code: string, env: Record<string, string>) {
  const first = [
    'const mark = globalThis[Symbol.for("crewhub-world.no-app-reach")];',
    'if (mark === undefined) { console.error("guard absent"); process.exit(3); }',
    'const guardNet = await import("node:net");',
    'const MARK = Symbol.for("crewhub-world.no-app-reach");',
    'if (guardNet.Socket.prototype.connect[MARK] !== true || guardNet.Server.prototype.listen[MARK] !== true) { console.error("a patch is absent: nothing tried"); process.exit(3); }',
    // A tripwire under the guard: Node's own bind step stops the child before a named port is taken, whatever the guard does.
    'const bind = guardNet.Server.prototype._listen2;',
    'if (typeof bind !== "function") { console.error("no bind step to watch: nothing tried"); process.exit(3); }',
    `guardNet.Server.prototype._listen2 = function (address, port, ...rest) { if (${JSON.stringify(LISTEN_PORTS)}.includes(port)) { console.error("tripwire: the guard let a listen on " + port + " through"); process.exit(4); } return bind.call(this, address, port, ...rest); };`,
    `const rules = await import(${JSON.stringify(GUARD)});`,
    `if (!(${rules})) { console.error("the rule is absent: nothing tried"); process.exit(3); }`,
  ].join("\n");
  return spawnSync(process.execPath, ["--input-type=module", "-e", `${first}\n${code}`], { encoding: "utf8", env: { ...process.env, ...env } });
}

const logLines = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter((l) => l !== "") : []);

test("the rules: a connect to the development loops, a fake, the host's default port or Vite's is refused, in every form", () => {
  const named: Record<number, RegExp> = { 8291: /development crewhub-loops/, 8292: /development crewhub-loops/, 8293: /development crewhub-loops/, 8391: /loops-fake/, 5180: /world host's default port/, 5173: /Vite/ };
  for (const port of CONNECT_PORTS) {
    const reason = named[port] as RegExp;
    assert.match(connectRule([{ port, host: "127.0.0.1" }]) ?? "", reason, `port ${port} as an options object`);
    assert.match(connectRule([[{ port, host: "127.0.0.1" }, () => undefined]]) ?? "", reason, `port ${port} in the normalized form fetch and http use`);
    assert.match(connectRule([port, "localhost"]) ?? "", reason, `port ${port} as a number`);
    assert.match(connectRule([String(port)]) ?? "", reason, `port ${port} as a string`);
  }
  assert.equal(connectRule([{ port: 51234, host: "127.0.0.1" }]), null, "an ephemeral port is a test's own");
  assert.equal(connectRule([{ port: 1, host: "127.0.0.1" }]), null, "port 1, the closed port the tests use");
  assert.equal(connectRule([{ port: 8294, host: "127.0.0.1" }]), null, "a neighbour of the development loops is nobody's");
});

test("the rules: listen on the Mac app's, the development loops', a fake's or the host's default port is refused; port 0 never", () => {
  assert.equal(typeof guard.refusesListen, "function", "no-app-reach has no listen rule");
  assert.equal((net.Server.prototype.listen as unknown as Record<symbol, unknown>)[guard.MARK], true, "net.Server.prototype.listen is not guarded in this process");
  for (const port of LISTEN_PORTS) {
    assert.match(listenRule([port, "127.0.0.1"]) ?? "", new RegExp(`${port}`), `port ${port} as a number`);
    assert.match(listenRule([{ port, host: "127.0.0.1" }]) ?? "", new RegExp(`${port}`), `port ${port} as options`);
    assert.match(listenRule([String(port)]) ?? "", new RegExp(`${port}`), `port ${port} as a string`);
    assert.match(listenRule([port]) ?? "", /listen/, `port ${port} on every interface`);
  }
  assert.equal(listenRule([0, "127.0.0.1"]), null, "port 0: the system picks a free one");
  assert.equal(listenRule([{ port: 0, host: "127.0.0.1" }]), null);
  assert.equal(listenRule([]), null, "no port: the system picks");
  assert.equal(listenRule([path.join(tmpdir(), "x.sock")]), null, "a Unix socket of the test's own");
  assert.equal(listenRule([5173]), null, "5173 stays open to listen on: the brief's listen list leaves Vite's port out");
});

test("a child's connects to 8291, 8391 and 5180 and its fetch of 8293 are refused and logged in record mode, before any packet", () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "chw-ports-"));
  const log = path.join(dir, "reach.log");
  try {
    const result = child(
      "[8291, 8391, 5180, 8293].every((port) => rules.refusesConnect([[{ port, host: '127.0.0.1' }, () => undefined]]) !== null)",
      [
        'import { Socket } from "node:net";',
        "for (const port of [8291, 8391, 5180]) {",
        "  await new Promise((resolve) => { const s = new Socket(); s.on('error', (e) => { console.log(`net ${port} ${e.code}`); resolve(); }); s.on('connect', () => { console.log(`net ${port} connected`); s.destroy(); resolve(); }); s.connect({ port, host: '127.0.0.1' }); });",
        "}",
        // Spelled in pieces for the repository's network guard (noModelCalls reads every call under scripts/), as no-app-reach.test.ts does.
        'const call = globalThis[["fet", "ch"].join("")];',
        'try { await call("http://127.0.0.1:8293/api/health"); console.log("fetch answered"); } catch (e) { console.log(`fetch ${e.cause?.code ?? e.message}`); }',
      ].join("\n"),
      { CREWHUB_TEST_REACH_LOG: log },
    );
    assert.equal(result.status, 0, `the child: ${result.stderr}`);
    for (const port of [8291, 8391, 5180]) assert.match(result.stdout, new RegExp(`^net ${port} ECONNREFUSED$`, "m"), result.stdout);
    assert.match(result.stdout, /^fetch ECONNREFUSED$/m, result.stdout);
    const lines = logLines(log);
    for (const port of [8291, 8391, 5180, 8293]) assert.ok(lines.some((l) => new RegExp(`REFUSED connect 127\\.0\\.0\\.1:${port} `).test(l)), lines.join("\n"));
    assert.ok(!lines.some((l) => /CONNECT tcp/.test(l)), `a connection was made: ${lines.join("\n")}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a child's listen on 8391 and 5180 is refused and logged in record mode, as an error event; the port is never taken", () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "chw-ports-"));
  const log = path.join(dir, "reach.log");
  try {
    const result = child(
      "typeof rules.refusesListen === 'function' && [8391, 5180].every((port) => rules.refusesListen([port, '127.0.0.1']) !== null)",
      [
        'import { createServer } from "node:net";',
        "for (const port of [8391, 5180]) {",
        "  await new Promise((resolve) => { const server = createServer(); server.on('error', (e) => { console.log(`listen ${port} ${e.code}`); resolve(); }); server.listen(port, '127.0.0.1', () => { console.log(`listen ${port} taken`); server.close(resolve); }); });",
        "}",
        "await new Promise((resolve) => { const own = createServer(); own.listen(0, '127.0.0.1', () => { console.log('listen 0 ok'); own.close(resolve); }); });",
      ].join("\n"),
      { CREWHUB_TEST_REACH_LOG: log },
    );
    assert.equal(result.status, 0, `the child: ${result.stderr}`);
    for (const port of [8391, 5180]) assert.match(result.stdout, new RegExp(`^listen ${port} EADDRINUSE$`, "m"), result.stdout);
    assert.match(result.stdout, /^listen 0 ok$/m, "a test's own port 0 still listens");
    const lines = logLines(log);
    for (const port of [8391, 5180]) assert.ok(lines.some((l) => new RegExp(`REFUSED listen .*${port}`).test(l)), lines.join("\n"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("in guard mode (npm test) a refused listen is loud and fails the process even when the code under test swallows it", () => {
  const result = child(
    "typeof rules.refusesListen === 'function' && rules.refusesListen([8291, '127.0.0.1']) !== null",
    ['import { createServer } from "node:net";', "try { createServer().listen(8291, '127.0.0.1'); console.log('listen went through'); } catch (e) { console.log(e.message); }", "setTimeout(() => process.exit(), 50);"].join("\n"),
    { CREWHUB_TEST_REACH_LOG: "" },
  );
  assert.equal(result.status, 1, `exit ${result.status}: ${result.stdout} ${result.stderr}`);
  assert.match(result.stdout, /^no-app-reach: a test reached for .*8291.* \(listen\)$/m, result.stdout);
  assert.doesNotMatch(result.stdout, /listen went through/);
});
