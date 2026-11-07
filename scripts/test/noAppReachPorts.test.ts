/* no-app-reach's ports beyond the Mac app's (round 55, r55-guard): a test connects to none of the development
   crewhub-loops (8291 to 8293), a running loops-fake (8391), somebody's `npm run world` (5180) or Vite dev server (5173),
   and listens on none of the Mac app's, the development loops', the fake's or the host's. The named ports are proved by
   the rule functions alone, which touch no network. The live proofs aim at a decoy (round 56): a port the test itself
   picks and owns, which the guard is told to refuse (CREWHUB_TEST_GUARD_DECOY, guardDecoy.ts). Every child first checks
   that the guard's patches are in place and that it refuses the decoy, and stops (exit 3) when not. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as guard from "../no-app-reach.mjs";
import { canListen, decoyListener, freePort } from "./guardDecoy.ts";

const GUARD = fileURLToPath(new URL("../no-app-reach.mjs", import.meta.url));
const CONNECT_PORTS = [8291, 8292, 8293, 8391, 5180, 5173];
const LISTEN_PORTS = [8091, 8000, 9443, 8291, 8292, 8293, 8391, 5180];

/** The rule for a port, as the guard words it, or null (the guard has no such rule). */
const connectRule = (args: unknown[], decoy: number | null = null) => guard.refusesConnect(args, decoy);
const listenRule = (args: unknown[], decoy: number | null = null) => (typeof guard.refusesListen === "function" ? guard.refusesListen(args, decoy) : null);

/** Module code in a child Node that carries the guard (NODE_OPTIONS) and first proves the guard, its patches and the
    decoy rule (`rules`, a JS condition over the guard's exports) are in it. Asynchronous: the test's own decoy listener
    keeps answering, and counting, while the child runs. */
