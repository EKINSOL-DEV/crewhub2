/**
 * Starts the host from the environment (see `config.ts` and the README):
 *   CREWHUB_WORLD_LOOPS_URL        crewhub-loops' URL over loopback TCP; unset (and no socket): the host finds the Mac app itself
 *   CREWHUB_WORLD_LOOPS_SOCKET     read loops over this Unix socket instead of TCP (never guessed; not together with
 *                                  the URL); `--loops-socket <path>` on the command line is the same
 *   CREWHUB_WORLD_LOOPS_APP_DATA   the Mac app's data folder the discovery reads (default ~/Library/Application Support/be.ekinsol.crewhub)
 *   CREWHUB_WORLD_LOOPS_WEB_URL    the loops web app for the sign-in link (default: the loops URL's origin, or the port found)
 *   CREWHUB_WORLD_KEY_FILE         the key file; unset: the stored key (~/.config/crewhub-world/loops-key), then the old
 *                                  default ~/.config/crewhub-loops/secrets/agent-crewhub-world.key; none: the Connect screen
 *   CREWHUB_WORLD_CONFIG_DIR       the host's own folder for the stored key (default ~/.config/crewhub-world)
 *   CREWHUB_WORLD_PORT             the port on 127.0.0.1 (default 5180)
 *   CREWHUB_WORLD_ALLOWED_ORIGINS  comma list of extra origins (the Vite dev server), default none
 *   CREWHUB_WORLD_PAIRING          on (default) or off (development only; refused in production, logged loudly)
 *   CREWHUB_WORLD_PAIRING_FILE     keeps the pairing secret across restarts (mode 0600); default: a per-run secret
 *   CREWHUB_WORLD_PUBLIC_URL       the URL a browser reaches the host at behind a TLS proxy (https → Secure cookie)
 *   NODE_ENV=production            serve apps/world/dist with an SPA fallback
 * The key is read once and kept in memory. It is never printed.
 *
 * Commands (`node src/main.ts [--loops-socket <path>] <command>`):
 *   (none)                 serve
 *   open [--origin <url>]  prints a one-time pairing link (10 minutes, single use) on stdout: for a host that already
 *                          runs on the port it asks that host (through the run file's mint secret, loopback only), else
 *                          it starts the host and prints the link. `--origin` makes the link open on another origin that
 *                          proxies `/pair` (the Vite dev server): cookies ignore ports, so a browser paired on
 *                          127.0.0.1:5173 is paired on 127.0.0.1:5180 too.
 *   world [--no-open]      `npm run world`: builds the world when apps/world/dist is older than the sources, serves it in
 *                          production mode with pairing on (the secret kept in <config dir>/pairing-secret, so a restart
 *                          keeps every paired browser), mints a link and opens the default browser on it (`--no-open`
 *                          prints it). A second run finds the running host and only opens a new link.
 *   doctor                 a read-only preflight: one line per check (loops, health, key, auth, reads, events, port,
 *                          pairing), ok or the fix; exit 0 only when all pass. Never opens the stream, never writes.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError, type ServerConfig, loadKey, loadServerConfig, worldEnv } from "./config.ts";
import { formatDoctor, runDoctor } from "./doctor.ts";
import { MINT_HEADER, MINT_PATH, createHost } from "./host.ts";
import { createKeyStore } from "./keyStore.ts";
import { loadPairingSecret } from "./pairing.ts";

const log = (line: string) => console.error(`[host] ${line}`);

function readFileOrNull(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

interface Args {
  command: "serve" | "open" | "world" | "doctor";
  origin: string | null;
  /** `--loops-socket <path>`: the same as CREWHUB_WORLD_LOOPS_SOCKET, and wins over it. */
  loopsSocket: string | null;
  /** `world --no-open`: print the link instead of opening the browser. */
  noOpen: boolean;
}

const USAGE = "usage: node apps/host/src/main.ts [--loops-socket <path>] [open [--origin <url>] | world [--no-open] | doctor]";

function parseArgs(argv: string[]): Args {
  const args: Args = { command: "serve", origin: null, loopsSocket: null, noOpen: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === "open" || arg === "world" || arg === "doctor") args.command = arg;
    else if (arg === "--no-open") args.noOpen = true;
    else if (arg === "--origin") {
      const value = argv[i + 1];
      if (value === undefined || !/^https?:\/\//.test(value)) throw new ConfigError("--origin needs an http(s) URL");
      args.origin = new URL(value).origin;
      i += 1;
    } else if (arg === "--loops-socket") {
      const value = argv[i + 1];
      if (value === undefined || value === "" || value.startsWith("--")) throw new ConfigError("--loops-socket needs a path");
      args.loopsSocket = value;
      i += 1;
    } else throw new ConfigError(`unknown argument ${arg} (${USAGE})`);
  }
  return args;
}

/** The run file: the mint secret of the host on this port, mode 0600, in the user's temp folder; removed at exit. */
const runFile = (port: number) => path.join(tmpdir(), `crewhub-world-host-${port}.json`);

