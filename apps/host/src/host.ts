/**
 * The host: a small HTTP server on 127.0.0.1 that holds the crewhub-loops key and answers the browser under
 * `/world-api` (plan 3.5, integrator Option A). It reads loops through the allow-list only, shares one upstream
 * stream between every tab, and in production serves the built world with an SPA fallback.
 *
 * Since the spec addendum "a smooth connection" it starts without loops and without a key: a discovery finds the Mac
 * app (or the env names loops), the key comes from a file or from `POST /world-api/connect` (a paired browser pastes
 * it; the host checks it with loops, stores it and switches to it without a restart), and `GET /world-api/health`
 * carries the honest states (`connection`: discovery, key, stream, archived).
 *
 * The key's state is never confused with loops being down: only a definite 401 or 403 from a loops whose health
 * answers makes it `rejected` (the key check, the tail read and the stream alike); a timeout, a refused connection, a
 * 5xx or a restarting loops leaves it `unchecked` or as it was. A rejected stored key stays on disk with its reason
 * until a new one is pasted or `DELETE /world-api/connect` forgets it. The host also remembers the closed buildings it
 * learnt (`archiveMemory.ts`), so a loops that will not read its log from the start still shows them on the next start.
 */
import { timingSafeEqual } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { HostConnection } from "@crewhub/loops-client";
import { WORLD_API_PREFIX, fillPattern, matchWorldRoute } from "./allowList.ts";
import { UPSTREAM_BODY_LIMIT, UpstreamTooLarge, createRepeatLog } from "./bodyCap.ts";
import { DEV_ORIGINS_HEADER, devOriginAcceptedLine, devOriginVerdict } from "./devOrigin.ts";
import type { ArchiveStore } from "./archiveStore.ts";
import type { KeySource } from "./config.ts";
import { type Connection, type ConnectionTimings, type HostStep, createConnection } from "./connection.ts";
import type { DiscoveryInput } from "./discovery.ts";
import type { KeyStore } from "./keyStore.ts";
import { BACKUP_NAME, TOWN_BODY_LIMIT, TOWN_FORMAT, installationKey, listBackups, readBackupTown, type TownOp, type WorldDb, validateTownForHost } from "./worldDb.ts";
import { isUnauthorized } from "./loops.ts";
import { PAIR_PATH_PREFIX, PAIR_REFUSED_HTML, type Pairing, createPairing, pairCookieHeader } from "./pairing.ts";
import type { HostMessage, LoopsState } from "./stream.ts";

export { RECHECK_MS, STREAM_REFUSED_REASON, type ConnectionTimings, type HostStep } from "./connection.ts";

