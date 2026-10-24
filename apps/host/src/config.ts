/**
 * The host's configuration from the environment, as a pure function so a test can run it: which key to read (the
 * configured file, the host's own stored key, or the old default file; or none: the host starts without a key and the
 * world shows the Connect screen), the port, the loops URL or Unix socket (or neither: the host finds the Mac app by
 * itself, see `discovery.ts`), the extra origins and the pairing switches. The key's text is returned to the caller and
 * nowhere else.
 */
import { statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** The Mac app's default port, and the URL the discovery tries when its data folder names no other port. */
export const DEFAULT_LOOPS_URL = "http://127.0.0.1:8091";
export const DEFAULT_PORT = 5180;
/** The Mac app's data folder (read only, never written; `CREWHUB_WORLD_LOOPS_APP_DATA` overrides it). */
export const DEFAULT_APP_DATA = path.join(homedir(), "Library", "Application Support", "be.ekinsol.crewhub");
/** The host's own folder (`CREWHUB_WORLD_CONFIG_DIR` overrides it): the stored key lives here, mode 0700/0600. */
export const DEFAULT_CONFIG_DIR = path.join(homedir(), ".config", "crewhub-world");
export const STORED_KEY_NAME = "loops-key";
/** The pairing secret `npm run world` keeps in the host's own folder, so a host restart does not unpair every browser. */
export const PAIRING_SECRET_NAME = "pairing-secret";
export const SECRETS_DIR = path.join(homedir(), ".config", "crewhub-loops", "secrets");
/** The old default: the key file of the runbook before the Connect screen. Still read, third in line. */
export const DEFAULT_KEY_FILE = path.join(SECRETS_DIR, "agent-crewhub-world.key");

export type KeySource = "env" | "stored" | "default";

export interface LoadedKey {
  key: string;
  /** The agent name from the file name (`agent-<name>.key`); the stored key is named after the principal once loops answered. */
  keyName: string;
  source: KeySource;
  /** The file the key came from. For the log; never the key. */
  file: string;
}

/** `agent-<name>.key` → `<name>`; `loops-key` (the stored key) → `crewhub-world`; any other file name stays, without `.key`. */
export function keyNameOf(file: string): string {
  const base = path.basename(file);
  if (base === STORED_KEY_NAME) return "crewhub-world";
  const match = /^agent-(.+)\.key$/.exec(base);
  return match?.[1] ?? base.replace(/\.key$/, "");
}

export class ConfigError extends Error {}

/** `~/` is the home folder; the rest is resolved against the working directory. */
export function expandHome(text: string): string {
  return text === "~" || text.startsWith("~/") ? path.join(homedir(), text.slice(1)) : text;
}

/** The host's own folder, from `CREWHUB_WORLD_CONFIG_DIR` or the default. */
export function configDirOf(env: Record<string, string | undefined>): string {
  const text = (env.CREWHUB_WORLD_CONFIG_DIR ?? "").trim();
  return text === "" ? DEFAULT_CONFIG_DIR : path.resolve(expandHome(text));
}

/**
 * The one line that says which folder is in use and why (round 34: a stranger's run in the real host's folder
 * overwrote its archive memory): "config folder <path> (the default ~/.config/crewhub-world)" or
 * "config folder <path> (from CREWHUB_WORLD_CONFIG_DIR)". The host's start log and the doctor print it.
 */
export function configFolderLine(env: Record<string, string | undefined>, home: string = homedir()): string {
  const dir = configDirOf(env);
  const shown = dir === home || dir.startsWith(`${home}${path.sep}`) ? `~${dir.slice(home.length)}` : dir;
  const named = (env.CREWHUB_WORLD_CONFIG_DIR ?? "").trim() !== "";
  return `config folder ${shown} (${named ? "from CREWHUB_WORLD_CONFIG_DIR" : "the default ~/.config/crewhub-world"})`;
}

export const storedKeyFile = (configDir: string) => path.join(configDir, STORED_KEY_NAME);

/**
 * The environment of `npm run world`: production (the built world is served), and the pairing secret kept in
 * `<configDir>/pairing-secret` (0600) unless `CREWHUB_WORLD_PAIRING_FILE` names another file. Without a kept secret a
 * host restart invalidates every pairing and an open tab is left on Stale (rehearsed on 2026-10-21); the morning's
 * command keeps it, so the tab from yesterday recovers by itself.
 */
export function worldEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const named = (env.CREWHUB_WORLD_PAIRING_FILE ?? "").trim();
  return { ...env, NODE_ENV: "production", CREWHUB_WORLD_PAIRING_FILE: named === "" ? path.join(configDirOf(env), PAIRING_SECRET_NAME) : named };
}

