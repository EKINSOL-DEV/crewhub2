/* The rig a tool stands on (round 60, T1): a host over a loops, served or behind your Vite, paired. One module for what
   regress.mjs's groups, lib/live.mjs (perf, memory, profile), lib/connectStub.mjs and road2proof.mjs each built by hand:
   the loops side (an in-process fake of `packages/loops-fake`, a real loops by URL and key, or none: a keyless host that
   finds one through a data folder), the loops web stub the host names for the Chat panel, the host (`apps/host`, in
   process) with the tools' quick timings, the serving rule (the host serves a built `apps/world/dist` when the caller
   names it and it is built, else it listens on a port behind your Vite and allows that origin), the pairing step (the
   one-time link opened in a page) and the close order (the host first, then the fake, then the web stub).

   Tooling only: nothing under apps/ or packages/ imports this folder. Loops is only ever a loopback address. The port a
   caller hands in is its own (lib/toolGuard.ts `ownPort` at the command line); the rig never picks a named one. */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLoopsWebStub } from "./loopsWebStub.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The built world the host serves when a caller names it and it is there. */
export const DIST = path.join(REPO, "apps", "world", "dist");
/** Whether a built world stands at `dist` (its index.html). */
export const distBuilt = (dist = DIST) => existsSync(path.join(dist, "index.html"));

/** The host's timings the tools run with: quick retries and a fast heartbeat, so a check waits seconds, not the host's minutes. */
export const TEST_TIMINGS = { retryMs: { min: 100, max: 500 }, reconnectMs: { min: 100, max: 300 }, heartbeatMs: 1000 };

/**
 * Starts the rig and answers it.
 *
 * `loops`: `{ fake: <loops-fake options> }` (an in-process fake on a free port; its key is the host's), `{ url, key?,
 * keyName }` (a real loops; `key` left out for a host that gets its key later) or `{ discovery: { appData, intervalMs? } }`
 * (a keyless host that finds loops through that data folder). `web: true` starts the loops web stub (lib/loopsWebStub.mjs)
 * and names it as the host's `loopsWebUrl`.
 * `serve`: `{ dist, hostPort? }` (the host serves `dist` on `hostPort`, a free one when left out or 0; `dist` must be
 * built), `{ origin, hostPort }` (the host listens on `hostPort` behind the Vite at `origin`, which it allows) or both
 * (`served` on a free port when `dist` is built, so no port of the caller's is taken, else behind the Vite on
 * `hostPort`: regress's rule); `{ hostPort }` alone is a host on that port that allows no other origin (a stub's inner
 * host, a host read over its own address).
 * `pairing`: "on" (the host's default; `pair(page)` opens the one-time link), "off", or `{ secret }` (on, with that
 * pairing secret, so a restarted host keeps every paired browser).
 * `host`: more host options (a key store, a world database, a loops socket, a `keySource`), spread last.
 * `timings`: the host's timings, `TEST_TIMINGS` unless given (`{}` for the host's own, as the measurement tools run).
 * `log`: where the host's lines go; left out, the rig keeps them as `lines`.
 * `onLoops`: told each loops and web stub the rig starts (regress registers their origins for its closing checks).
 *
 * Answers `{ fake, web, host, served, origin, base, lines, pairLink(), pair(page), restart(patch), loopsAgain(options),
 * close() }`: `origin` is the page address's origin (the host's own when it serves, else the Vite's); `host` is the one
 * standing now (a `restart` closes it and starts the next with `patch` over the same options, on the same port when the
 * host serves); `loopsAgain(options)` starts a new fake after the caller closed the old one (an outage, on the same port).
 * `close()` closes the host, then the fake, then the web stub, each failure swallowed.
 */