export interface HostOptions {
  /** crewhub-loops' URL (`CREWHUB_WORLD_LOOPS_URL`): read over TCP. Absent, with no socket: the discovery looks for the app. */
  loopsUrl?: string;
  /** Read loops over this Unix socket instead of TCP (`CREWHUB_WORLD_LOOPS_SOCKET`). */
  loopsSocket?: string;
  /** The web app's origin for the sign-in link (`CREWHUB_WORLD_LOOPS_WEB_URL`); default: the URL's origin, or the port found. */
  loopsWebUrl?: string;
  /** The discovery's input when neither URL nor socket is given: the app's data folder, and (tests) the disk and the probe. */
  discovery?: Partial<Omit<DiscoveryInput, "loopsUrl" | "loopsSocket" | "loopsWebUrl">> & { intervalMs?: number };
  /** The checkout id of the repository this host runs from (`checkout.ts`), in health as `checkout`; absent: not said. */
  checkout?: string;
  /** The key at start, when a file had one. Absent: the host waits for `POST /world-api/connect`. */
  key?: string;
  keyName?: string;
  keySource?: KeySource;
  /** Where a pasted key is kept (`POST /world-api/connect`). Absent: a pasted key lives for this run only. */
  keyStore?: KeyStore;
  /** The memory of the closed buildings (`archived.json` beside the key). Absent: remembered for this run only. */
  archiveStore?: ArchiveStore;
  /** The world database (round 20, `world.db` beside the key): the live town per installation. Absent: `/world-api/town` answers 503 and the browsers keep their towns. */
  worldDb?: WorldDb;
  /** How long one read of loops may take before it counts as not answering. Default 10 s; tests shorten it. */
  readTimeoutMs?: number;
  /**
   * The most bytes one body from loops may carry, and one line of its stream (question 15, `bodyCap.ts`): past it the
   * body is cut off, the relay answers 502 `upstream_too_large`, the host's own reads see null and say so once. Default
   * `UPSTREAM_BODY_LIMIT`, 4 MB; tests shorten it.
   */
  upstreamBodyLimit?: number;
  /** 0 (the default) picks a free port. */
  port?: number;
  /** Serve this folder (the built world) for every path outside `/world-api`, with `index.html` as the fallback. */
  staticDir?: string;
  /**
   * The steps of a connection as they complete (`npm run world` prints them as a list with ticks and times): loops
   * found, the key's verdict, the stream open, a snapshot served. Given, the host does not log those lines itself.
   */
  onStep?: (step: HostStep) => void;
  /** Extra origins allowed besides the host's own (the Vite dev server). */
  allowedOrigins?: string[];
  bufferSize?: number;
  /** Backoff after an error upstream (loops away): doubling from min to max. Default 1 s to 30 s. */
  retryMs?: { min: number; max: number };
  /** How long a rejected key waits before the host re-checks it with loops (a health probe first). Default 5 min. */
  recheckMs?: number;
  /** The pause before reconnecting after loops' normal 300 s end: min to max with jitter. Default 1.5 to 3 s. */
  reconnectMs?: { min: number; max: number };
  /** The host's own heartbeat while loops is down. Default 15 s. */
  heartbeatMs?: number;
  /** Server-side log line; never the key. Default: console.error. */
  log?: (line: string) => void;
  /** Pairing (plan 3.5): `on` (the default) gates `/world-api/*` behind the cookie; `off` is for development only. */
  pairing?: "on" | "off";
  /** The secret cookies are signed with (from CREWHUB_WORLD_PAIRING_FILE); a per-run random one when absent. */
  pairingSecret?: Buffer;
  /** Where the browser reaches the host when a TLS proxy stands in front (CREWHUB_WORLD_PUBLIC_URL): https → `Secure` cookie; its origin is allowed. */
  publicUrl?: string;
  /**
   * A loopback-only mint secret: a request `GET /pair-mint` with the header `x-crewhub-world-mint: <secret>` answers a
   * fresh link, so `npm run host -- open` can pair a browser with a host that already runs (main.ts keeps it in a 0600 run file).
   */
  mintSecret?: string;
  /** The clock, for tests of the link's expiry. */
  now?: () => number;
}

export const MINT_PATH = "/pair-mint";
export const MINT_HEADER = "x-crewhub-world-mint";

/**
 * On every HTML page the host serves (review F6): the world may be framed by its own origin only, so a page on another
 * loopback port cannot frame the paired world (a same-site frame would carry the cookie: clickjacking on build mode,
 * Import, Restore, Forget). `frame-ancestors` is the CSP directive for it; `X-Frame-Options` is the same word for older
 * engines. No `default-src` this round: the world loads blob workers, data images and the chat's frame from loops'
 * origin, so a source list needs `'self' blob: data:` plus `frame-src <loops origin>` read from health, and a look at
 * every inline style; that is a change to the page's behaviour, not to its headers.
 */
export const HTML_HEADERS: Readonly<Record<string, string>> = { "content-security-policy": "frame-ancestors 'self'", "x-frame-options": "SAMEORIGIN" };

/** A body past the cap on the same path is said at most this often (question 15). */
const TOO_LARGE_LOG_MS = 5_000;
/** How many tabs may hold the stream at once (review N3); the next one is answered 503 with a reason. */
export const MAX_TABS = 64;
/** How long health waits for a link in the making before it answers with the states as they are. */
export const HEALTH_WAIT_MS = 1000;

/** The header the host puts on the Building page (and nothing else): the page asks for its own URL and reloads once the header is gone. */
export const BUILDING_HEADER = "x-world-building";
/**
 * The page the host serves instead of the world while `npm run world` is still building it. It asks the host every
 * quarter second whether the build is done (a GET of its own URL: the world's index.html carries no `x-world-building`)
 * and reloads then; without scripts it reloads every second. Same-origin, no key, nothing but this page's own URL.
 */