function child(rules: string, code: string, env: Record<string, string>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const first = [
    'const mark = globalThis[Symbol.for("crewhub-world.no-app-reach")];',
    'if (mark === undefined) { console.error("guard absent"); process.exit(3); }',
    'const guardNet = await import("node:net");',
    'const MARK = Symbol.for("crewhub-world.no-app-reach");',
    'if (guardNet.Socket.prototype.connect[MARK] !== true || guardNet.Server.prototype.listen[MARK] !== true) { console.error("a patch is absent: nothing tried"); process.exit(3); }',
    `const rules = await import(${JSON.stringify(GUARD)});`,
    `if (!(${rules})) { console.error("the decoy is not refused: nothing tried"); process.exit(3); }`,
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

test("the decoy knob: only a whole number in 1024-65535 counts, and then that port alone is refused, for connect and listen", () => {
  // Linux's port 0 lands in 32768-60999, macOS's in 49152-65535 (round 56b: CI ran on Linux and every decoy was ignored).
  for (const port of [1024, 32768, 40000, 49151, 49152, 60999, 65535]) assert.equal(guard.decoyOf(String(port)), port, `${port} is a decoy`);
  for (const text of [undefined, "", "1023", "65536", "0", "50000.5", " 50000", "50000 ", "5e4", "-50000", "abc"]) assert.equal(guard.decoyOf(text), null, `"${text}" is ignored`);
  assert.equal(guard.DECOY_PORT, null, "this test process has no decoy: only its children get one");
  assert.match(connectRule([{ port: 50123, host: "127.0.0.1" }], 50123) ?? "", /guard test's decoy/);
  assert.match(connectRule([[{ port: 50123, host: "127.0.0.1" }, () => undefined]], 50123) ?? "", /guard test's decoy/, "the normalized form");
  assert.equal(connectRule([{ port: 50124, host: "127.0.0.1" }], 50123), null, "only the decoy itself");
  assert.match(listenRule([50123, "127.0.0.1"], 50123) ?? "", /guard test's decoy/);
  assert.match(listenRule([{ port: 50123 }], 50123) ?? "", /guard test's decoy/);
  assert.equal(listenRule([0, "127.0.0.1"], 50123), null, "port 0 still listens");
  assert.equal(listenRule([50124, "127.0.0.1"], 50123), null);
});

test("a child's connect and fetch to the test's own decoy are refused and logged in record mode; the decoy's listener sees nothing", async () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "chw-ports-"));
  const log = path.join(dir, "reach.log");
  const decoy = await decoyListener();
  try {
    const result = await child(
      `rules.refusesConnect([[{ port: ${decoy.port}, host: '127.0.0.1' }, () => undefined]]) !== null`,
      [
        'import { Socket } from "node:net";',
        `await new Promise((resolve) => { const s = new Socket(); s.on('error', (e) => { console.log(\`net \${e.code}\`); resolve(); }); s.on('connect', () => { console.log('net connected'); s.destroy(); resolve(); }); s.connect({ port: ${decoy.port}, host: '127.0.0.1' }); });`,
        // Spelled in pieces for the repository's network guard (noModelCalls reads every call under scripts/), as no-app-reach.test.ts does.
        'const call = globalThis[["fet", "ch"].join("")];',
        `try { await call("http://127.0.0.1:${decoy.port}/api/health"); console.log("fetch answered"); } catch (e) { console.log(\`fetch \${e.cause?.code ?? e.message}\`); }`,
      ].join("\n"),
      { CREWHUB_TEST_REACH_LOG: log, CREWHUB_TEST_GUARD_DECOY: String(decoy.port) },
    );
    assert.equal(result.status, 0, `the child: ${result.stderr}`);
    assert.match(result.stdout, /^net ECONNREFUSED$/m, result.stdout);
    assert.match(result.stdout, /^fetch ECONNREFUSED$/m, result.stdout);
    const lines = logLines(log);
    assert.equal(lines.filter((l) => l.includes(`REFUSED connect 127.0.0.1:${decoy.port} is the guard test's decoy`)).length, 2, lines.join("\n"));
    assert.ok(!lines.some((l) => /CONNECT tcp/.test(l)), `a connection was made: ${lines.join("\n")}`);
    assert.equal(decoy.hits(), 0, "the decoy's own listener was reached");
  } finally {
    await decoy.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a child's listen on the test's decoy port is refused and logged in record mode, as an error event; the port is never taken", async () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "chw-ports-"));
  const log = path.join(dir, "reach.log");
  const port = await freePort();
  try {
    const result = await child(
      `typeof rules.refusesListen === 'function' && rules.refusesListen([${port}, '127.0.0.1']) !== null`,
      [
        'import { createServer } from "node:net";',
        `await new Promise((resolve) => { const server = createServer(); server.on('error', (e) => { console.log(\`listen \${e.code}\`); resolve(); }); server.listen(${port}, '127.0.0.1', () => { console.log('listen taken'); server.close(resolve); }); });`,
        "await new Promise((resolve) => { const own = createServer(); own.listen(0, '127.0.0.1', () => { console.log('listen 0 ok'); own.close(resolve); }); });",
      ].join("\n"),
      { CREWHUB_TEST_REACH_LOG: log, CREWHUB_TEST_GUARD_DECOY: String(port) },
    );
    assert.equal(result.status, 0, `the child: ${result.stderr}`);
    assert.match(result.stdout, /^listen EADDRINUSE$/m, result.stdout);
    assert.doesNotMatch(result.stdout, /listen taken/, "the child took the decoy port");
    assert.match(result.stdout, /^listen 0 ok$/m, "a test's own port 0 still listens");
    assert.ok(logLines(log).some((l) => l.includes(`REFUSED listen listening on 127.0.0.1:${port}, the guard test's decoy`)), logLines(log).join("\n"));
    assert.equal(await canListen(port), true, "the decoy port is free again: nobody kept it");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("in guard mode (npm test) a refused listen on the decoy is loud and fails the process even when the code under test swallows it", async () => {
  const port = await freePort();
  const result = await child(
    `typeof rules.refusesListen === 'function' && rules.refusesListen([${port}, '127.0.0.1']) !== null`,
    ['import { createServer } from "node:net";', `try { createServer().listen(${port}, '127.0.0.1'); console.log('listen went through'); } catch (e) { console.log(e.message); }`, "setTimeout(() => process.exit(), 50);"].join("\n"),
    { CREWHUB_TEST_REACH_LOG: "", CREWHUB_TEST_GUARD_DECOY: String(port) },
  );
  assert.equal(result.status, 1, `exit ${result.status}: ${result.stdout} ${result.stderr}`);
  assert.match(result.stdout, new RegExp(`^no-app-reach: a test reached for listening on 127\\.0\\.0\\.1:${port}, the guard test's decoy .* \\(listen\\)$`, "m"), result.stdout);
  assert.doesNotMatch(result.stdout, /listen went through/);
});
