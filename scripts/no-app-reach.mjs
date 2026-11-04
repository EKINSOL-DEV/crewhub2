/* no-app-reach: no unit test may reach the Mac app (round 35).
 *
 * Preloaded into every test process by `npm test` (`node --import ./scripts/no-app-reach.mjs --test …`) and, through
 * NODE_OPTIONS, into every Node process a test spawns. It patches `node:net` and `node:fs` in that process so that:
 *   - a connection to port 8091, 8000 or 9443 on any host (the Mac app's ports) is refused before a packet leaves, and
 *     so is one to 8291 to 8293 (the development crewhub-loops), 8391 (a running loops-fake), 5180 (somebody's
 *     `npm run world`) or 5173 (a Vite dev server) (round 55);
 *   - a listen on 8091, 8000, 9443, 8291 to 8293, 8391 or 5180 is refused before the port is taken (round 55); a test
 *     listens on port 0. These ports and their words come from scripts/named-ports.mjs, the one named-port list, which
 *     the tools' rule (tools/lib/toolGuard.ts) reads as well (round 57d);
 *   - a file under the app's data folder (~/Library/Application Support/be.ekinsol.crewhub), under ~/.config/crewhub-world
 *     or ~/.config/crewhub-loops (Nicky's folders), or a relative `settings.json` / `run/api.sock` (what `createHost`
 *     reads when a test leaves the app data folder empty) is refused before it is opened. `~` is $HOME and also the
 *     user's home from the user database (getpwuid, round 56), so a test that moves HOME is still refused the real ones;
 *   - a real host's run file, `<TMPDIR>/crewhub-world-host-<port>.json` for a port 1024 to 32767 (a real host's chosen
 *     port; a test's host listens on port 0 and lands in the ephemeral range, 32768-60999 on Linux and 49152-65535 on
 *     macOS, round 56b), is refused in the real TMPDIR (round 56): the
 *     first preloaded process's, handed down in CREWHUB_TEST_REAL_TMPDIR, as well as each process's own.
 * A refusal throws an Error whose message starts with "no-app-reach:" and sets the process's exit code to 1, so the test
 * file fails even when the code under test swallows the error (a discovery probe reports "down" and goes on). With
 * CREWHUB_TEST_REACH_LOG=<file> the guard records instead (every connect and every refusal, one line each, with the
 * pid) and the refusal looks like a closed port, a port in use or a missing file: that is how `npm test` is measured.
 *
 * CREWHUB_TEST_GUARD_DECOY=<port> (round 56, for the guard's own tests only): the guard refuses that one port too, on the
 * same path (connect and listen, logged in record mode, thrown in guard mode). A guard test picks a port of its own and
 * proves a refusal on it: no test aims at a named port, not even to show it is refused. Only a whole number in
 * 1024-65535 counts (a test's own port-0 listener lands at 32768-60999 on Linux and 49152-65535 on macOS, round 56b; the
 * knob only adds a refusal, so a wider range opens nothing); anything else is ignored.
 *
 * CREWHUB_TEST_GUARD_HOME=<absolute folder> (round 56, the guard's own tests only) adds a decoy home whose three folders
 * are refused as well; it never replaces $HOME or the user's home. CREWHUB_TEST_REAL_TMPDIR adds, never replaces, too.
 *
 * Not guarded (round 55's docs/proposals/mutation-harness.md, a day round's work): node:sqlite (it opens past node:fs),
 * spawn and exec, and process.kill.
 *
 * It changes nothing for a real host: only the test scripts preload it. The predicates are exported for the unit test
 * in scripts/test/no-app-reach.test.ts, which also checks that the preload is active, and noAppReachPorts.test.ts. */
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import { homedir, tmpdir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_PORTS, NAMED_PORTS, VITE_PORT } from "./named-ports.mjs";

const HOME = homedir();
export const APP_DATA = path.join(HOME, "Library", "Application Support", "be.ekinsol.crewhub");
export const CONFIG_DIR = path.join(HOME, ".config", "crewhub-world");
export const LOOPS_CONFIG = path.join(HOME, ".config", "crewhub-loops");