export const BUILDING_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CrewHub World</title><noscript><meta http-equiv="refresh" content="1"></noscript>
<style>html{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;color:GrayText;background:Canvas}p{margin:0;padding:0 16px;text-align:center}</style>
</head><body><p role="status">Building the world… this page opens it as soon as the build is done.</p>
<script>(async()=>{for(;;){await new Promise((r)=>setTimeout(r,250));try{const r=await fetch(location.href,{cache:"no-store"});if(r.ok&&r.headers.get("${BUILDING_HEADER}")===null){location.reload();return;}}catch{}}})();</script>
</body></html>
`;
/** A pasted key: loops' keys are `chl_` and base64url; the fake's are hex. Bounded, one line, no spaces. */
const KEY_SHAPE = /^chl_[A-Za-z0-9_-]{8,200}$/;
const CONNECT_BODY_LIMIT = 4096;

export interface Host {
  url: string;
  port: number;
  /** A one-time link (10 minutes, single use) that pairs the browser opening it. `origin` is the host's own unless given (a Vite dev server that proxies `/pair`). */
  mintPairLink(origin?: string): string;
  /** The states, as health reports them to a paired browser. */
  connection(): HostConnection;
  /** While true (`npm run world` builds the world), every page request gets the "Building the world…" page. */
  setBuilding(building: boolean): void;
  close(): Promise<void>;
}

export interface HostHealth {
  loops: LoopsState;
  keyName: string;
  /** Always false: the builder-key fallback is gone. Kept for the world from before. */
  sharedKey: boolean;
  loopsCommit?: string;
  /** The version the host read first this run, only when loops has answered another since: loops updated under the host. */
  loopsCommitBefore?: string;
  cursor?: number;
  /** The origin of the loops web app for the sign-in link (on the Mac the web app and the API share 8091). */
  loopsWebUrl: string;
  /** How the host reaches loops: over TCP (the URL) or over its Unix socket. Absent while nothing is found. */
  transport?: "tcp" | "unix";
  /** Whether THIS request carries a valid pairing cookie (always true with pairing off). */
  paired: boolean;
  pairing: "on" | "off";
  /** Discovery, key and stream: the states always, the details (paths, names, cursor) for a paired browser only. */
  connection: HostConnection;
  /** The checkout id this host runs from (`checkout.ts`), when it was given one: a dev server of another checkout refuses this host. */
  checkout?: string;
  /** The loopback origins this checkout's dev server told the host this run (`devOrigin.ts`); absent when none. */
  devOrigins?: string[];
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
};

/**
 * A constant-time comparison of two secrets as bytes (review F5): the byte lengths first, so a header with a non-ASCII
 * character (one UTF-16 unit, two bytes) is simply unequal, never a thrown RangeError from `timingSafeEqual`.
 */
export function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(text);
}

/** Reads a small JSON body; null when it is too large, not JSON or not an object. */
function readJsonBody(req: IncomingMessage, limit: number): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    let over = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        over = true;
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (over) return resolve(null);
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        resolve(parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

export async function createHost(options: HostOptions): Promise<Host> {
  const log = options.log ?? ((line: string) => console.error(`[host] ${line}`));
  const staticDir = options.staticDir === undefined ? null : path.resolve(options.staticDir);
  const pairingMode = options.pairing ?? "on";
  const pairingOptions: Parameters<typeof createPairing>[0] = {};
  if (options.pairingSecret !== undefined) pairingOptions.secret = options.pairingSecret;
  if (options.now !== undefined) pairingOptions.now = options.now;
  const pairing: Pairing = createPairing(pairingOptions);
  const publicUrl = options.publicUrl === undefined ? null : new URL(options.publicUrl);
  const secureCookie = publicUrl?.protocol === "https:";
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  let port = 0;
  let building = false;

  // --- The connection to loops (connection.ts): the discovery, the key and its verdicts, the link with the chat path
  // and the archive memory, the snapshot, the tab feed. The host asks it for the states and reads through it.
  // The timings, flat on HostOptions (tests and tools shorten them), as the connection's one object.
  const timings: ConnectionTimings = { heartbeatMs };
  if (options.readTimeoutMs !== undefined) timings.readTimeoutMs = options.readTimeoutMs;
  if (options.bufferSize !== undefined) timings.bufferSize = options.bufferSize;
  if (options.retryMs !== undefined) timings.retryMs = options.retryMs;
  if (options.recheckMs !== undefined) timings.recheckMs = options.recheckMs;
  if (options.reconnectMs !== undefined) timings.reconnectMs = options.reconnectMs;
  const bodyLimit = options.upstreamBodyLimit ?? UPSTREAM_BODY_LIMIT;
  // A body past the cap on one of the connection's reads (connection.ts) or the relay's, said once per path and then at
  // most every 5 s (the same read fails on every attempt until loops is right again); never the body, never the key.
  const sayTooLarge = createRepeatLog(log, TOO_LARGE_LOG_MS);
  const onTooLarge = (path: string, error: UpstreamTooLarge) => sayTooLarge(path, `loops answered GET ${path} ${error.status} with a body past ${bodyLimit} bytes (${error.declared ? "declared" : "read"} ${error.bytes}): cut off, read as no body`);
  const conn: Connection = createConnection({
    discovery: {
      loopsUrl: options.loopsUrl ?? null,
      loopsSocket: options.loopsSocket ?? null,
      loopsWebUrl: options.loopsWebUrl === undefined ? null : new URL(options.loopsWebUrl).origin,
      appData: options.discovery?.appData ?? "",
      ...(options.discovery?.statPath === undefined ? {} : { statPath: options.discovery.statPath }),
      ...(options.discovery?.readFile === undefined ? {} : { readFile: options.discovery.readFile }),
      ...(options.discovery?.answers === undefined ? {} : { answers: options.discovery.answers }),
      ...(options.discovery?.intervalMs === undefined ? {} : { intervalMs: options.discovery.intervalMs }),
    },
    ...(options.key === undefined ? {} : { key: { key: options.key, name: options.keyName ?? "crewhub-world", source: options.keySource ?? "env" } }),
    ...(options.keyStore === undefined ? {} : { keyStore: options.keyStore }),
    ...(options.archiveStore === undefined ? {} : { archiveStore: options.archiveStore }),
    // Question 15: the cap on every body from loops, and the one line per path that says a body past it.
    bodyLimit,
    onTooLarge,
    timings,
    log,
    ...(options.onStep === undefined ? {} : { onStep: options.onStep }),
  });
  const loopsWebUrl = () => conn.words().loopsWebUrl;

  const allowedHosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...(publicUrl === null ? [] : [publicUrl.host])]);
  // The origins the dev server of this checkout told the host this run (devOrigin.ts), beside the configured ones.
  const devOrigins = new Set<string>();
  const allowedOrigins = () =>
    new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(publicUrl === null ? [] : [publicUrl.origin]), ...(options.allowedOrigins ?? []), ...devOrigins]);
  const paired = (req: IncomingMessage) => pairingMode === "off" || pairing.isPaired(req.headers.cookie);
  const mintPairLink = (origin?: string) => `${origin === undefined ? `http://127.0.0.1:${port}` : origin.replace(/\/$/, "")}${PAIR_PATH_PREFIX}${pairing.mintToken()}`;

  /** The connection as health reports it: the states always, the details only when `detailed` (a paired browser). */
  function connection(detailed: boolean): HostConnection {
    return conn.state(detailed);
  }

  /** `GET /pair/<token>`: the cookie and a 303 to `/`, or the refused page. With pairing off the link is not needed: straight to `/`. */
  function pair(res: ServerResponse, token: string): void {
    if (pairingMode === "off") {
      res.writeHead(303, { location: "/", "cache-control": "no-store" });
      res.end();
      return;
    }
    const value = pairing.redeem(token);
    if (value === null) {
      res.writeHead(403, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...HTML_HEADERS });
      res.end(PAIR_REFUSED_HTML);
      return;
    }
    res.writeHead(303, { location: "/", "set-cookie": pairCookieHeader(value, secureCookie), "cache-control": "no-store" });
    res.end();
  }

  /** `GET /pair-mint` from a loopback tool that knows the run file's secret: a fresh link. No Origin (never a browser page). */
  function mint(req: IncomingMessage, res: ServerResponse): void {
    const given = req.headers[MINT_HEADER];
    const expected = options.mintSecret;
    const ok = expected !== undefined && typeof given === "string" && req.headers.origin === undefined && sameSecret(given, expected);
    if (!ok) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    sendJson(res, 200, { link: mintPairLink() });
  }

  /** The Host and Origin guard against DNS rebinding and other sites: 421 for a foreign Host, 403 for a foreign Origin. */
  function guard(req: IncomingMessage, res: ServerResponse): boolean {
    const host = req.headers.host ?? "";
    if (!allowedHosts().has(host)) {
      sendJson(res, 421, { error: "misdirected", message: "The host answers 127.0.0.1 and localhost only" });
      return false;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins().has(origin)) {
      sendJson(res, 403, { error: "origin_forbidden", message: "This origin may not read the world's data" });
      return false;
    }
    return true;
  }

  async function snapshot(res: ServerResponse): Promise<void> {
    const out = await conn.snapshot();
    if (out.kind === "ok") sendJson(res, 200, out.body);
    else if (out.kind === "unavailable") sendJson(res, 503, { error: out.reason });
    else sendJson(res, 503, { error: out.reason, ...(out.message === undefined ? {} : { message: out.message }) });
  }

  function stream(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): void {
    const raw = query.get("cursor");
    // Digits only: Number() read "" as 0, "0x10" as 16 and "1e3" as 1000 (round 53, r51-review H4).
    const cursor = raw === null ? null : /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (cursor !== null && !Number.isSafeInteger(cursor)) {
      sendJson(res, 400, { error: "validation_error", message: "cursor must be a non-negative integer" });
      return;
    }
    if (conn.tabs() >= MAX_TABS) {
      sendJson(res, 503, { error: "too_many_tabs", message: `This host holds ${MAX_TABS} tabs on its stream already; close one` });
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(":ok\n\n");
    const send = (message: HostMessage) => {
      const id = message.type === "event" ? `id: ${message.envelope.seq}\n` : "";
      res.write(`${id}data: ${JSON.stringify(message)}\n\n`);
    };
    const detach = conn.feed({ send, cursor, end: () => res.end() });
    req.on("close", detach);
    res.on("close", detach);
  }

  async function passthrough(res: ServerResponse, loopsPath: string, query: URLSearchParams): Promise<void> {
    const why = await conn.unavailable();
    if (why !== null) {
      sendJson(res, 503, { error: why });
      return;
    }
    try {
      const upstreamResponse = await conn.read(loopsPath, Object.fromEntries(query));
      if (isUnauthorized(upstreamResponse.status)) {
        sendJson(res, 503, { error: "unauthorized" });
        return;
      }
      // loops answers every route, its errors too, as JSON: anything else (a proxy's sign-in page, a wrong loops URL)
      // is not served as it came on the world's own origin (round 53, r51-review H4).
      if (!/^application\/([\w.-]+\+)?json\s*(;|$)/i.test(upstreamResponse.contentType)) {
        sendJson(res, 502, { error: "not_json", message: "crewhub-loops did not answer with JSON" });
        return;
      }
      res.writeHead(upstreamResponse.status, { "content-type": upstreamResponse.contentType, "cache-control": "no-store" });
      res.end(upstreamResponse.text);
    } catch (error) {
      // A body past the cap (question 15): the browser hears what and how big, never the body; said once per path.
      if (error instanceof UpstreamTooLarge) {
        sayTooLarge(loopsPath, `loops answered GET ${loopsPath} ${error.status} with a body past ${bodyLimit} bytes (${error.declared ? "declared" : "read"} ${error.bytes}): cut off, 502 to the page`);
        sendJson(res, 502, { error: "upstream_too_large", limit: error.limit, bytes: error.bytes });
        return;
      }
      sendJson(res, 503, { error: "loops_down" });
    }
  }

  /**
   * `POST /world-api/dev-origin {origin, checkout}` (round 23, devOrigin.ts): this checkout's dev server tells the host
   * the loopback origin it serves the page from, before the pairing gate (a program has no cookie), with the run file's
   * secret in the mint header as its proof of being the same user (round 26). Accepted once per origin, with one log
   * line; told again, silent.
   */
  async function devOrigin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req, CONNECT_BODY_LIMIT);
    const secret = req.headers[MINT_HEADER];
    const verdict = devOriginVerdict({
      body,
      originHeader: req.headers.origin,
      contentType: req.headers["content-type"],
      remoteAddress: req.socket.remoteAddress,
      hostCheckout: options.checkout,
      known: devOrigins,
      // The same-user proof (review F3): the run file's secret, 0600 in the user's temp folder, as `open` sends it.
      sameUser: options.mintSecret !== undefined && typeof secret === "string" && sameSecret(secret, options.mintSecret),
      hasSecret: options.mintSecret !== undefined,
    });
    if (!verdict.ok) {
      sendJson(res, verdict.status, { error: verdict.error, message: verdict.message });
      return;
    }
    if (!devOrigins.has(verdict.origin)) {
      devOrigins.add(verdict.origin);
      log(devOriginAcceptedLine(verdict.origin));
    }
    sendJson(res, 200, { ok: true, origin: verdict.origin, origins: [...devOrigins] });
  }

  /**
   * `POST /world-api/connect {key}`: a paired browser on an allowed origin pastes the key. The host checks it with loops
   * (`GET /api/auth/me` and one board read), refuses a probe, reader or unknown key with the reason, stores an accepted
   * one and switches to it. The key is never logged, echoed or returned. `DELETE` forgets the stored key.
   */
  async function connect(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.origin === undefined) {
      sendJson(res, 403, { error: "origin_required", message: "Connect is for the world's own page: send the Origin header" });
      return;
    }
    if (req.method === "DELETE") {
      req.resume();
      await conn.forgetKey();
      sendJson(res, 200, { ok: true, connection: connection(true) });
      return;
    }
    if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
      req.resume();
      sendJson(res, 415, { error: "unsupported_media_type", message: "Send application/json: {\"key\": \"chl_…\"}" });
      return;
    }
    const body = await readJsonBody(req, CONNECT_BODY_LIMIT);
    const pasted = typeof body?.key === "string" ? body.key.trim() : "";
    if (!KEY_SHAPE.test(pasted)) {
      sendJson(res, 400, { error: "validation_error", message: "That is not an access key: it starts with chl_ and is one line. Copy it from the access-key window in crewhub-loops." });
      return;
    }
    const outcome = await conn.setKey(pasted);
    if (outcome.state === "no_loops") {
      sendJson(res, 503, { error: "no_loops", message: "crewhub-loops is not found yet: open Crewhub.app, then paste again." });
      return;
    }
    if (outcome.state === "unreachable") {
      sendJson(res, 503, { error: "loops_down", message: `crewhub-loops did not answer, so nothing is known about the key (${outcome.reason}). Is Crewhub.app open? Then paste again.` });
      return;
    }
    if (outcome.state === "rejected") {
      sendJson(res, 403, { error: "key_rejected", reason: outcome.reason });
      return;
    }
    sendJson(res, 200, { ok: true, connection: connection(true) });
  }

  /**
   * `GET` and `PUT /world-api/town` (round 20, the world database): the installation's town document. A town belongs to
   * an installation, so without a loops found there is none to name (503); a host that has none yet answers revision 0
   * and no document. `PUT {document, baseRev}` from a paired
   * browser on an allowed origin writes a revision over `baseRev` (0 creates); another browser's revision in between is
   * a 409 with the town as the host has it, never an overwrite. A written revision goes to every tab on the stream as
   * `{type: "town", rev}`. `GET /world-api/town/export` is the document as a file, build mode's format.
   */
  async function town(req: IncomingMessage, res: ServerResponse, exportFile: boolean, backup?: { list: true } | { name: string }): Promise<void> {
    const db = options.worldDb;
    // A read that cannot be answered yet is no error in a browser's console: 200 with no revision and the reason; a
    // write in that state is refused with the same reason.
    if (db === undefined) {
      req.resume();
      if (req.method === "GET" && !exportFile) sendJson(res, 200, { installation: null, rev: null, document: null, reason: "no_world_db" });
      else sendJson(res, 503, { error: "no_world_db", message: "This host keeps no world database; the town stays in the browser." });
      return;
    }
    if (!conn.words().found) {
      req.resume();
      if (req.method === "GET" && !exportFile) sendJson(res, 200, { installation: null, rev: null, document: null, reason: "no_loops" });
      else sendJson(res, 503, { error: "no_loops", message: "crewhub-loops is not found yet, so the town has no installation to belong to." });
      return;
    }
    const installation = installationKey(loopsWebUrl());
    if (backup !== undefined) {
      // Round 21: the backup copies beside the database, and this installation's town inside one, for a restore.
      req.resume();
      const dir = path.dirname(db.file);
      if ("list" in backup) {
        sendJson(res, 200, { installation, backups: listBackups(dir) });
        return;
      }
      if (!BACKUP_NAME.test(backup.name)) {
        sendJson(res, 404, { error: "not_found" });
        return;
      }
      const held = readBackupTown(dir, backup.name, installation);
      if (held === null) {
        sendJson(res, 404, { error: "no_town", message: `${backup.name} holds no town for ${installation}` });
        return;
      }
      let document: unknown;
      try {
        document = JSON.parse(held.document);
      } catch {
        sendJson(res, 500, { error: "town_unreadable", message: `the town of ${installation} in ${backup.name} is not JSON` });
        return;
      }
      sendJson(res, 200, { installation, name: backup.name, rev: held.rev, document });
      return;
    }
    if (req.method === "GET") {
      req.resume();
      const held = db.getTown(installation);
      if (held === null) {
        // No town yet is a normal first contact, not an error: 200 with revision 0 and no document (a 404 would be a
        // console error in every browser that meets a fresh host); the export of nothing stays a 404.
        if (exportFile) sendJson(res, 404, { error: "no_town", installation });
        else sendJson(res, 200, { installation, rev: 0, updatedAt: null, document: null, canUndo: false, canRedo: false });
        return;
      }
      if (exportFile) {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="crewhub-town-r${held.rev}.json"` });
        res.end(held.document);
        return;
      }
      let document: unknown;
      try {
        document = JSON.parse(held.document);
      } catch {
        sendJson(res, 500, { error: "town_unreadable", message: `the stored town of ${installation} is not JSON` });
        return;
      }
      sendJson(res, 200, { installation, rev: held.rev, updatedAt: held.updatedAt, document, canUndo: held.canUndo, canRedo: held.canRedo });
      return;
    }
    if (req.headers.origin === undefined) {
      req.resume();
      sendJson(res, 403, { error: "origin_required", message: "The town is written from the world's own page: send the Origin header" });
      return;
    }
    if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
      req.resume();
      sendJson(res, 415, { error: "unsupported_media_type", message: "Send application/json: {\"document\": {…}, \"baseRev\": n}" });
      return;
    }
    const body = await readJsonBody(req, TOWN_BODY_LIMIT);
    const document = body?.document;
    const baseRev = body?.baseRev;
    const kind = body?.op === undefined ? "commit" : body.op;
    if (body === null || (kind !== "commit" && kind !== "amend" && kind !== "undo" && kind !== "redo")) {
      sendJson(res, 400, { error: "validation_error", message: `The body must be JSON under ${TOWN_BODY_LIMIT} bytes: {op?: commit | amend | undo | redo, document?, baseRev}` });
      return;
    }
    const withDocument = kind === "commit" || kind === "amend";
    if (withDocument && (typeof document !== "object" || document === null || Array.isArray(document) || (document as { format?: unknown }).format !== TOWN_FORMAT)) {
      sendJson(res, 400, { error: "validation_error", message: `A ${kind} needs a document of format ${TOWN_FORMAT} under ${TOWN_BODY_LIMIT} bytes` });
      return;
    }
    if (withDocument) {
      const verdict = validateTownForHost(document);
      if (!verdict.ok) {
        sendJson(res, 400, { error: "validation_error", message: `The document does not validate: ${verdict.reason}` });
        return;
      }
    }
    if (typeof baseRev !== "number" || !Number.isInteger(baseRev) || baseRev < 0) {
      sendJson(res, 400, { error: "validation_error", message: "baseRev must be the revision the document is based on (0 to create)" });
      return;
    }
    const op: TownOp = withDocument ? { kind, document: JSON.stringify(document) } : { kind };
    const outcome = db.applyTown(installation, op, baseRev);
    if (!outcome.ok) {
      let held: unknown = null;
      try {
        held = outcome.conflict.document === null ? null : JSON.parse(outcome.conflict.document);
      } catch {
        held = null;
      }
      const now = db.getTown(installation);
      sendJson(res, 409, { error: "town_conflict", message: "Another browser changed the town since this one read it; here is the town as the host has it", rev: outcome.conflict.rev, document: held, canUndo: now?.canUndo ?? false, canRedo: now?.canRedo ?? false });
      return;
    }
    let current: unknown = null;
    try {
      current = outcome.document === null ? null : JSON.parse(outcome.document);
    } catch {
      current = null;
    }
    if (outcome.changed) {
      log(`town of ${installation}: ${kind}, revision ${outcome.rev}`);
      conn.broadcast({ type: "town", rev: outcome.rev });
    }
    sendJson(res, 200, { ok: true, rev: outcome.rev, document: current, canUndo: outcome.canUndo, canRedo: outcome.canRedo, changed: outcome.changed });
  }

  async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
    if (building) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", [BUILDING_HEADER]: "1", ...HTML_HEADERS });
      res.end(BUILDING_HTML);
      return;
    }
    if (staticDir === null) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const wanted = path.normalize(path.join(staticDir, decoded));
    const inside = wanted === staticDir || wanted.startsWith(staticDir + path.sep);
    let file = inside ? wanted : path.join(staticDir, "index.html");
    let info = inside ? await stat(file).catch(() => null) : null;
    if (info === null || info.isDirectory()) {
      file = path.join(staticDir, "index.html");
      info = await stat(file).catch(() => null);
      if (info === null) {
        sendJson(res, 404, { error: "not_found" });
        return;
      }
    }
    // Opened before the answer starts (round 51, review H1): a file that cannot be read now (a build that removed it
    // after the stat, a mode that refuses the host) throws here, into this request's 500, never into an `error` event
    // nobody listens to, which ended the host.
    const opened = await open(file, "r");
    const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const immutable = /[-.][A-Za-z0-9_-]{8,}\.\w+$/.test(path.basename(file)) && path.dirname(file) !== staticDir;
    res.writeHead(200, {
      "content-type": type,
      "content-length": String(info.size),
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      ...(type.startsWith("text/html") ? HTML_HEADERS : {}),
    });
    // A read that fails later, or a tab that goes away mid-file, ends this answer and closes the file: nothing more.
    await pipeline(opened.createReadStream(), res).catch(() => undefined);
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // On every answer (review F6): nothing the host sends is to be sniffed into another type.
    res.setHeader("x-content-type-options", "nosniff");
    if (!guard(req, res)) return;
    // The Host header passed the guard; the base only serves to parse the path and query.
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const isApi = url.pathname === WORLD_API_PREFIX || url.pathname.startsWith(`${WORLD_API_PREFIX}/`);
    const match = isApi ? matchWorldRoute(url.pathname, url.searchParams) : null;
    const methods = match?.route.methods ?? ["GET"];
    if (!methods.includes(req.method ?? "")) {
      req.resume();
      sendJson(res, 405, { error: "method_not_allowed", message: methods.length === 1 ? "The host answers GET only" : `This route answers ${methods.join(" and ")}` }, { allow: methods.join(", ") });
      return;
    }
    if (url.pathname.startsWith(PAIR_PATH_PREFIX)) {
      pair(res, url.pathname.slice(PAIR_PATH_PREFIX.length));
      return;
    }
    if (url.pathname === MINT_PATH) {
      mint(req, res);
      return;
    }
    if (!isApi) {
      await serveStatic(url.pathname, res);
      return;
    }
    if (match === null) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const { route, params, query } = match;
    // The pairing gate: everything under /world-api but health needs the cookie (the browser sends it same-origin).
    if (route.pattern === "/dev-origin") {
      await devOrigin(req, res);
      return;
    }
    if (route.pattern !== "/health" && !paired(req)) {
      req.resume();
      sendJson(res, 401, { error: "not_paired" });
      return;
    }
    if (route.kind === "loops") {
      await passthrough(res, fillPattern(route.loopsPattern as string, params), query);
      return;
    }
    switch (route.pattern) {
      case "/health": {
        // The states as they are, after a bounded wait for a link in the making: the page's probe gives the host
        // 1.5 s before it takes the host for silent, and a slow loops must never send the world into demo mode.
        await Promise.race([conn.settled(), new Promise<void>((resolve) => setTimeout(resolve, HEALTH_WAIT_MS).unref())]);
        const isPaired = paired(req);
        const words = conn.words();
        const health: HostHealth = {
          loops: words.loops,
          keyName: words.keyName,
          sharedKey: false,
          loopsWebUrl: loopsWebUrl(),
          paired: isPaired,
          pairing: pairingMode,
          connection: connection(isPaired),
        };
        if (options.checkout !== undefined) health.checkout = options.checkout;
        if (devOrigins.size > 0) health.devOrigins = [...devOrigins];
        if (words.transport !== undefined) health.transport = words.transport;
        if (words.version !== undefined) {
          health.loopsCommit = words.version;
          if (words.versionBefore !== undefined) health.loopsCommitBefore = words.versionBefore;
        }
        if (words.cursor !== undefined) health.cursor = words.cursor;
        sendJson(res, 200, health, devOrigins.size > 0 ? { [DEV_ORIGINS_HEADER]: [...devOrigins].join(",") } : {});
        return;
      }
      case "/snapshot":
        await snapshot(res);
        return;
      case "/stream":
        stream(req, res, query);
        return;
      case "/project-groups":
        sendJson(res, 200, { groups: [] });
        return;
      case "/connect":
        await connect(req, res);
        return;
      case "/town":
        await town(req, res, false);
        return;
      case "/town/export":
        await town(req, res, true);
        return;
      case "/town/backups":
        await town(req, res, false, { list: true });
        return;
      case "/town/backups/{name}":
        await town(req, res, false, { name: params["name"] as string });
        return;
      default:
        sendJson(res, 404, { error: "not_found" });
    }
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      log(`request failed: ${error instanceof Error ? conn.scrub(error.message) : "unknown error"}`);
      if (!res.headersSent) sendJson(res, 500, { error: "internal" });
      else res.end();
    });
  });
  server.keepAliveTimeout = 5000;

  await new Promise<void>((resolve, reject) => {
    server.once("error", (error) => {
      // A port in use: the host never was, so its heartbeat must not keep the caller's process open.
      if (!server.listening) void conn.close();
      reject(error);
    });
    server.listen(options.port ?? 0, "127.0.0.1", () => resolve());
  });
  port = (server.address() as AddressInfo).port;
  conn.start();

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    mintPairLink,
    connection: () => connection(true),
    setBuilding(value) {
      building = value;
    },
    async close() {
      await conn.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
