/**
 * Starts the host from the environment (see `config.ts` and the README):
 *   CREWHUB_WORLD_LOOPS_URL        crewhub-loops' URL (default http://127.0.0.1:8091, loopback TCP to Docker Desktop)
 *   CREWHUB_WORLD_KEY_FILE         the key file (default ~/.config/crewhub-loops/secrets/agent-crewhub-world.key;
 *                                  falls back to agent-builder.key in the same folder, with a loud warning)
 *   CREWHUB_WORLD_PORT             the port on 127.0.0.1 (default 5180)
 *   CREWHUB_WORLD_ALLOWED_ORIGINS  comma list of extra origins (the Vite dev server), default none
 *   CREWHUB_WORLD_PAIRING          on (default) or off (development only; refused in production, logged loudly)
 *   CREWHUB_WORLD_PAIRING_FILE     keeps the pairing secret across restarts (mode 0600); default: a per-run secret
 *   CREWHUB_WORLD_PUBLIC_URL       the URL a browser reaches the host at behind a TLS proxy (https → Secure cookie)
 *   NODE_ENV=production            serve apps/world/dist with an SPA fallback
 * The key is read once and kept in memory. It is never printed.
 *
 * `node src/main.ts open [--origin <url>]` prints a one-time pairing link (10 minutes, single use) on stdout: for a host
 * that already runs on the port it asks that host (through the run file's mint secret, loopback only), else it starts
 * the host and prints the link. `--origin` makes the link open on another origin that proxies `/pair` (the Vite dev
 * server): cookies ignore ports, so a browser paired on 127.0.0.1:5173 is paired on 127.0.0.1:5180 too.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError, loadKey, loadServerConfig } from "./config.ts";
import { MINT_HEADER, MINT_PATH, createHost } from "./host.ts";
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
  command: "serve" | "open";
  origin: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: "serve", origin: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === "open") args.command = "open";
    else if (arg === "--origin") {
      const value = argv[i + 1];
      if (value === undefined || !/^https?:\/\//.test(value)) throw new ConfigError("--origin needs an http(s) URL");
      args.origin = new URL(value).origin;
      i += 1;
    } else throw new ConfigError(`unknown argument ${arg} (usage: node apps/host/src/main.ts [open [--origin <url>]])`);
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

let args: Args;
let key: string;
let keyName: string;
let sharedKey: boolean;
let config: ReturnType<typeof loadServerConfig>;
try {
  args = parseArgs(process.argv.slice(2));
  config = loadServerConfig(process.env);
  if (args.command === "open") {
    const link = await mintFromRunning(config.port, args.origin);
    if (link !== null) {
      console.log(link);
      process.exit(0);
    }
  }
  const loaded = loadKey(process.env, readFileOrNull);
  for (const warning of loaded.warnings) log(warning);
  for (const warning of config.warnings) log(warning);
  ({ key, keyName, sharedKey } = loaded);
} catch (error) {
  log(error instanceof ConfigError ? error.message : "configuration failed");
  process.exit(1);
}

const staticDir = config.production ? fileURLToPath(new URL("../../world/dist/", import.meta.url)) : undefined;
const pairingSecret = config.pairingFile === null ? undefined : loadPairingSecret(config.pairingFile);
const mintSecret = randomBytes(32).toString("base64url");
const host = await createHost({
  loopsUrl: config.loopsUrl,
  key,
  keyName,
  sharedKey,
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
log(
  `listening on ${host.url} (loops ${config.loopsUrl}, key ${keyName}${sharedKey ? ", the shared builder key" : ""}${config.production ? ", serving apps/world/dist" : ""}, pairing ${config.pairing}${config.pairingFile === null ? "" : ", secret kept in " + config.pairingFile})`,
);
if (args.command === "open") {
  if (config.pairing === "off") log("pairing is off: no link needed, open the world directly");
  else {
    log("open this link in the browser to pair it (10 minutes, once):");
    console.log(host.mintPairLink(args.origin ?? undefined));
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