/** The homes whose folders are refused: $HOME, the user's home from the user database (getpwuid: a moved HOME does not
    move it), and the guard test's decoy home (`CREWHUB_TEST_GUARD_HOME`, absolute only). */
export function guardedHomes(env = process.env, home = HOME, userHome = userInfo().homedir) {
  const decoy = env.CREWHUB_TEST_GUARD_HOME;
  const homes = [home, userHome, ...(typeof decoy === "string" && path.isAbsolute(decoy) ? [decoy] : [])];
  return [...new Set(homes.map((h) => path.resolve(h)))];
}
/** The folders under each home, with what a refusal says. */
export function guardedFolders(homes) {
  return homes.flatMap((home) => [
    { dir: path.join(home, "Library", "Application Support", "be.ekinsol.crewhub"), why: "is under the Mac app's data folder" },
    { dir: path.join(home, ".config", "crewhub-world"), why: "is under the default config folder ~/.config/crewhub-world" },
    { dir: path.join(home, ".config", "crewhub-loops"), why: "is under ~/.config/crewhub-loops" },
  ]);
}
export const GUARDED_HOMES = guardedHomes();
const FOLDERS = guardedFolders(GUARDED_HOMES);

/** The real TMPDIRs: this process's and the first preloaded process's (`CREWHUB_TEST_REAL_TMPDIR`), each as named and as resolved. */
export function realTmpDirs(env = process.env, own = tmpdir()) {
  const named = [own, ...(typeof env.CREWHUB_TEST_REAL_TMPDIR === "string" && path.isAbsolute(env.CREWHUB_TEST_REAL_TMPDIR) ? [env.CREWHUB_TEST_REAL_TMPDIR] : [])];
  const out = new Set();
  for (const dir of named) {
    out.add(path.resolve(dir));
    try {
      out.add(fs.realpathSync(dir));
    } catch {
      // A folder that is not there holds no run file.
    }
  }
  return [...out];
}
const TMP_DIRS = realTmpDirs();
/** A real host's run file: `crewhub-world-host-<port>.json` with a port a person chooses (1024 to 32767, below both
    ephemeral ranges: Linux 32768-60999, macOS 49152-65535), not a test's. */
export function isRealRunFile(file, tmpDirs = TMP_DIRS) {
  const match = /^crewhub-world-host-(\d+)\.json$/.exec(path.basename(file));
  if (match === null) return false;
  const port = Number(match[1]);
  return port >= 1024 && port <= 32767 && tmpDirs.includes(path.dirname(file));
}
// The ports come from the one named-port list (scripts/named-ports.mjs, round 57d), which the tools' rule reads too.
export { APP_PORTS };
/** Ports a test connects to never, each with whose it is (round 55): every connect of `npm test` goes to a port 0 listener. */
export const OTHER_PORTS = new Map(NAMED_PORTS.filter(({ port }) => !APP_PORTS.includes(port)).map(({ port, why }) => [port, why]));
/** The decoy port of `CREWHUB_TEST_GUARD_DECOY`, or null: a whole number in 1024-65535, else ignored. */
export function decoyOf(text) {
  if (typeof text !== "string" || !/^\d+$/.test(text)) return null;
  const port = Number(text);
  return port >= 1024 && port <= 65535 ? port : null;
}
export const DECOY_PORT = decoyOf(process.env.CREWHUB_TEST_GUARD_DECOY);
const DECOY_WORDS = "the guard test's decoy (CREWHUB_TEST_GUARD_DECOY)";

/** Ports a test listens on never (round 55): somebody's process holds them, or a host's discovery would take a test's listener for loops. Vite's stays open, as round 55's brief listed it. */
export const LISTEN_PORTS = NAMED_PORTS.map(({ port }) => port).filter((port) => port !== VITE_PORT);
export const MARK = Symbol.for("crewhub-world.no-app-reach");

const under = (file, dir) => file === dir || file.startsWith(dir + path.sep);

