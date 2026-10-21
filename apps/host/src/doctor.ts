/**
 * `npm run host -- doctor`: the terminal view of the connection's states (spec addendum "a smooth connection", part 4).
 * A read-only preflight with the same configuration as the host: one line per check, ok or the fix. It never opens the
 * stream (loops admits four per key) and never writes. Pure logic: the disk, the probes and the loops client are
 * injected, so the tests run it against the stub, offline.
 */
import { readFileSync, statSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { ConfigError, type KeyFiles, type LoadedKey, type PathKind, type ServerConfig, keyFilesOf, loadKey, loadServerConfig, statPath } from "./config.ts";
import { type DiscoveryInput, type Found, candidates, discoverOnce, loopsHealth, targetText } from "./discovery.ts";
import { checkKey } from "./keyCheck.ts";
import { type LoopsClient, type LoopsTarget, createLoopsClient } from "./loops.ts";

export type DoctorStatus = "ok" | "fix" | "skip";

export interface DoctorLine {
  /** `loops`, `health`, `key`, `auth`, `projects`, `agents`, `team`, `events`, `port`, `pairing`. */
  id: string;
  status: DoctorStatus;
  text: string;
}

export interface DoctorReport {
  lines: DoctorLine[];
  /** Every check passed. */
  ok: boolean;
}

export interface FileInfo {
  mode: number;
  uid: number;
  size: number;
}

export type PortState = { kind: "free" } | { kind: "host"; health: Record<string, unknown> } | { kind: "taken" };

export interface DoctorIo {
  env: Record<string, string | undefined>;
  /** The user the doctor runs as (`process.getuid()`); null on a platform without one. */
  uid?: number | null;
  statFile?: (file: string) => FileInfo | null;
  readFile?: (file: string) => string | null;
  statPath?: (file: string) => PathKind;
  /** The discovery's probe (`GET /api/health` without a key). */
  health?: (target: LoopsTarget) => Promise<{ status: number; ok: boolean; version?: string } | null>;
  client?: (target: LoopsTarget, key: string) => LoopsClient;
  probePort?: (port: number) => Promise<PortState>;
  /** The key files (tests point them into a temp folder). Default: from the env. */
  keyFiles?: KeyFiles;
}

export const KEY_SHAPE = /^chl_[A-Za-z0-9_-]{8,200}$/;

function realStatFile(file: string): FileInfo | null {
  try {
    const info = statSync(file);
    return { mode: info.mode & 0o777, uid: info.uid, size: info.size };
  } catch {
    return null;
  }
}

function realReadFile(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Is the host's port free, taken by a host (then its health), or by something else? Loopback only. */
export async function probePortState(port: number): Promise<PortState> {
  const listening = await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
  if (!listening) return { kind: "free" };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/world-api/health`, { signal: AbortSignal.timeout(1500), headers: { accept: "application/json" } });
    if (!response.ok) return { kind: "taken" };
    const body = (await response.json()) as Record<string, unknown> | null;
    return body !== null && typeof body === "object" && typeof body.loops === "string" ? { kind: "host", health: body } : { kind: "taken" };
  } catch {
    return { kind: "taken" };
  }
}

/** `~` for the home folder, in a line a person reads. */
export function tilde(file: string, home = homedir()): string {
  return file === home || file.startsWith(home + path.sep) ? `~${file.slice(home.length)}` : file;
}

const octal = (mode: number) => `0${(mode & 0o777).toString(8).padStart(3, "0")}`;

export async function runDoctor(io: DoctorIo): Promise<DoctorReport> {
  const lines: DoctorLine[] = [];
  const ok = (id: string, text: string) => lines.push({ id, status: "ok", text });
  const fix = (id: string, text: string) => lines.push({ id, status: "fix", text });
  const skip = (id: string, text: string) => lines.push({ id, status: "skip", text });
  const uid = io.uid === undefined ? (typeof process.getuid === "function" ? process.getuid() : null) : io.uid;
  const statFile = io.statFile ?? realStatFile;
  const readFile = io.readFile ?? realReadFile;
  const health = io.health ?? ((target: LoopsTarget) => loopsHealth(target));
  const client = io.client ?? ((target: LoopsTarget, key: string) => createLoopsClient(target, key));
  const probePort = io.probePort ?? probePortState;
  const home = homedir();

  // 1. The configuration and the discovery: where loops is.
  let config: ServerConfig;
  try {
    config = loadServerConfig(io.env, io.statPath ?? statPath);
  } catch (error) {
    fix("loops", error instanceof ConfigError ? error.message : "the configuration failed");
    for (const id of ["health", "key", "auth", "projects", "agents", "team", "events", "port", "pairing"]) skip(id, "the configuration failed");
    return { lines, ok: false };
  }
  const input: DiscoveryInput = {
    loopsUrl: config.loopsUrl,
    loopsSocket: config.loopsSocket,
    loopsWebUrl: config.loopsWebUrl,
    appData: config.appData,
    ...(io.statPath === undefined ? {} : { statPath: io.statPath }),
    ...(io.readFile === undefined ? {} : { readFile: io.readFile }),
    answers: async (target) => (await health(target))?.ok === true,
  };
  const roads = candidates(input).map((c) => `${c.via} ${tilde(targetText(c.target), home)}`);
  const found: Found | null = await discoverOnce(input);
  if (found === null) {
    fix(
      "loops",
      `nothing answers; looked for ${roads.join(", ")}. Open Crewhub.app (it serves 127.0.0.1:8091 and its socket) and run this again. The host keeps looking every 5 s. Another install: CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:<port> or CREWHUB_WORLD_LOOPS_SOCKET=<path>.`,
    );
  } else ok("loops", `found via ${found.via}: ${tilde(targetText(found.target), home)} (web ${found.webUrl})`);

  // 2. loops' own health.
  let reachable = false;
  if (found === null) skip("health", "no loops");
  else {
    const answer = await health(found.target);
    if (answer === null) fix("health", `${tilde(targetText(found.target), home)} does not answer GET /api/health: is crewhub-loops running there?`);
    else if (!answer.ok) fix("health", `GET /api/health answered ${answer.status} without ok: is that crewhub-loops? (another program on that port?)`);
    else {
      reachable = true;
      ok("health", `crewhub-loops answers${answer.version === undefined ? "" : `, version ${answer.version}`}`);
    }
  }

  // 3. The key: which file the host reads, its mode and owner, its shape. Never its text.
  const files = io.keyFiles ?? keyFilesOf(io.env);
  let loaded: LoadedKey | null = null;
  try {
    loaded = loadKey(io.env, readFile, files);
  } catch (error) {
    fix("key", `${error instanceof ConfigError ? error.message : "cannot read the key"}. Save the access key there (0600), or unset CREWHUB_WORLD_KEY_FILE and paste it in the world's Connect screen.`);
  }
  if (loaded === null && lines.every((l) => l.id !== "key")) {
    const where = (io.env.CREWHUB_WORLD_KEY_FILE ?? "").trim() === "" ? `looked in ${tilde(files.storedKey, home)} and ${tilde(files.defaultKey, home)}` : "";
    fix("key", `no key yet (${where}). The world shows its Connect screen: in crewhub-loops make an external bot (Settings > Agents > New external bot, name crewhub-world, "Read only" off, no projects), copy the access key once and paste it there. The host stores it in ${tilde(files.storedKey, home)}.`);
  } else if (loaded !== null) {
    const problems: string[] = [];
    const info = statFile(loaded.file);
    if (info !== null) {
      if ((info.mode & 0o077) !== 0) problems.push(`mode ${octal(info.mode)} lets others read it: chmod 600 ${tilde(loaded.file, home)}`);
      if (uid !== null && info.uid !== uid) problems.push(`owned by uid ${info.uid}, not you (uid ${uid})`);
    }
    if (!KEY_SHAPE.test(loaded.key)) problems.push(`its text (${loaded.key.length} characters) is not an access key (chl_ followed by one line of letters, digits, - and _): copy it again from the access-key window`);
    const source = loaded.source === "env" ? "CREWHUB_WORLD_KEY_FILE" : loaded.source === "stored" ? "the stored key" : "the old default file";
    if (problems.length > 0) fix("key", `${tilde(loaded.file, home)} (${source}): ${problems.join("; ")}`);
    else {
      ok("key", `${tilde(loaded.file, home)} (${source})${info === null ? "" : `, mode ${octal(info.mode)}, yours`}, looks like an access key`);
    }
  }

  // 4. What loops says about the key, and the snapshot reads. Read only; never the stream.
  let loops: LoopsClient | null = null;
  if (found === null || !reachable) for (const id of ["auth", "projects", "agents", "team", "events"]) skip(id, "no loops");
  else if (loaded === null) for (const id of ["auth", "projects", "agents", "team", "events"]) skip(id, "no key");
  else {
    loops = client(found.target, loaded.key);
    const verdict = await checkKey(loops);
    if (verdict.state === "unreachable") fix("auth", `nothing is known about the key yet: ${verdict.reason}. Run this again once crewhub-loops answers.`);
    else if (verdict.state === "rejected") fix("auth", verdict.reason);
    else ok("auth", `${verdict.name} (${verdict.displayName}), role lead: an external bot's key. It could write; the host forwards an allow-list of GETs only.`);
    const authOk = verdict.state === "ok";
    const read = async <T>(id: string, loopsPath: string, describe: (body: T) => string, query: Record<string, string> = {}): Promise<T | null> => {
      if (!authOk) {
        skip(id, "the key was refused");
        return null;
      }
      try {
        const answer = await loops!.getJson<T>(loopsPath, query);
        if (answer.status === 200 && answer.body !== null) {
          ok(id, describe(answer.body));
          return answer.body;
        }
        fix(id, `GET ${loopsPath} answered ${answer.status}`);
      } catch {
        fix(id, `GET ${loopsPath} failed: loops stopped answering`);
      }
      return null;
    };
    await read<{ projects: { slug: string }[] }>("projects", "/api/projects", (b) => `${b.projects.length} project${b.projects.length === 1 ? "" : "s"}${b.projects.length === 0 ? " (no buildings yet: make one in crewhub-loops)" : `: ${b.projects.map((p) => p.slug).join(", ")}`}`);
    const me = verdict.state === "ok" ? verdict.name : null;
    await read<{ agents: { id: string; external?: boolean; reader?: boolean; disabled?: boolean; role?: string }[] }>("agents", "/api/agents", (b) => {
      const self = b.agents.find((a) => a.id === me);
      const about = self === undefined ? "" : self.reader === true ? "; this key's bot is read-only: the board will answer 403" : self.external === true ? `; ${self.id} is an external bot, not read-only` : `; ${self.id} is a ${self.role ?? "lead"} agent with a lane, not an external bot (it works, but an external bot is the intended key)`;
      return `${b.agents.length} agent${b.agents.length === 1 ? "" : "s"}${about}`;
    });
    await read<{ sessions: unknown[] }>("team", "/api/team", (b) => `${b.sessions.length} session${b.sessions.length === 1 ? "" : "s"} in the team snapshot`);
    await read<{ lastSeq: number; cursor?: string }>("events", "/api/events", (b) => `the event log's tail is seq ${b.lastSeq}${typeof b.cursor === "string" ? " (sealed cursor present)" : ""}`, { from: "tail" });
  }
  // 5. The host's port.
  const port = await probePort(config.port);
  if (port.kind === "free") ok("port", `127.0.0.1:${config.port} is free for the host`);
  else if (port.kind === "host") {
    const h = port.health;
    const connection = h.connection as { discovery?: { state?: string }; key?: { state?: string }; stream?: { state?: string }; archived?: { source?: string; count?: number } } | undefined;
    const state = connection?.stream?.state ?? h.loops;
    const runs = `a host already runs on 127.0.0.1:${config.port}`;
    // The host follows every change by itself (it looks for loops every 5 s, takes a pasted key, retries the stream),
    // so no state below asks for a restart: the fix is the act the person must do, and the host picks it up.
    if (state === "ok") ok("port", `${runs} (loops ok, key ${String(h.keyName ?? "?")}); npm run world or npm run host -- open asks it for a link`);
    else if (connection?.discovery?.state === "searching") fix("port", `${runs} and has not found crewhub-loops: open Crewhub.app; the host looks again every 5 s, no restart needed`);
    else if (connection?.key?.state === "none") ok("port", `${runs} and waits for a key: paste it in the world's Connect screen (npm run world opens the browser on it); no restart needed`);
    else if (connection?.key?.state === "rejected")
      ok("port", `${runs} and keeps the key loops rejected: paste a new one in the world's Connect screen, or forget it in its Connection panel; no restart needed`);
    else if (connection?.key?.state === "unchecked") fix("port", `${runs} but crewhub-loops has not answered about the key yet: the host retries by itself; if it stays so, read its terminal`);
    else if (state === "busy") fix("port", `${runs} but the stream budget is exhausted (429): another host or tab uses this key; close that one, the host retries by itself`);
    else fix("port", `${runs} but loops is ${String(state)}: the host retries by itself; if it stays so, read its terminal`);
  } else fix("port", `something else listens on 127.0.0.1:${config.port}: stop it, or run the host on another port (CREWHUB_WORLD_PORT=5181)`);

  // 6. Pairing.
  if (config.pairing === "on") ok("pairing", "on: npm run world opens the browser on a one-time link (or npm run host -- open prints one)");
  else ok("pairing", "off (development only: any page on this machine can read the world's data; production refuses it)");

  return { lines, ok: lines.every((l) => l.status === "ok") };
}

const LABEL: Record<DoctorStatus, string> = { ok: "ok  ", fix: "FIX ", skip: "skip" };

/** The report as lines for the terminal, with a summary last. */
export function formatDoctor(report: DoctorReport): string[] {
  const width = Math.max(...report.lines.map((l) => l.id.length));
  const out = report.lines.map((l) => `${LABEL[l.status]}  ${l.id.padEnd(width)}  ${l.text}`);
  const fixes = report.lines.filter((l) => l.status === "fix").length;
  const skips = report.lines.filter((l) => l.status === "skip").length;
  out.push(report.ok ? `doctor: all ${report.lines.length} checks ok. Next: npm run world` : `doctor: ${fixes} to fix${skips > 0 ? `, ${skips} skipped` : ""}, ${report.lines.length - fixes - skips} ok`);
  return out;
}
