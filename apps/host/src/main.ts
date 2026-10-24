/**
 * Starts the host from the environment (see `config.ts` and the README):
 *   CREWHUB_WORLD_LOOPS_URL        crewhub-loops' URL over loopback TCP; unset (and no socket): the host finds the Mac app itself
 *   CREWHUB_WORLD_LOOPS_SOCKET     read loops over this Unix socket instead of TCP (never guessed; not together with
 *                                  the URL); `--loops-socket <path>` on the command line is the same
 *   CREWHUB_WORLD_LOOPS_APP_DATA   the Mac app's data folder the discovery reads (default ~/Library/Application Support/be.ekinsol.crewhub)
 *   CREWHUB_WORLD_LOOPS_WEB_URL    the loops web app for the sign-in link (default: the loops URL's origin, or the port found)
 *   CREWHUB_WORLD_KEY_FILE         the key file; unset: the stored key (~/.config/crewhub-world/loops-key), then the old
 *                                  default ~/.config/crewhub-loops/secrets/agent-crewhub-world.key; none: the Connect screen
 *   CREWHUB_WORLD_CONFIG_DIR       the host's own folder for the stored key and the archive memory (default
 *                                  ~/.config/crewhub-world); a leftover loops-session file of the removed sign-in road
 *                                  (round 19) is deleted there on start, with one log line
 *   CREWHUB_WORLD_PORT             the port on 127.0.0.1 (default 5180)
 *   CREWHUB_WORLD_ALLOWED_ORIGINS  comma list of extra origins (the Vite dev server), default none
 *   CREWHUB_WORLD_PAIRING          on (default) or off (development only; refused in production, logged loudly)
 *   CREWHUB_WORLD_PAIRING_FILE     keeps the pairing secret across restarts (mode 0600); default: a per-run secret
 *   CREWHUB_WORLD_PAIRING_IDLE_DAYS a pairing unused this long is refused (0 never); default 30
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
 *   world [--no-open]      `npm run world`: starts the host at once (production mode, pairing on), opens the default
 *                          browser on a one-time link (`--no-open` prints it) and, when apps/world/dist is missing or
 *                          older than the sources (`build.ts`), builds it meanwhile: the browser shows "Building the
 *                          world…" and opens the world when the build is done. Prints the steps as a list with ticks and
 *                          times (loops found, the key, the stream, the snapshot). The pairing secret is kept in
 *                          <config dir>/pairing-secret, so a host restart keeps every paired browser (`worldEnv`). A
 *                          second run finds the running host and only opens a new link.
 *   doctor                 a read-only preflight: one line per check (loops, health, key, auth, reads, events, port,
 *                          pairing), ok or the fix; exit 0 only when all pass. Never opens the stream, never writes.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorld, checkBuild } from "./build.ts";
import { checkoutId } from "./checkout.ts";
import { ConfigError, type ServerConfig, loadKey, loadServerConfig, worldEnv, configFolderLine } from "./config.ts";
import { formatDoctor, runDoctor } from "./doctor.ts";
import { createArchiveStore } from "./archiveStore.ts";
import { removeLeftoverSession } from "./leftovers.ts";
import { nodeWarningLine, runningNodeVersion } from "./nodeVersion.ts";
import { type HostStep, MINT_HEADER, MINT_PATH, createHost } from "./host.ts";
import { createStepPrinter, instructionLine, seconds, stepLine as formatStep } from "./steps.ts";
import { createKeyStore } from "./keyStore.ts";
import { runFilePath } from "./runFile.ts";
import { explainSqliteWarning, openWorldDb, type WorldDb } from "./worldDb.ts";
import { loadPairingSecret } from "./pairing.ts";

const world = process.argv.includes("world");
/** The log; in world mode the step list carries the story and the stream's "loops ok" is a step already. */
const log = (line: string) => {
  if (world && line === "loops ok") return;
  console.error(world ? `  · ${line}` : `[host] ${line}`);
};

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

