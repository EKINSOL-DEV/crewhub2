/* Live mode for the measurement tools (perf.mjs, memory.mjs): a crewhub-loops behind a host, and the browser paired
   with it. The loops is an in-process fake (`packages/loops-fake`, a free port, `--fake-scenario` and `--fake-speed`)
   unless `--loops-url` names one (the fake started with `npm run loops:fake -- --port <port>`, or the development
   loops on 8291) with `--key-file` (its key; read once, never printed). The host is in-process (`apps/host`): in a
   dev run it listens on `--host-port` behind your Vite (started with CREWHUB_WORLD_PORT=<host-port>) and the browser
   opens your Vite; in a production run (`--preview`) it serves apps/world/dist on `--host-port` (0: a free port) and
   the browser opens the host itself. `--host-port` is required with `--source live` and is never 5180 (the host's
   default, where somebody's real `npm run world` listens) nor the Mac app's (lib/toolGuard.ts). Pairing stays on, as in production: every context opens a one-time link first.

   Tooling only: nothing under apps/ or packages/ imports this folder. Loops is only ever a loopback address. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ownPort } from "./toolGuard.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The options every tool with a `--source` takes, with their defaults (spread into `cli`'s options). */
// --host-port has no default (round 36): 5180 is the host's default, somebody's real npm run world; a tool names a port of its own.
export const LIVE_OPTIONS = { source: "demo", "loops-url": "", "key-file": "", "fake-scenario": "small-team", "fake-speed": "16", "host-port": "" };
export const LIVE_USAGE = "[--source demo|live --host-port <port>] [--loops-url <url> --key-file <file>] [--fake-scenario <id>] [--fake-speed 0|1|4|16]";

/**
 * Starts what live mode needs and answers { base, describe, pair(page), close }. `base` is the page address to open
 * (your Vite, or the host serving dist); `pair(page)` opens the one-time pairing link in that page (once per context).
 * `opts` is the cli() result; `preview` says whether the host serves the production build.
 */
export async function startLive(opts, { preview = false } = {}) {
  if (opts.source !== "live") throw new Error("startLive: --source is not live");
  const { createHost } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
  let fake = null;
  let loopsUrl = opts["loops-url"];
  let key, keyName;
  if (loopsUrl !== "") {
    const parsed = new URL(loopsUrl);
    if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) opts.fail("--loops-url must be a loopback http URL");
    if (["8091", "8000", "9443"].includes(parsed.port)) opts.fail(`--loops-url: port ${parsed.port} is the Mac app's, never a tool's target`);
    loopsUrl = parsed.origin;
    const keyFile = opts["key-file"];
    if (keyFile === "") opts.fail("--loops-url needs --key-file <file>");
    try {
      key = readFileSync(keyFile, "utf8").trim();
    } catch {
      key = "";
    }
    if (key === "") opts.fail(`cannot read the key file ${keyFile}`);
    keyName = path.basename(keyFile).replace(/^agent-/, "").replace(/\.key$/, "");
  } else {
    const { createLoopsFake } = await import(pathToFileURL(path.join(REPO, "packages", "loops-fake", "src", "index.ts")).href);
    const speed = Number(opts["fake-speed"]);
    if (![0, 1, 4, 16].includes(speed)) opts.fail("--fake-speed must be 0, 1, 4 or 16");
    fake = await createLoopsFake({ scenario: opts["fake-scenario"], speed, heartbeatMs: 5000 });
    loopsUrl = fake.url;
    key = fake.key;
    keyName = fake.keyName;
  }
  // Behind your Vite the port is the one it proxies to (CREWHUB_WORLD_PORT); with --preview 0 is a free port the browser opens.
  const portVerdict = ownPort(opts["host-port"], "--host-port", { free: preview });
  if (!portVerdict.ok) opts.fail(`${portVerdict.reason}${preview ? "" : " (the port your Vite was started with as CREWHUB_WORLD_PORT)"}`);
  const hostPort = portVerdict.value;
  const dist = path.join(REPO, "apps", "world", "dist");
  if (preview && !existsSync(path.join(dist, "index.html"))) opts.fail("--preview with --source live serves apps/world/dist: run npm run build first");
  const hostOptions = { loopsUrl, key, keyName, log: () => undefined };
  const host = await createHost(preview ? { ...hostOptions, staticDir: dist, port: hostPort } : { ...hostOptions, port: hostPort, allowedOrigins: [opts.origin] });
  const origin = preview ? host.url : opts.origin;
  const describe = `live: loops ${fake ? `fake on 127.0.0.1:${fake.port} (${opts["fake-scenario"]}, speed ${opts["fake-speed"]})` : loopsUrl} (key ${keyName}), host on 127.0.0.1:${host.port} ${preview ? "serving apps/world/dist" : `behind the Vite proxy on ${origin} (Vite started with CREWHUB_WORLD_PORT=${host.port})`}`;
  return {
    base: `${origin}/`,
    origin,
    describe,
    /** The host the tool started: its `connection()` tells the upstream stream's state and reconnects (round 27). */
    host,
    /** Pairs the page's context: the one-time link, which lands on `/`. */
    async pair(page) {
      await page.goto(host.mintPairLink(preview ? undefined : origin));
      await page.waitForURL((url) => url.pathname === "/", { timeout: 10000 });
    },
    async close() {
      await host.close().catch(() => undefined);
      if (fake) await fake.close().catch(() => undefined);
    },
  };
}
