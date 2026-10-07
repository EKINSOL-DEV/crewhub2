/**
 * The host: a small HTTP server on 127.0.0.1 that holds the crewhub-loops key and answers the browser under
 * `/world-api` (plan 3.5, integrator Option A). It reads loops through the allow-list only, shares one upstream
 * stream between every tab, and in production serves the built world with an SPA fallback.
 */
import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { WORLD_API_PREFIX, fillPattern, matchWorldRoute } from "./allowList.ts";
import { createLoopsClient, isUnauthorized } from "./loops.ts";
import { PAIR_PATH_PREFIX, PAIR_REFUSED_HTML, type Pairing, createPairing, pairCookieHeader } from "./pairing.ts";
import { SnapshotError, assembleSnapshot } from "./snapshot.ts";
import { type HostMessage, type LoopsState, createUpstream } from "./stream.ts";

export interface HostOptions {
  loopsUrl: string;
  key: string;
  keyName: string;
  /** True when the shared builder key is in use (the fallback). */
  sharedKey?: boolean;
  /** 0 (the default) picks a free port. */
  port?: number;
  /** Serve this folder (the built world) for every path outside `/world-api`, with `index.html` as the fallback. */
  staticDir?: string;
  /** Extra origins allowed besides the host's own (the Vite dev server). */
  allowedOrigins?: string[];
  bufferSize?: number;
  retryMs?: { min: number; max: number };
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

export interface Host {
  url: string;
  port: number;
  /** A one-time link (10 minutes, single use) that pairs the browser opening it. `origin` is the host's own unless given (a Vite dev server that proxies `/pair`). */
  mintPairLink(origin?: string): string;
  close(): Promise<void>;
}

export interface HostHealth {
  loops: LoopsState;
  keyName: string;
  sharedKey: boolean;
  loopsCommit?: string;
  cursor?: number;
  /** The origin of the loops URL: the web app for the sign-in link (on the Mac the web app and the API share 8091). */
  loopsWebUrl: string;
  /** Whether THIS request carries a valid pairing cookie (always true with pairing off). */
  paired: boolean;
  pairing: "on" | "off";
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

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(text);
}

export async function createHost(options: HostOptions): Promise<Host> {
  const log = options.log ?? ((line: string) => console.error(`[host] ${line}`));
  const client = createLoopsClient(options.loopsUrl, options.key);
  const upstreamOptions: Parameters<typeof createUpstream>[1] = { log };
  if (options.bufferSize !== undefined) upstreamOptions.bufferSize = options.bufferSize;
  if (options.retryMs !== undefined) upstreamOptions.retryMs = options.retryMs;
  if (options.heartbeatMs !== undefined) upstreamOptions.heartbeatMs = options.heartbeatMs;
  const upstream = createUpstream(client, upstreamOptions);
  const sharedKey = options.sharedKey ?? false;
  const loopsWebUrl = new URL(options.loopsUrl).origin;
  const staticDir = options.staticDir === undefined ? null : path.resolve(options.staticDir);
  const streams = new Set<ServerResponse>();
  const pairingMode = options.pairing ?? "on";
  const pairingOptions: Parameters<typeof createPairing>[0] = {};
  if (options.pairingSecret !== undefined) pairingOptions.secret = options.pairingSecret;
  if (options.now !== undefined) pairingOptions.now = options.now;
  const pairing: Pairing = createPairing(pairingOptions);
  const publicUrl = options.publicUrl === undefined ? null : new URL(options.publicUrl);
  const secureCookie = publicUrl?.protocol === "https:";
  let port = 0;

  const allowedHosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...(publicUrl === null ? [] : [publicUrl.host])]);
  const allowedOrigins = () =>
    new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(publicUrl === null ? [] : [publicUrl.origin]), ...(options.allowedOrigins ?? [])]);
  const paired = (req: IncomingMessage) => pairingMode === "off" || pairing.isPaired(req.headers.cookie);
  const mintPairLink = (origin?: string) => `${origin === undefined ? `http://127.0.0.1:${port}` : origin.replace(/\/$/, "")}${PAIR_PATH_PREFIX}${pairing.mintToken()}`;

  /** `GET /pair/<token>`: the cookie and a 303 to `/`, or the refused page. With pairing off the link is not needed: straight to `/`. */
  function pair(res: ServerResponse, token: string): void {
    if (pairingMode === "off") {
      res.writeHead(303, { location: "/", "cache-control": "no-store" });
      res.end();
      return;
    }
    const value = pairing.redeem(token);
    if (value === null) {
      res.writeHead(403, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
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
    const ok =
      expected !== undefined &&
      typeof given === "string" &&
      req.headers.origin === undefined &&
      given.length === expected.length &&
      timingSafeEqual(Buffer.from(given), Buffer.from(expected));
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
    await upstream.start();
    if (upstream.state() !== "ok") {
      sendJson(res, 503, { error: upstream.state() === "unauthorized" ? "unauthorized" : "loops_down" });
      return;
    }
    try {
      const body = await assembleSnapshot(client, { cursor: upstream.cursor(), knownArchivedSlugs: upstream.archivedSlugs() });
      sendJson(res, 200, body);
    } catch (error) {
      const reason = error instanceof SnapshotError ? error.reason : "loops_down";
      log(`snapshot failed: ${reason}`);
      sendJson(res, 503, { error: reason });
    }
  }

  function stream(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): void {
    const raw = query.get("cursor");
    const cursor = raw === null ? null : Number(raw);
    if (cursor !== null && (!Number.isInteger(cursor) || cursor < 0)) {
      sendJson(res, 400, { error: "validation_error", message: "cursor must be a non-negative integer" });
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(":ok\n\n");
    streams.add(res);
    const send = (message: HostMessage) => {
      const id = message.type === "event" ? `id: ${message.envelope.seq}\n` : "";
      res.write(`${id}data: ${JSON.stringify(message)}\n\n`);
    };
    const unsubscribe = upstream.subscribe(cursor, send);
    void upstream.start();
    const end = () => {
      unsubscribe();
      streams.delete(res);
    };
    req.on("close", end);
    res.on("close", end);
  }

  async function passthrough(res: ServerResponse, loopsPath: string, query: URLSearchParams): Promise<void> {
    try {
      const upstreamResponse = await client.get(loopsPath, Object.fromEntries(query));
      if (isUnauthorized(upstreamResponse.status)) {
        sendJson(res, 503, { error: "unauthorized" });
        return;
      }
      res.writeHead(upstreamResponse.status, { "content-type": upstreamResponse.contentType, "cache-control": "no-store" });
      res.end(upstreamResponse.text);
    } catch {
      sendJson(res, 503, { error: "loops_down" });
    }
  }

  async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
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
    const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const immutable = /[-.][A-Za-z0-9_-]{8,}\.\w+$/.test(path.basename(file)) && path.dirname(file) !== staticDir;
    res.writeHead(200, {
      "content-type": type,
      "content-length": String(info.size),
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
    createReadStream(file).pipe(res);
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!guard(req, res)) return;
    // The Host header passed the guard; the base only serves to parse the path and query.
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const isApi = url.pathname === WORLD_API_PREFIX || url.pathname.startsWith(`${WORLD_API_PREFIX}/`);
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed", message: "The host answers GET only" }, { allow: "GET" });
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
    const match = matchWorldRoute(url.pathname, url.searchParams);
    if (match === null) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const { route, params, query } = match;
    // The pairing gate: everything under /world-api but health needs the cookie (the browser sends it same-origin).
    if (route.pattern !== "/health" && !paired(req)) {
      sendJson(res, 401, { error: "not_paired" });
      return;
    }
    if (route.kind === "loops") {
      await passthrough(res, fillPattern(route.loopsPattern as string, params), query);
      return;
    }
    switch (route.pattern) {
      case "/health": {
        await upstream.start();
        const health: HostHealth = { loops: upstream.state(), keyName: options.keyName, sharedKey, loopsWebUrl, paired: paired(req), pairing: pairingMode };
        const version = upstream.loopsVersion();
        if (version !== undefined) health.loopsCommit = version;
        if (upstream.cursor() >= 0) health.cursor = upstream.cursor();
        sendJson(res, 200, health);
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
      default:
        sendJson(res, 404, { error: "not_found" });
    }
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      log(`request failed: ${error instanceof Error ? client.scrub(error.message) : "unknown error"}`);
      if (!res.headersSent) sendJson(res, 500, { error: "internal" });
      else res.end();
    });
  });
  server.keepAliveTimeout = 5000;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => resolve());
  });
  port = (server.address() as AddressInfo).port;
  void upstream.start();

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    mintPairLink,
    async close() {
      await upstream.stop();
      for (const res of streams) res.end();
      streams.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