/** The run file: the mint secret of the host on this port, mode 0600, in the user's temp folder; removed at exit (runFile.ts). */
const runFile = runFilePath;

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

/** The step list of `npm run world`: one line per step, a tick or a cross, the time it took. Quiet otherwise. */
const stepLine = (ok: boolean, text: string, ms?: number) => console.error(formatStep(ok, text, ms));
const stepPrinter = createStepPrinter(() => performance.now());
const printStep = (step: HostStep) => {
  for (const line of stepPrinter.lines(step)) console.error(line);
};

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
let folderLine = "";
let key: ReturnType<typeof loadKey>;
/** `world`: the build check's verdict (the build itself runs after the host listens). */
let build: ReturnType<typeof checkBuild> | null = null;
try {
  args = parseArgs(process.argv.slice(2));
  // Another Node major than .nvmrc's: one warning line and on (the doctor lists it as a check instead).
  const nodeWarn = args.command === "doctor" ? null : nodeWarningLine(runningNodeVersion(process.env));
  if (nodeWarn !== null) log(nodeWarn);
  const base = { ...process.env, ...(args.loopsSocket === null ? {} : { CREWHUB_WORLD_LOOPS_SOCKET: args.loopsSocket }) };
  const env = args.command === "world" ? worldEnv(base) : base;
  if (args.command === "doctor") {
    const report = await runDoctor({ env });
    for (const line of formatDoctor(report)) console.log(line);
    process.exit(report.ok ? 0 : 1);
  }
  config = loadServerConfig(env);
  folderLine = configFolderLine(env);
  if (args.command === "open" || args.command === "world") {
    const link = await mintFromRunning(config.port, args.origin);
    if (link !== null) {
      if (args.command === "world" && !args.noOpen && openBrowser(link)) log(`a host already runs on ${config.port}; opened the browser on a new link`);
      else {
        if (args.command === "world") log(`a host already runs on ${config.port}; open this link in the browser to pair it (10 minutes, once):`);
        console.log(link);
      }
      process.exit(0);
    }
  }
  if (args.command === "world") {
    build = checkBuild(repoRoot, distDir);
    if (build.fresh) stepLine(true, `${build.reason}`, build.ms);
    else console.error(`  … building the world: ${build.reason}`);
  }
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
// Which folder this host keeps its key, archive memory, pairing secret and world database in, and why (round 34).
log(folderLine);
// The sign-in road is gone (round 19; round 28 on feat/world-demo): a session file an older host kept is deleted, said once.
removeLeftoverSession(config.configDir, log);
const pairingSecret = config.pairingFile === null ? undefined : loadPairingSecret(config.pairingFile);
// The world database (round 20): the live town per installation, in the host's own folder. A folder or file that cannot
// be opened is said once; the host then runs without it and every browser keeps its own town, as before.
let worldDb: WorldDb | undefined;
explainSqliteWarning(log);
try {
  worldDb = openWorldDb(config.configDir, { log });
} catch (error) {
  log(`world database: cannot open ${config.configDir}/world.db (${error instanceof Error ? error.message : "unknown error"}); the towns stay in the browsers`);
}
const mintSecret = randomBytes(32).toString("base64url");
const listenStarted = performance.now();
const host = await createHost({
  ...(config.loopsUrl === null ? {} : { loopsUrl: config.loopsUrl }),
  ...(config.loopsSocket === null ? {} : { loopsSocket: config.loopsSocket }),
  ...(config.loopsWebUrl === null ? {} : { loopsWebUrl: config.loopsWebUrl }),
  discovery: { appData: config.appData },
  ...(key === null ? {} : { key: key.key, keyName: key.keyName, keySource: key.source }),
  keyStore: createKeyStore(config.configDir),
  archiveStore: createArchiveStore(config.configDir),
  ...(worldDb === undefined ? {} : { worldDb }),
  port: config.port,
  allowedOrigins: config.allowedOrigins,
  pairing: config.pairing,
  checkout: checkoutId(repoRoot),
  mintSecret,
  log,
  ...(world ? { onStep: printStep } : {}),
  ...(staticDir === undefined ? {} : { staticDir }),
  ...(pairingSecret === undefined ? {} : { pairingSecret }),
  pairingIdleMs: config.pairingIdleDays * 86_400_000,
  ...(config.publicUrl === null ? {} : { publicUrl: config.publicUrl }),
});
if (build !== null && !build.fresh) host.setBuilding(true);
try {
  writeFileSync(runFile(host.port), JSON.stringify({ pid: process.pid, url: host.url, mintSecret }) + "\n", { mode: 0o600 });
} catch {
  log(`cannot write the run file ${runFile(host.port)}: "open" cannot reach this host while it runs`);
}
const loopsText = config.loopsSocket !== null ? `unix socket ${config.loopsSocket}` : config.loopsUrl !== null ? config.loopsUrl : `looking in ${config.appData}`;
// The stored key's agent name is loops' to tell (the check logs it); the file names the others.
// The bot's name is loops' to say (the "accepted" line names it); the file's name is only a guess at it.
const keyText = key === null ? "no key yet: the world shows the Connect screen" : key.source === "stored" ? `the stored key from ${key.file}` : `the key file ${key.file}`;
if (world) stepLine(true, `host listening on ${host.url} (loops ${loopsText}, ${keyText}, pairing ${config.pairing})`, performance.now() - listenStarted);
else log(`listening on ${host.url} (loops ${loopsText}, ${keyText}${config.production ? ", serving apps/world/dist" : ""}, pairing ${config.pairing}${config.pairingFile === null ? "" : ", secret kept in " + config.pairingFile})`);
// The origins the page may write from (round 23): the host's own, CREWHUB_WORLD_ALLOWED_ORIGINS, and what this checkout's
// dev server tells it (devOrigin.ts; one line when it does). Quiet in world mode, where no dev server is expected.
if (!world) {
  const extra = config.allowedOrigins.length === 0 ? "" : `, and from CREWHUB_WORLD_ALLOWED_ORIGINS ${config.allowedOrigins.join(", ")}`;
  log(`origins: the page may write from the host's own (http://127.0.0.1:${host.port}, http://localhost:${host.port})${extra}; this checkout's npm run dev tells the host its loopback origin itself (one line when it does)`);
}
if (args.command === "open" || world) {
  if (config.pairing === "off") log("pairing is off: no link needed, open the world directly");
  else {
    const link = host.mintPairLink(args.origin ?? undefined);
    if (world && !args.noOpen && openBrowser(link)) stepLine(true, "browser opened on the one-time pairing link (10 minutes, once)");
    else {
      if (world) console.error(instructionLine("open this link in the browser to pair it (10 minutes, once):"));
      else log("open this link in the browser to pair it (10 minutes, once):");
      console.log(link);
    }
  }
}
if (build !== null && !build.fresh) {
  // The build runs while the host finds loops, checks the key and opens the stream; the browser shows "Building the
  // world…" until it is done. Vite's lines are kept for a failure.
  const lines: string[] = [];
  const result = await buildWorld(repoRoot, distDir, (line) => lines.push(line));
  if (result.code !== 0) {
    stepLine(false, `the build failed after ${seconds(result.ms)}:`);
    for (const line of lines) console.error(`    ${line}`);
    await host.close();
    process.exit(1);
  }
  host.setBuilding(false);
  stepLine(true, args.noOpen ? "world built; open the link above" : "world built, the browser opens it", result.ms);
}

const shutdown = () => {
  try {
    unlinkSync(runFile(host.port));
  } catch {
    // Already gone.
  }
  void host.close().then(() => {
    worldDb?.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