export interface KeyFiles {
  storedKey: string;
  defaultKey: string;
}

export const keyFilesOf = (env: Record<string, string | undefined>): KeyFiles => ({ storedKey: storedKeyFile(configDirOf(env)), defaultKey: DEFAULT_KEY_FILE });

/**
 * Picks and reads the key, in the order of the spec addendum "a smooth connection": `CREWHUB_WORLD_KEY_FILE`, then
 * the host's stored key, then the old default file. `read` returns a file's text or null when it cannot be read. A
 * configured file that cannot be read is an error (no silent fallback); none of the others readable means the host
 * starts without a key (null): the world shows the Connect screen. There is no builder-key fallback any more.
 */
export function loadKey(env: Record<string, string | undefined>, read: (file: string) => string | null, files: KeyFiles = keyFilesOf(env)): LoadedKey | null {
  const configured = env.CREWHUB_WORLD_KEY_FILE;
  if (configured !== undefined && configured !== "") {
    const file = path.resolve(expandHome(configured));
    const key = read(file)?.trim() ?? "";
    if (key === "") throw new ConfigError(`cannot read the key file ${file} (CREWHUB_WORLD_KEY_FILE)`);
    return { key, keyName: keyNameOf(file), source: "env", file };
  }
  const stored = read(files.storedKey)?.trim() ?? "";
  if (stored !== "") return { key: stored, keyName: keyNameOf(files.storedKey), source: "stored", file: files.storedKey };
  const fallback = read(files.defaultKey)?.trim() ?? "";
  if (fallback !== "") return { key: fallback, keyName: keyNameOf(files.defaultKey), source: "default", file: files.defaultKey };
  return null;
}

/** What a path on disk is, for the socket check: `null` when nothing is there. */
export type PathKind = { isSocket: boolean } | null;

export function statPath(file: string): PathKind {
  try {
    return { isSocket: statSync(file).isSocket() };
  } catch {
    return null;
  }
}

/**
 * `CREWHUB_WORLD_LOOPS_SOCKET`: the socket path, which must exist and be a socket right now (loops is up before the
 * host; a missing socket is a configuration error, not something to wait for). Never guessed: the app's socket lives in
 * its data folder and the host only uses it when told to.
 */
export function validateSocketPath(text: string, probe: (file: string) => PathKind = statPath): string {
  const socket = path.resolve(expandHome(text.trim()));
  const kind = probe(socket);
  if (kind === null) throw new ConfigError(`CREWHUB_WORLD_LOOPS_SOCKET: ${socket} does not exist (is crewhub-loops running, and is this its socket?)`);
  if (!kind.isSocket) throw new ConfigError(`CREWHUB_WORLD_LOOPS_SOCKET: ${socket} is not a Unix socket`);
  return socket;
}

/**
 * `CREWHUB_WORLD_LOOPS_WEB_URL`: where "sign in to crewhub-loops" goes (`health.loopsWebUrl`), as an origin. Unset, it
 * is the loops URL's origin, which is right for the app (API and web on 8091); set, it lets socket mode name another
 * web app (the development instance on 8291). Null when neither is given: the discovery names it from the port found.
 */