/** Asks a host that already runs on the port for a link; null when none answers with that secret. */
async function mintFromRunning(port: number, origin: string | null): Promise<string | null> {
  const text = readFileOrNull(runFile(port));
  if (text === null) return null;
  let secret: string;
  try {
    secret = (JSON.parse(text) as { mintSecret?: string }).mintSecret ?? "";
  } catch {
    return null;
  }
  if (secret === "") return null;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${MINT_PATH}`, { headers: { [MINT_HEADER]: secret }, signal: AbortSignal.timeout(1500) });
    if (!response.ok) return null;
    const body = (await response.json()) as { link?: string };
    if (typeof body.link !== "string") return null;
    return origin === null ? body.link : body.link.replace(/^https?:\/\/[^/]+/, origin);
  } catch {
    return null;
  }
}

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const distDir = path.join(repoRoot, "apps", "world", "dist");

/** The newest mtime under `dir` (files only; node_modules, dist and tests skipped). */
function newestMtime(dir: string): number {
  let newest = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "test" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(full));
    else if (entry.isFile()) {
      try {
        newest = Math.max(newest, statSync(full).mtimeMs);
      } catch {
        // gone meanwhile
      }
    }
  }
  return newest;
}

/** `npm run world`: the built world is older than the sources, or missing → `npm run build`. */
function buildIfStale(): void {
  let built = 0;
  try {
    built = statSync(path.join(distDir, "index.html")).mtimeMs;
  } catch {
    built = 0;
  }
  const sources = Math.max(newestMtime(path.join(repoRoot, "apps", "world", "src")), newestMtime(path.join(repoRoot, "packages")), (() => {
    try {
      return statSync(path.join(repoRoot, "apps", "world", "index.html")).mtimeMs;
    } catch {
      return 0;
    }
  })());
  if (built > 0 && built >= sources) {
    log("apps/world/dist is up to date");
    return;
  }
  log(built === 0 ? "building the world (apps/world/dist is missing)" : "building the world (apps/world/dist is older than the sources)");
  const result = spawnSync("npm", ["run", "build"], { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) throw new ConfigError("the build failed; see above");
}

/** Opens the default browser on the link (macOS `open`, else `xdg-open`); false when that is not possible here. */
function openBrowser(link: string): boolean {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? null : "xdg-open";
  if (command === null) return false;
  try {
    const child = spawn(command, [link], { stdio: "ignore", detached: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

let args: Args;
let config: ServerConfig;
let key: ReturnType<typeof loadKey>;
try {
  args = parseArgs(process.argv.slice(2));
  const base = { ...process.env, ...(args.loopsSocket === null ? {} : { CREWHUB_WORLD_LOOPS_SOCKET: args.loopsSocket }) };
  const env = args.command === "world" ? worldEnv(base) : base;
  if (args.command === "doctor") {
    const report = await runDoctor({ env });
    for (const line of formatDoctor(report)) console.log(line);
    process.exit(report.ok ? 0 : 1);
  }
  config = loadServerConfig(env);
  if (args.command === "open" || args.command === "world") {
    const link = await mintFromRunning(config.port, args.origin);
    if (link !== null) {
      if (args.command === "world" && !args.noOpen && openBrowser(link)) log(`a host already runs on ${config.port}; opened the browser on a new link`);
      else console.log(link);
      process.exit(0);
    }
  }
  if (args.command === "world") buildIfStale();
  key = loadKey(env, readFileOrNull);
  for (const warning of config.warnings) log(warning);
} catch (error) {
  log(error instanceof ConfigError ? error.message : "configuration failed");
  process.exit(1);
}

const staticDir = config.production ? distDir : undefined;
// The host's own folder is 0700 before anything lands in it (the pairing secret of `world` comes before the stored key).
if (args.command === "world") {
  try {
    mkdirSync(config.configDir, { recursive: true, mode: 0o700 });
    chmodSync(config.configDir, 0o700);
  } catch {
    // The pairing secret's own write says what is wrong.
  }
}
const pairingSecret = config.pairingFile === null ? undefined : loadPairingSecret(config.pairingFile);
const mintSecret = randomBytes(32).toString("base64url");
const host = await createHost({
  ...(config.loopsUrl === null ? {} : { loopsUrl: config.loopsUrl }),
  ...(config.loopsSocket === null ? {} : { loopsSocket: config.loopsSocket }),
  ...(config.loopsWebUrl === null ? {} : { loopsWebUrl: config.loopsWebUrl }),
  discovery: { appData: config.appData },
  ...(key === null ? {} : { key: key.key, keyName: key.keyName, keySource: key.source }),
  keyStore: createKeyStore(config.configDir),
  port: config.port,
  allowedOrigins: config.allowedOrigins,
  pairing: config.pairing,
  mintSecret,
  log,
  ...(staticDir === undefined ? {} : { staticDir }),
  ...(pairingSecret === undefined ? {} : { pairingSecret }),
  ...(config.publicUrl === null ? {} : { publicUrl: config.publicUrl }),
});
try {
  writeFileSync(runFile(host.port), JSON.stringify({ pid: process.pid, url: host.url, mintSecret }) + "\n", { mode: 0o600 });
} catch {
  log(`cannot write the run file ${runFile(host.port)}: "open" cannot reach this host while it runs`);
}
const loopsText = config.loopsSocket !== null ? `unix socket ${config.loopsSocket}` : config.loopsUrl !== null ? config.loopsUrl : `looking in ${config.appData}`;
const keyText = key === null ? "no key yet (the world shows the Connect screen)" : `key ${key.keyName} from ${key.file}`;
log(`listening on ${host.url} (loops ${loopsText}, ${keyText}${config.production ? ", serving apps/world/dist" : ""}, pairing ${config.pairing}${config.pairingFile === null ? "" : ", secret kept in " + config.pairingFile})`);
if (args.command === "open" || args.command === "world") {
  if (config.pairing === "off") log("pairing is off: no link needed, open the world directly");
  else {
    const link = host.mintPairLink(args.origin ?? undefined);
    if (args.command === "world" && !args.noOpen && openBrowser(link)) log("opened the browser on the one-time pairing link (10 minutes, once)");
    else {
      log("open this link in the browser to pair it (10 minutes, once):");
      console.log(link);
    }
  }
}

const shutdown = () => {
  try {
    unlinkSync(runFile(host.port));
  } catch {
    // Already gone.
  }
  void host.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