/** Why a path may not be touched by a test, or null. Relative `settings.json` and `run/api.sock` are the empty app data folder's. */
export function refusesPath(input, folders = FOLDERS, tmpDirs = TMP_DIRS) {
  let p = input;
  if (p instanceof URL) {
    if (p.protocol !== "file:") return null;
    p = fileURLToPath(p);
  }
  if (Buffer.isBuffer(p)) p = p.toString("utf8");
  if (typeof p !== "string") return null;
  if (!path.isAbsolute(p)) {
    const relative = path.normalize(p);
    if (relative === "settings.json" || relative === path.join("run", "api.sock")) return `a relative ${relative}: the app data folder was left empty, so the host would look in the cwd and then on 8091`;
    p = path.resolve(p);
  }
  for (const folder of folders) if (under(p, folder.dir)) return `${p} ${folder.why}`;
  if (isRealRunFile(p, tmpDirs)) return `${p} is a real host's run file (its mint secret) in the real TMPDIR`;
  return null;
}

/** The target of `socket.connect(...args)` as { port, host } or { path }, whatever form the call took. */
export function connectTarget(args) {
  // net.connect(), http and undici's fetch hand Socket#connect its normalized arguments: one array, [options, callback].
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof first === "object" && first !== null) {
    if (typeof first.path === "string") return { path: first.path };
    return { port: Number(first.port), host: typeof first.host === "string" ? first.host : "localhost" };
  }
  if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) return { port: Number(first), host: typeof args[1] === "string" ? args[1] : "localhost" };
  if (typeof first === "string") return { path: first };
  return {};
}

/** Why a connection may not be made by a test, or null. `decoy` is the guard test's own port (`DECOY_PORT`). */
export function refusesConnect(args, decoy = DECOY_PORT) {
  const target = connectTarget(args);
  if (target.path !== undefined) return refusesPath(target.path);
  if (target.port !== undefined && APP_PORTS.includes(target.port)) return `${target.host}:${target.port} is the Mac app's port`;
  if (target.port !== undefined && OTHER_PORTS.has(target.port)) return `${target.host}:${target.port} is ${OTHER_PORTS.get(target.port)}`;
  if (decoy !== null && target.port === decoy) return `${target.host}:${target.port} is ${DECOY_WORDS}`;
  return null;
}

/** The port of `server.listen(...args)` as { port, host }, or {} for a Unix socket, a handle or no port (the system picks). */
export function listenTarget(args) {
  const first = args[0];
  if (typeof first === "object" && first !== null) {
    if (first.port === undefined || typeof first.path === "string") return {};
    return { port: Number(first.port), host: typeof first.host === "string" ? first.host : "every interface" };
  }
  if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) return { port: Number(first), host: typeof args[1] === "string" ? args[1] : "every interface" };
  return {};
}

/** Why a test may not listen there, or null. `decoy` is the guard test's own port (`DECOY_PORT`). */
export function refusesListen(args, decoy = DECOY_PORT) {
  const target = listenTarget(args);
  if (target.port === undefined) return null;
  if (decoy !== null && target.port === decoy) return `listening on ${target.host}:${target.port}, ${DECOY_WORDS}`;
  if (!LISTEN_PORTS.includes(target.port)) return null;
  const whose = APP_PORTS.includes(target.port) ? "the Mac app's port" : OTHER_PORTS.get(target.port);
  return `listening on ${target.host}:${target.port}, ${whose}`;
}

