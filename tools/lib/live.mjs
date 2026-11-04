/* Live mode for the measurement tools (perf.mjs, memory.mjs): a crewhub-loops behind a host, and the browser paired
   with it. The loops is an in-process fake (`packages/loops-fake`, a free port, `--fake-scenario` and `--fake-speed`)
   unless `--loops-url` names one (the fake started with `npm run loops:fake -- --port <port>`, or the development
   loops on 8291 to 8293, which needs `--real` too: round 57d) with `--key-file` (its key; read once, never printed). No
   other named port is a target (lib/toolGuard.ts `loopsUrlOption`, the one list in scripts/named-ports.mjs). The host is in-process (`apps/host`): in a
   dev run it listens on `--host-port` behind your Vite (started with CREWHUB_WORLD_PORT=<host-port>) and the browser
   opens your Vite; in a production run (`--preview`) it serves apps/world/dist on `--host-port` (0: a free port) and
   the browser opens the host itself. `--host-port` is required with `--source live` and is never 5180 (the host's
   default, where somebody's real `npm run world` listens) nor any other named port (lib/toolGuard.ts). Pairing stays on, as in production: every context opens a one-time link first.

   Tooling only: nothing under apps/ or packages/ imports this folder. Loops is only ever a loopback address. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { lostIn } from "./chatSoak.mjs";
import { DIST, distBuilt, startRig } from "./rig.mjs";
import { loopsUrlOption } from "./toolGuard.ts";
import { ownPort } from "./toolGuard.ts";

/** The options every tool with a `--source` takes, with their defaults (spread into `cli`'s options). */
// --host-port has no default (round 36): 5180 is the host's default, somebody's real npm run world; a tool names a port of its own.
export const LIVE_OPTIONS = { source: "demo", "loops-url": "", "key-file": "", "fake-scenario": "small-team", "fake-speed": "16", "host-port": "" };
/** The flags every tool with a `--source` takes (spread into `cli`'s flags): `--real` opens the development loops as a `--loops-url`. */
export const LIVE_FLAGS = ["real"];
export const LIVE_USAGE = "[--source demo|live --host-port <port>] [--loops-url <url> --key-file <file> [--real]] [--fake-scenario <id>] [--fake-speed 0|1|4|16]";

/**
 * The host's log as the tool keeps it: the last `keep` lines, each with its time of day, and the running total of the
 * agent messages the host's lost lines count (`chatSoak.mjs` `lostIn`), summed as the lines come in, so lines that
 * roll off the kept ones still count (round 47, the review's F8: the total was read from the capped lines).
 */
export function createHostLog(keep = 2000, now = () => new Date()) {
  const lines = [];
  let lost = 0;
  return {
    lines,
    log(line) {
      lost += lostIn(line);
      lines.push(`${now().toTimeString().slice(0, 8)} ${line}`);
      if (lines.length > keep) lines.splice(0, lines.length - keep);
    },
    lost: () => lost,
  };
}

/**
 * Starts what live mode needs and answers { base, describe, pair(page), close }. `base` is the page address to open
 * (your Vite, or the host serving dist); `pair(page)` opens the one-time pairing link in that page (once per context).
 * `opts` is the cli() result; `preview` says whether the host serves the production build.
 */
export async function startLive(opts, { preview = false, keyReadsChat = false } = {}) {
  if (opts.source !== "live") throw new Error("startLive: --source is not live");
  let loops;
  let fakeOptions = null;
  let loopsUrl = opts["loops-url"];
  if (loopsUrl !== "") {
    const urlVerdict = loopsUrlOption(opts);
    if (!urlVerdict.ok) opts.fail(urlVerdict.reason);
    loopsUrl = urlVerdict.value;
    const keyFile = opts["key-file"];
    if (keyFile === "") opts.fail("--loops-url needs --key-file <file>");
    let key;
    try {
      key = readFileSync(keyFile, "utf8").trim();
    } catch {
      key = "";
    }
    if (key === "") opts.fail(`cannot read the key file ${keyFile}`);
    loops = { url: loopsUrl, key, keyName: path.basename(keyFile).replace(/^agent-/, "").replace(/\.key$/, "") };
  } else {
    const speed = Number(opts["fake-speed"]);
    if (![0, 1, 4, 16].includes(speed)) opts.fail("--fake-speed must be 0, 1, 4 or 16");
    // `keyReadsChat` (round 45, the chat soak): the fake lets the world's key read the chat, as a loops with the
    // viewer key does, so the agents' answers come over road 1 and the tool can write to them (`fake.sendDm`).
    fakeOptions = { scenario: opts["fake-scenario"], speed, heartbeatMs: 5000, ...(keyReadsChat ? { keyReadsChat: true } : {}) };
    loops = { fake: fakeOptions };
  }
  // Behind your Vite the port is the one it proxies to (CREWHUB_WORLD_PORT); with --preview 0 is a free port the browser opens.
  const portVerdict = ownPort(opts["host-port"], "--host-port", { free: preview });
  if (!portVerdict.ok) opts.fail(`${portVerdict.reason}${preview ? "" : " (the port your Vite was started with as CREWHUB_WORLD_PORT)"}`);
  const hostPort = portVerdict.value;
  if (preview && !distBuilt(DIST)) opts.fail("--preview with --source live serves apps/world/dist: run npm run build first");
  // The host's log lines, kept for the run's end (the chat soak prints its chat lines): the last 2000, with the lost
  // messages summed over all of them. The host runs with its own timings here, as in production (`timings: {}`).
  const hostLog = createHostLog(2000);
  const { lines } = hostLog;
  const rig = await startRig({ loops, serve: preview ? { dist: DIST, hostPort } : { origin: opts.origin, hostPort }, timings: {}, log: hostLog.log });
  const { fake, host, origin } = rig;
  const keyName = fake ? fake.keyName : loops.keyName;
  const describe = `live: loops ${fake ? `fake on 127.0.0.1:${fake.port} (${opts["fake-scenario"]}, speed ${opts["fake-speed"]})` : loopsUrl} (key ${keyName}), host on 127.0.0.1:${host.port} ${preview ? "serving apps/world/dist" : `behind the Vite proxy on ${origin} (Vite started with CREWHUB_WORLD_PORT=${host.port})`}`;
  return {
    base: rig.base,
    origin,
    /** The in-process fake (null with --loops-url): the chat soak writes to its agents through `fake.sendDm`. */
    fake,
    /** The host's last 2000 log lines, each with its time of day. */
    lines,
    /** The agent messages the host's log said were lost, over the whole run. */
    lost: hostLog.lost,
    describe,
    /** The host the tool started: its `connection()` tells the upstream stream's state and reconnects (round 27). */
    host,
    /** Pairs the page's tab (round 27, per tab): the one-time link, whose fragment the page exchanges for this tab's bearer. */
    pair: (page) => rig.pair(page),
    close: () => rig.close(),
  };
}