export function resolveLoopsWebUrl(text: string | undefined, loopsUrl: string | null): string | null {
  const wanted = (text ?? "").trim();
  if (wanted === "") return loopsUrl === null ? null : new URL(loopsUrl).origin;
  let parsed: URL;
  try {
    parsed = new URL(wanted);
  } catch {
    throw new ConfigError("CREWHUB_WORLD_LOOPS_WEB_URL must be an http(s) URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new ConfigError("CREWHUB_WORLD_LOOPS_WEB_URL must be an http(s) URL");
  return parsed.origin;
}

export interface ServerConfig {
  /** crewhub-loops' URL (`CREWHUB_WORLD_LOOPS_URL`): the TCP transport. Null (with no socket): the host finds loops itself. */
  loopsUrl: string | null;
  /** The Unix socket to read loops over instead of TCP (`CREWHUB_WORLD_LOOPS_SOCKET`); null means TCP or discovery. */
  loopsSocket: string | null;
  /** The origin of loops' web app, for the sign-in link (`CREWHUB_WORLD_LOOPS_WEB_URL`; default: the loops URL's origin; null: from the discovery). */
  loopsWebUrl: string | null;
  /** The Mac app's data folder the discovery reads (`CREWHUB_WORLD_LOOPS_APP_DATA`; default the app's). Never written. */
  appData: string;
  /** The host's own folder for the stored key (`CREWHUB_WORLD_CONFIG_DIR`). */
  configDir: string;
  port: number;
  allowedOrigins: string[];
  production: boolean;
  /** `off` only outside production, and loudly (see `warnings`). */
  pairing: "on" | "off";
  /** The file that keeps the pairing secret across restarts; none means a per-run secret. */
  pairingFile: string | null;
  /** Where a browser reaches the host behind a TLS proxy; https means a `Secure` cookie. */
  publicUrl: string | null;
  /** Lines for the log at start. Never a secret. */
  warnings: string[];
}

export function loadServerConfig(env: Record<string, string | undefined>, probe: (file: string) => PathKind = statPath): ServerConfig {
  const portText = env.CREWHUB_WORLD_PORT ?? "";
  const port = portText === "" ? DEFAULT_PORT : Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError(`CREWHUB_WORLD_PORT must be a port number, got ${portText}`);
  const loopsUrlText = env.CREWHUB_WORLD_LOOPS_URL ?? "";
  const socketText = env.CREWHUB_WORLD_LOOPS_SOCKET ?? "";
  if (loopsUrlText !== "" && socketText.trim() !== "") {
    throw new ConfigError("CREWHUB_WORLD_LOOPS_URL and CREWHUB_WORLD_LOOPS_SOCKET are both set: the host reads loops over TCP or over the Unix socket, not both. Unset one.");
  }
  const loopsUrl = loopsUrlText === "" ? null : loopsUrlText;
  if (loopsUrl !== null && !/^https?:\/\//.test(loopsUrl)) throw new ConfigError("CREWHUB_WORLD_LOOPS_URL must start with http:// or https://");
  const loopsSocket = socketText.trim() === "" ? null : validateSocketPath(socketText, probe);
  // With the socket from the env the web app is the app's default port unless named: a socket has no origin a browser can open.
  const loopsWebUrl = resolveLoopsWebUrl(env.CREWHUB_WORLD_LOOPS_WEB_URL, loopsUrl ?? (loopsSocket === null ? null : DEFAULT_LOOPS_URL));
  const appDataText = (env.CREWHUB_WORLD_LOOPS_APP_DATA ?? "").trim();
  const appData = appDataText === "" ? DEFAULT_APP_DATA : path.resolve(expandHome(appDataText));
  const configDir = configDirOf(env);
  const allowedOrigins = (env.CREWHUB_WORLD_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const production = env.NODE_ENV === "production";
  const pairingText = (env.CREWHUB_WORLD_PAIRING ?? "on").trim().toLowerCase();
  if (pairingText !== "on" && pairingText !== "off") throw new ConfigError(`CREWHUB_WORLD_PAIRING must be on or off, got ${pairingText}`);
  if (pairingText === "off" && production) throw new ConfigError("CREWHUB_WORLD_PAIRING=off is refused with NODE_ENV=production: pairing is what keeps other pages and processes out of the world's data");
  const warnings: string[] = [];
  if (pairingText === "off") {
    warnings.push("WARNING: CREWHUB_WORLD_PAIRING=off: any page or process on this machine can read the world's data through /world-api.");
    warnings.push("WARNING: this is for development only (the Vite proxy); production refuses it.");
  }
  const pairingFileText = (env.CREWHUB_WORLD_PAIRING_FILE ?? "").trim();
  const pairingFile = pairingFileText === "" ? null : path.resolve(pairingFileText);
  const publicUrlText = (env.CREWHUB_WORLD_PUBLIC_URL ?? "").trim();
  let publicUrl: string | null = null;
  if (publicUrlText !== "") {
    let parsed: URL;
    try {
      parsed = new URL(publicUrlText);
    } catch {
      throw new ConfigError("CREWHUB_WORLD_PUBLIC_URL must be an http(s) URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new ConfigError("CREWHUB_WORLD_PUBLIC_URL must be an http(s) URL");
    publicUrl = parsed.origin;
  }
  return { loopsUrl, loopsSocket, loopsWebUrl, appData, configDir, port, allowedOrigins, production, pairing: pairingText, pairingFile, publicUrl, warnings };
}