if (globalThis[MARK] === undefined) {
  const logFile = process.env.CREWHUB_TEST_REACH_LOG;
  const recording = logFile !== undefined && logFile !== "";
  const appendFile = fs.appendFileSync;
  const state = { refusals: 0, recording };
  globalThis[MARK] = state;
  const record = (line) => {
    if (recording) appendFile(logFile, `${process.pid} ${line}\n`);
  };
  const refuse = (kind, reason) => {
    state.refusals++;
    record(`REFUSED ${kind} ${reason}`);
    if (recording) return;
    process.exitCode = 1;
    process.stderr.write(`no-app-reach: a test reached for ${reason} (${kind})\n`);
  };
  const missing = (syscall, p) => Object.assign(new Error(`ENOENT: no such file or directory, ${syscall} '${p}'`), { code: "ENOENT", errno: -2, syscall, path: String(p) });
  const fail = (kind, reason, syscall, p) => (recording ? missing(syscall, p) : new Error(`no-app-reach: a test reached for ${reason} (${kind})`));

  // net: every TCP and Unix connection in Node goes through Socket.prototype.connect (net.connect, http, undici's fetch, tls).
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedConnect(...args) {
    const reason = refusesConnect(args);
    if (reason === null) {
      const target = connectTarget(args);
      record(target.path !== undefined ? `CONNECT unix ${target.path}` : `CONNECT tcp ${target.host}:${target.port}`);
      return connect.apply(this, args);
    }
    refuse("connect", reason);
    if (!recording) throw new Error(`no-app-reach: a test reached for ${reason} (connect)`);
    process.nextTick(() => this.destroy(Object.assign(new Error(`connect ECONNREFUSED (no-app-reach)`), { code: "ECONNREFUSED", syscall: "connect" })));
    return this;
  };
  net.Socket.prototype.connect[MARK] = true;

  // listen: http and https servers are net servers, so this is every TCP listener in Node.
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function guardedListen(...args) {
    const reason = refusesListen(args);
    if (reason === null) return listen.apply(this, args);
    refuse("listen", reason);
    if (!recording) throw new Error(`no-app-reach: a test reached for ${reason} (listen)`);
    process.nextTick(() => this.emit("error", Object.assign(new Error(`listen EADDRINUSE (no-app-reach)`), { code: "EADDRINUSE", syscall: "listen" })));
    return this;
  };
  net.Server.prototype.listen[MARK] = true;

  // fs: the sync, callback and promise forms of what opens, reads, lists, writes or stats a path.
  const onePath = ["readFile", "writeFile", "appendFile", "stat", "lstat", "access", "open", "readdir", "mkdir", "rm", "rmdir", "unlink", "realpath", "chmod", "opendir", "truncate", "utimes"];
  const twoPaths = ["rename", "copyFile", "link", "symlink"];
  const wrap = (owner, name, arity, onRefused) => {
    const original = owner[name];
    if (typeof original !== "function") return;
    const wrapped = function guarded(...args) {
      for (let i = 0; i < arity; i++) {
        const reason = refusesPath(args[i]);
        if (reason !== null) return onRefused(reason, name, args[i], args);
      }
      return original.apply(this, args);
    };
    Object.assign(wrapped, original);
    Object.defineProperty(wrapped, "name", { value: original.name });
    wrapped[MARK] = true;
    owner[name] = wrapped;
  };
  const throwing = (reason, name, p) => {
    refuse("fs", reason);
    throw fail("fs", reason, name, p);
  };
  const rejecting = (reason, name, p) => {
    refuse("fs", reason);
    return Promise.reject(fail("fs", reason, name, p));
  };
  const callingBack = (reason, name, p, args) => {
    refuse("fs", reason);
    const callback = args.find((a) => typeof a === "function");
    const error = fail("fs", reason, name, p);
    if (callback === undefined) throw error;
    process.nextTick(() => callback(error));
    return undefined;
  };
  for (const name of onePath) {
    wrap(fs, `${name}Sync`, 1, throwing);
    wrap(fs, name, 1, callingBack);
    wrap(fs.promises, name, 1, rejecting);
  }
  for (const name of twoPaths) {
    wrap(fs, `${name}Sync`, 2, throwing);
    wrap(fs, name, 2, callingBack);
    wrap(fs.promises, name, 2, rejecting);
  }
  wrap(fs, "existsSync", 1, (reason, name, p) => {
    refuse("fs", reason);
    if (recording) return false;
    throw fail("fs", reason, name, p);
  });
  syncBuiltinESMExports();

  // A child that moves TMPDIR still knows the real one (an env the test gives explicitly may leave it out: then the
  // child's own TMPDIR is all it guards).
  if (process.env.CREWHUB_TEST_REAL_TMPDIR === undefined) process.env.CREWHUB_TEST_REAL_TMPDIR = tmpdir();
  // Every Node process a test spawns gets the same guard (NODE_OPTIONS is read by node, not by the test).
  const here = fileURLToPath(import.meta.url);
  const nodeOptions = process.env.NODE_OPTIONS ?? "";
  if (!nodeOptions.includes(here)) process.env.NODE_OPTIONS = `${nodeOptions} --import ${JSON.stringify(here)}`.trim();

  process.on("exit", () => {
    if (state.refusals > 0 && !recording && process.exitCode === 0) process.exitCode = 1;
  });
}