export async function startRig({ loops, web = false, serve, pairing = "on", host: extra = {}, timings = TEST_TIMINGS, log = null, onLoops = (made) => made } = {}) {
  if (!loops || typeof loops !== "object") throw new Error("startRig: loops is a fake, a url or a discovery");
  if (!serve || typeof serve !== "object") throw new Error("startRig: serve names a dist, an origin and a host port");
  // The serving side is judged before anything starts, so a refusal leaves no fake behind.
  const served = serve.dist !== undefined && distBuilt(serve.dist);
  if (serve.dist !== undefined && !served && serve.origin === undefined) throw new Error(`the host would serve ${serve.dist}: run npm run build first`);
  const hostPort = serve.hostPort ?? 0;
  if (!Number.isInteger(hostPort) || hostPort < 0) throw new Error("startRig: the host port must be a port number");
  const { createHost } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
  let createLoopsFake = null;
  let fake = null;
  const loopsOptions = {};
  if ("fake" in loops) {
    ({ createLoopsFake } = await import(pathToFileURL(path.join(REPO, "packages", "loops-fake", "src", "index.ts")).href));
    fake = onLoops(await createLoopsFake(loops.fake));
    Object.assign(loopsOptions, { loopsUrl: fake.url, key: fake.key, keyName: fake.keyName });
  } else if ("url" in loops) {
    Object.assign(loopsOptions, { loopsUrl: loops.url, ...(loops.key === undefined ? {} : { key: loops.key }), keyName: loops.keyName });
  } else if ("discovery" in loops) {
    loopsOptions.discovery = loops.discovery;
  } else throw new Error("startRig: loops is a fake, a url or a discovery");
  let webStub = null;
  if (web) {
    webStub = onLoops(await createLoopsWebStub());
    loopsOptions.loopsWebUrl = webStub.url;
  }
  const pairingOptions = pairing === "off" ? { pairing: "off" } : pairing === "on" ? {} : { pairingSecret: pairing.secret };
  const lines = [];
  const keep = log ?? ((line) => lines.push(line));
  const base = { ...loopsOptions, ...timings, ...pairingOptions, log: keep, ...extra };
  /** The host's options for the serving side: `port` is the one to keep on a restart while the host serves. */
  const hostOptionsFor = (patch, port) =>
    served
      ? { ...base, ...patch, staticDir: serve.dist, ...(port === undefined ? {} : { port }) }
      : { ...base, ...patch, port: hostPort, ...(serve.origin === undefined ? {} : { allowedOrigins: [serve.origin] }) };
  // Serving beside a Vite origin (regress's rule), the host takes a free port: no port of the caller's is taken, the
  // browser opens the host directly. Serving with no Vite origin named (--preview, the road-2 proof), it takes `hostPort`.
  let host = await createHost(hostOptionsFor({}, served && serve.origin === undefined && hostPort !== 0 ? hostPort : undefined));
  const origin = served ? host.url : (serve.origin ?? host.url);
  const link = () => host.mintPairLink(served ? undefined : serve.origin);
  return {
    get fake() {
      return fake;
    },
    web: webStub,
    get host() {
      return host;
    },
    served,
    origin,
    base: `${origin}/`,
    /** The host's lines, when no `log` was given. */
    lines,
    /** The one-time pairing link for a page on `origin`. */
    pairLink: link,
    /** Pairs the page's context: the one-time link, which lands on `/`. */
    async pair(page) {
      await page.goto(link());
      await page.waitForURL((url) => url.pathname === "/", { timeout: 10000 });
    },
    /** Closes the host and starts the next with `patch` over the same options (the same port while the host serves). */
    async restart(patch = {}) {
      const port = served ? host.port : undefined;
      await host.close().catch(() => undefined);
      host = await createHost(hostOptionsFor(patch, port));
      return host;
    },
    /** A new fake after the old one was closed (an outage): `options` as `loops.fake`, with the old port and key to come back as the same loops. */
    async loopsAgain(options) {
      if (createLoopsFake === null) throw new Error("startRig: loopsAgain needs a fake");
      fake = onLoops(await createLoopsFake(options));
      return fake;
    },
    async close() {
      await host.close().catch(() => undefined);
      if (fake !== null) await fake.close().catch(() => undefined);
      if (webStub !== null) await webStub.close().catch(() => undefined);
    },
  };
}
