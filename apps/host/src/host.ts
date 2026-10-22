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
 * learnt (`archiveStore.ts`), so a loops that will not read its log from the start still shows them on the next start.
 */
import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { HostArchiveState, HostConnection, HostKeyState, HostSnapshotState } from "@crewhub/loops-client";
import { WORLD_API_PREFIX, fillPattern, matchWorldRoute } from "./allowList.ts";
import { type ArchiveStore, normaliseSlugs, plainTime } from "./archiveStore.ts";
import { DEFAULT_LOOPS_URL, type KeySource } from "./config.ts";
import { type Discovery, type DiscoveryInput, type Found, createDiscovery, loopsAnswers, targetText } from "./discovery.ts";
import { checkKey } from "./keyCheck.ts";
import type { KeyStore } from "./keyStore.ts";
import { BACKUP_NAME, TOWN_BODY_LIMIT, TOWN_FORMAT, installationKey, listBackups, readBackupTown, type TownOp, type WorldDb } from "./worldDb.ts";
import { type LoopsClient, createLoopsClient, isUnauthorized } from "./loops.ts";
import { PAIR_PATH_PREFIX, PAIR_REFUSED_HTML, type Pairing, createPairing, pairCookieHeader } from "./pairing.ts";
import { type ArchiveReport, type AssembledSnapshot, SnapshotError, type SnapshotStats, assembleSnapshot } from "./snapshot.ts";
import { type ChatLine, type Session, type SessionStore, createSession, firstLine } from "./session.ts";
import { type HostMessage, type LoopsState, type Upstream, createUpstream } from "./stream.ts";

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
  /**
   * Where the person's chat session is kept (round 12): without a store the host takes no sign-in (`POST /session`
   * answers 503) and shows no bubbles. The cookie never leaves the host; the password never reaches a file or a log.
   */
  sessionStore?: SessionStore;
  /** How long one read of loops may take before it counts as not answering. Default 10 s; tests shorten it. */
  readTimeoutMs?: number;
  /** 0 (the default) picks a free port. */
  port?: number;
  /** Serve this folder (the built world) for every path outside `/world-api`, with `index.html` as the fallback. */
  staticDir?: string;
  /**
   * The steps of a connection as they complete (`npm run world` prints them as a list with ticks and times): loops
   * found, the key's verdict, the stream open, a snapshot served. Given, the host does not log those lines itself.
   */
  onStep?: (step: HostStep) => void;
  /** Reads in flight at most while a snapshot is assembled (default 6). */
  snapshotConcurrency?: number;
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
export const CONNECT_PATH = `${WORLD_API_PREFIX}/connect`;
/** The reason on a key the stream refused after it was accepted (revoked meanwhile, or disabled). */
export const STREAM_REFUSED_REASON = "crewhub-loops refused the key on the event stream (401 or 403): it was revoked or its bot disabled meanwhile. Paste a new access key, or forget this one.";
/** A rejected key is re-checked this often (one health probe, then the key check: well within one probe a minute). */
export const RECHECK_MS = 5 * 60_000;
/** How long health waits for a link in the making before it answers with the states as they are. */
export const HEALTH_WAIT_MS = 1000;

/** One step of the connection, done: for the step list of `npm run world`. `ms` is what the step took, when it was timed. */
export interface HostStep {
  /** `browser`: a paired browser opened the stream at a cursor it already had (a tab back after a host restart). */
  step: "discovery" | "key" | "stream" | "snapshot" | "browser";
  ok: boolean;
  /** One line, in words: "crewhub-loops found via the app's socket …". Never the key. */
  text: string;
  ms?: number;
}

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

/** The host's key and what loops said about it. The text of the key lives here and in the client's closure only. */
interface KeyHolder {
  key: string;
  /** The agent name from the file, or the principal loops answered. */
  name: string;
  source: KeySource;
  /** `unchecked` until loops answered about it; `checking` only while a check runs. */
  state: HostKeyState["state"];
  reason?: string;
}

/** What the host knows about the closed buildings, and where it came from. */
interface ArchiveMemoryState {
  source: HostArchiveState["source"];
  slugs: Set<string>;
  at?: string;
}

/** The link to loops: a client and the one upstream stream, for one target and one key. */
interface Link {
  found: Found;
  client: LoopsClient;
  upstream: Upstream;
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
  let closed = false;
  let building = false;
  const onStep = options.onStep;
  /** A step done: the list (world mode) or the log (serve mode), never both. */
  const step = (kind: HostStep["step"], ok: boolean, text: string, ms?: number) => {
    if (onStep !== undefined) onStep(ms === undefined ? { step: kind, ok, text } : { step: kind, ok, text, ms });
    else log(text);
  };
  // The last snapshot assembled for a tab: for health's `connection.snapshot` (the page says "Reading 12 projects…").
  let snapshotState: HostSnapshotState = { state: "idle" };

  // --- The discovery: where loops is. ---
  const discoveryInput: DiscoveryInput = {
    loopsUrl: options.loopsUrl ?? null,
    loopsSocket: options.loopsSocket ?? null,
    loopsWebUrl: options.loopsWebUrl === undefined ? null : new URL(options.loopsWebUrl).origin,
    appData: options.discovery?.appData ?? "",
    ...(options.discovery?.statPath === undefined ? {} : { statPath: options.discovery.statPath }),
    ...(options.discovery?.readFile === undefined ? {} : { readFile: options.discovery.readFile }),
    ...(options.discovery?.answers === undefined ? {} : { answers: options.discovery.answers }),
  };
  const discoveryStarted = performance.now();
  const discovery: Discovery = createDiscovery(discoveryInput, {
    ...(options.discovery?.intervalMs === undefined ? {} : { intervalMs: options.discovery.intervalMs }),
    log: (line) => (line.startsWith("loops found") ? step("discovery", true, line, performance.now() - discoveryStarted) : log(line)),
    onChange: () => void relink(),
  });

  // --- The key. ---
  let holder: KeyHolder | null =
    options.key === undefined ? null : { key: options.key, name: options.keyName ?? "crewhub-world", source: options.keySource ?? "env", state: "unchecked" };
  const readTimeoutMs = options.readTimeoutMs;
  const clientFor = (found: Found, key: string): LoopsClient => createLoopsClient(found.target, key, readTimeoutMs === undefined ? {} : { readTimeoutMs });

  // --- The closed buildings the host knows. ---
  const remembered = options.archiveStore?.read() ?? null;
  const archive: ArchiveMemoryState = remembered === null ? { source: "none", slugs: new Set() } : { source: "remembered", slugs: new Set(remembered.slugs), at: remembered.at };
  if (remembered !== null) log(`remembered ${remembered.slugs.length} archived project${remembered.slugs.length === 1 ? "" : "s"} from ${options.archiveStore?.file} (learnt ${remembered.at === "" ? "at an unknown time" : plainTime(remembered.at)})`);
  /** Keeps the set (and its source), and writes the file only when the set changed. */
  function rememberArchive(next: Iterable<string>, source: HostArchiveState["source"] | null): void {
    const slugs = normaliseSlugs(next);
    const changed = slugs.join("\n") !== normaliseSlugs(archive.slugs).join("\n");
    archive.slugs = new Set(slugs);
    if (source !== null) archive.source = source;
    if (!changed && archive.at !== undefined) return;
    archive.at = new Date().toISOString();
    const store = options.archiveStore;
    if (store === undefined) return;
    try {
      const found = discovery.current();
      store.save({ slugs, at: archive.at, ...(found === null ? {} : { target: targetText(found.target) }) });
      log(`remembered ${slugs.length} archived project${slugs.length === 1 ? "" : "s"} in ${store.file}`);
    } catch (error) {
      log(`cannot write the archive memory ${store.file}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  // --- loops' version: the first one this run read and the last one, so an upgrade under the host is said (health's
  // `loopsCommitBefore`) and logged once per change; the stream reads it each time it opens after being down.
  const versions: { first?: string; last?: string } = {};
  const sawVersion = (version: string) => {
    versions.first ??= version;
    if (versions.last !== undefined && versions.last !== version) log(`crewhub-loops version ${versions.last} → ${version}: loops was updated under the host, which reads everything again`);
    versions.last = version;
  };

  // --- The person's chat session (round 12, session.ts): off until a person signs in; follows the discovery's road.
  const session: Session | null =
    options.sessionStore === undefined
      ? null
      : createSession({
          store: options.sessionStore,
          log,
          onChat: (line) => {
            for (const tab of tabs.values()) tab.send({ type: "chat", chat: line });
          },
          ...(options.readTimeoutMs === undefined ? {} : { readTimeoutMs: options.readTimeoutMs }),
          ...(options.reconnectMs === undefined ? {} : { reconnectMs: options.reconnectMs }),
        });

  /**
   * Whether the current loops lets the key read the chat: a VIEWER key (`world/viewer-key`, L1: the key's own entry in
   * `GET /api/agents` says `viewer: true`; a loops from before has no such field) whose `GET /api/dm/threads` answers
   * 200. A plain external bot gets 200 there too, with its own (empty) threads, which is why the flag decides.
   */
  let keyReadsChat = false;
  async function readsChat(client: LoopsClient, name: string): Promise<boolean> {
    try {
      const agents = await client.getJson<{ agents?: { id?: unknown; viewer?: unknown }[] }>("/api/agents");
      const mine = agents.status === 200 ? agents.body?.agents?.find((a) => a.id === name) : undefined;
      if (mine?.viewer !== true) return false;
      return (await client.getJson("/api/dm/threads")).status === 200;
    } catch {
      return false;
    }
  }
  /** An agent's `dm.created` on the key's stream: the message read by id with the key, as one chat line; null when not readable. */
  async function chatLineFromKey(client: LoopsClient, payload: Record<string, unknown>): Promise<ChatLine | null> {
    const messageId = payload["messageId"];
    const threadId = payload["threadId"];
    const agentId = payload["agentId"];
    if (typeof messageId !== "string" || typeof threadId !== "string" || typeof agentId !== "string") return null;
    try {
      const { status, body } = await client.getJson<{ message?: { bodyText?: unknown; createdAt?: unknown; author?: { displayName?: unknown } } }>(`/api/dm/messages/${encodeURIComponent(messageId)}`);
      if (status !== 200 || typeof body?.message?.bodyText !== "string") return null;
      const text = firstLine(body.message.bodyText);
      if (text === "") return null;
      const name = body.message.author?.displayName;
      return { agentId, ...(typeof name === "string" ? { agentName: name } : {}), text, at: typeof body.message.createdAt === "string" ? body.message.createdAt : new Date().toISOString(), messageId, threadId };
    } catch {
      return null;
    }
  }

  // --- A rejected key waits (round 8). No stream retries: each was a 401 and a health probe every 30 s. The host waits
  // for a new key, a Forget or a discovery change (every one goes through relink, which cancels the wait), and
  // re-checks the kept key slowly (recheckMs, 5 min by default: one keyless health probe, and only when loops answers
  // the key check, so a bot re-enabled in loops comes back by itself and a loops that is down is never a verdict).
  // At most one probe a minute, as agreed with loops' keeper. Health says when (`connection.key.recheckAt`).
  const recheckMs = options.recheckMs ?? RECHECK_MS;
  let recheckTimer: ReturnType<typeof setTimeout> | null = null;
  let recheckAt: string | undefined;
  function clearRecheck(): void {
    if (recheckTimer !== null) clearTimeout(recheckTimer);
    recheckTimer = null;
    recheckAt = undefined;
  }
  function scheduleRecheck(mine: KeyHolder): void {
    clearRecheck();
    recheckAt = new Date(Date.now() + recheckMs).toISOString();
    recheckTimer = setTimeout(() => {
      recheckTimer = null;
      recheckAt = undefined;
      void recheck(mine);
    }, recheckMs);
    recheckTimer.unref?.();
  }
  async function recheck(mine: KeyHolder): Promise<void> {
    if (closed || holder !== mine || mine.state !== "rejected") return;
    const found = discovery.current();
    if (found === null) return; // the discovery's change relinks by itself
    if (!(await loopsAnswers(found.target))) {
      log(`the kept key ${mine.name} is not re-checked: crewhub-loops does not answer its health; again in ${Math.round(recheckMs / 1000)} s`);
      if (!closed && holder === mine && mine.state === "rejected") scheduleRecheck(mine);
      return;
    }
    if (closed || holder !== mine || mine.state !== "rejected") return;
    log(`re-checking the kept key ${mine.name} (${mine.source}) with crewhub-loops at ${targetText(found.target)}`);
    await relink(true);
  }

  // --- The link and the tabs. ---
  let link: Link | null = null;
  let relinking: Promise<void> = Promise.resolve();
  const scrub = (text: string): string => (holder !== null && holder.key.length > 0 && text.includes(holder.key) ? text.split(holder.key).join("[redacted]") : text);
  interface Tab {
    send: (message: HostMessage) => void;
    cursor: number | null;
    unsubscribe: (() => void) | null;
    /** Whether the tab has seen a link: a switch then means a reset (the tab re-snapshots). */
    linked: boolean;
  }
  const tabs = new Map<ServerResponse, Tab>();
  const streamState = (): HostConnection["stream"]["state"] => (link === null ? "idle" : link.upstream.busy() !== null ? "busy" : link.upstream.state());
  /** The host's own word on its key, on every status a tab gets (the stream's `key`): what health's `connection.key.state` says. */
  const keyWord = (): HostKeyState["state"] => (holder === null ? "none" : holder.state);
  /** A status from the upstream, with the key's word added, as a tab hears it. */
  const withKey = (message: HostMessage): HostMessage => (message.type === "status" ? { ...message, key: keyWord() } : message);
  /** The legacy tri-state the world from before reads: no loops is down, no key or a rejected key is unauthorized. */
  const legacyState = (): LoopsState => {
    if (link !== null) return link.upstream.state();
    if (discovery.current() === null) return "down";
    return "unauthorized";
  };
  const loopsWebUrl = () => discovery.current()?.webUrl ?? discoveryInput.loopsWebUrl ?? (discoveryInput.loopsUrl === null ? DEFAULT_LOOPS_URL : new URL(discoveryInput.loopsUrl).origin);

  function attach(tab: Tab): void {
    if (link === null) {
      tab.send({ type: "status", loops: legacyState(), key: keyWord() });
      return;
    }
    if (tab.linked) tab.send({ type: "reset", reason: "reconnected" });
    tab.unsubscribe = link.upstream.subscribe(tab.linked ? null : tab.cursor, (message) => tab.send(withKey(message)));
    tab.linked = true;
    void link.upstream.start();
  }

  /** Builds the link for the current target and key, after stopping the old one: one upstream stream per host, always. */
  function relink(healthKnown = false): Promise<void> {
    relinking = relinking.then(async () => {
      if (closed) return;
      clearRecheck();
      const found = discovery.current();
      const old = link;
      if (old !== null) {
        link = null;
        for (const tab of tabs.values()) {
          tab.unsubscribe?.();
          tab.unsubscribe = null;
        }
        await old.upstream.stop();
      }
      keyReadsChat = false;
      // The chat session rides the same road as the key: the discovery's target, or none. With a key it waits for the
      // key check below: on a loops whose key reads the chat (the key road) a kept session is never used.
      if (found === null || holder === null) {
        session?.follow(found === null ? null : found.target);
        for (const tab of tabs.values()) attach(tab);
        return;
      }
      const client = clientFor(found, holder.key);
      // `healthKnown`: the re-check probed health a moment ago; a 401 now needs no second probe (the budget).
      const healthy = healthKnown ? async () => true : () => loopsAnswers(found.target);
      const mine = holder;
      const before = mine.state;
      mine.state = "checking";
      snapshotState = { state: "idle" };
      const keyStarted = performance.now();
      const verdict = await checkKey(client, healthy);
      if (closed || holder !== mine || discovery.current() !== found) return;
      if (verdict.state === "rejected") {
        mine.state = "rejected";
        mine.reason = verdict.reason;
        step("key", false, `key ${mine.name} (${mine.source}) rejected by loops at ${targetText(found.target)}: ${scrub(verdict.reason)} (the key is kept; paste a new one or forget it)`, performance.now() - keyStarted);
        for (const tab of tabs.values()) attach(tab);
        scheduleRecheck(mine);
        session?.follow(found.target);
        return;
      }
      if (verdict.state === "ok") {
        mine.state = "ok";
        delete mine.reason;
        mine.name = verdict.name;
        step("key", true, `key ${mine.name} (${mine.source}) accepted by loops at ${targetText(found.target)}`, performance.now() - keyStarted);
        // Does this loops let the key read the chat (a viewer key, round 12)? Then the bubbles come over the key's own
        // stream and no person's session is needed or used; a loops that answers anything else keeps the session road.
        keyReadsChat = await readsChat(client, mine.name);
        if (closed || holder !== mine || discovery.current() !== found) return;
        if (keyReadsChat) log(`the key reads the chat on this crewhub-loops: the agents' answers come over its stream, no sign-in needed`);
        session?.follow(keyReadsChat ? null : found.target);
      } else {
        // Nothing is known about the key: it keeps the state it had (a fresh key stays unchecked), never rejected.
        mine.state = before === "checking" ? "unchecked" : before;
        log(`key ${mine.name} (${mine.source}) ${mine.state}: ${scrub(verdict.reason)}; the stream keeps trying`);
        session?.follow(found.target);
      }
      const upstreamOptions: Parameters<typeof createUpstream>[1] = { log: (line) => log(scrub(line)), healthy, onVersion: sawVersion };
      if (options.bufferSize !== undefined) upstreamOptions.bufferSize = options.bufferSize;
      if (options.retryMs !== undefined) upstreamOptions.retryMs = options.retryMs;
      if (options.reconnectMs !== undefined) upstreamOptions.reconnectMs = options.reconnectMs;
      upstreamOptions.heartbeatMs = heartbeatMs;
      const upstream = createUpstream(client, upstreamOptions);
      link = { found, client, upstream };
      // The host's own ear on its stream, for as long as this link lives: the stream is the second opinion on the key
      // (a confirmed 401/403 is rejected, ok is ok, down says nothing), loops going away sends the discovery looking
      // again on the app's roads, and the archive events keep the memory of the closed buildings.
      const appRoads = discoveryInput.loopsUrl === null && discoveryInput.loopsSocket === null;
      let first = true;
      upstream.subscribe(null, (message) => {
        if (first) {
          first = false;
          return;
        }
        if (link?.upstream !== upstream) return;
        if (message.type === "status") {
          if (message.loops === "unauthorized") {
            if (mine.state !== "rejected") {
              mine.state = "rejected";
              mine.reason = STREAM_REFUSED_REASON;
              log(`key ${mine.name} (${mine.source}) rejected on the stream (the key is kept; paste a new one or forget it)`);
            }
            // The stream stops here: no retry with a key loops refused. The tabs hear "unauthorized" and the slow
            // re-check takes over (see above).
            relinking = relinking.then(async () => {
              if (closed || link?.upstream !== upstream) return;
              link = null;
              for (const tab of tabs.values()) {
                tab.unsubscribe?.();
                tab.unsubscribe = null;
              }
              await upstream.stop();
              for (const tab of tabs.values()) attach(tab);
              if (holder === mine && mine.state === "rejected") scheduleRecheck(mine);
            });
          } else if (message.loops === "ok") {
            if (mine.state !== "ok") {
              mine.state = "ok";
              delete mine.reason;
              log(`key ${mine.name} (${mine.source}) accepted on the stream`);
            }
          } else if (message.stream !== "busy" && appRoads) void discovery.refresh();
          return;
        }
        if (message.type === "event" && keyReadsChat && message.envelope.type === "dm.created" && message.envelope.actor.kind === "agent") {
          void chatLineFromKey(client, message.envelope.payload).then((line) => {
            if (line !== null && link?.upstream === upstream) for (const tab of tabs.values()) tab.send({ type: "chat", chat: line });
          });
          return;
        }
        if (message.type !== "event" || message.envelope.project === null) return;
        const slug = message.envelope.project.slug;
        if (message.envelope.type === "project.archived") rememberArchive([...archive.slugs, slug], null);
        else if (message.envelope.type === "project.restored") rememberArchive([...archive.slugs].filter((s) => s !== slug), null);
      });
      for (const tab of tabs.values()) attach(tab);
      // attempt that finds loops down is no state change the listener hears (the stream starts down).
      const streamStarted = performance.now();
      await upstream.start().then(() => {
        if (link?.upstream !== upstream) return;
        if (upstream.state() === "ok") step("stream", true, `stream open at seq ${upstream.cursor()}`, performance.now() - streamStarted);
        if (upstream.state() === "down" && upstream.busy() === null && appRoads) void discovery.refresh();
      });
    });
    return relinking;
  }

  // The host's own heartbeat while no link exists, so a tab from before never thinks the host is gone.
  const idleBeat = setInterval(() => {
    if (link !== null) return;
    const beat: HostMessage = { type: "heartbeat", seq: 0, ts: new Date().toISOString() };
    for (const tab of tabs.values()) tab.send(beat);
  }, heartbeatMs);

  const allowedHosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...(publicUrl === null ? [] : [publicUrl.host])]);
  const allowedOrigins = () =>
    new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(publicUrl === null ? [] : [publicUrl.origin]), ...(options.allowedOrigins ?? [])]);
  const paired = (req: IncomingMessage) => pairingMode === "off" || pairing.isPaired(req.headers.cookie);
  const mintPairLink = (origin?: string) => `${origin === undefined ? `http://127.0.0.1:${port}` : origin.replace(/\/$/, "")}${PAIR_PATH_PREFIX}${pairing.mintToken()}`;

  /** The connection as health reports it: the states always, the details only when `detailed` (a paired browser). */
  function connection(detailed: boolean): HostConnection {
    const found = discovery.current();
    const out: HostConnection = {
      discovery: { state: found === null ? "searching" : "found" },
      key: { state: holder === null ? "none" : holder.state },
      stream: { state: streamState(), reconnects: link?.upstream.reconnects() ?? 0 },
      archived: { source: archive.source, count: archive.slugs.size, ...(archive.at === undefined ? {} : { at: archive.at }) },
    };
    out.snapshot = snapshotState;
    if (keyReadsChat && link !== null) out.session = { state: "key" };
    else if (session !== null) {
      const who = session.state();
      out.session = detailed ? who : { state: who.state };
    }
    if (recheckAt !== undefined && holder?.state === "rejected") out.key.recheckAt = recheckAt;
    if (found !== null) out.discovery.via = found.via;
    const busy = link?.upstream.busy() ?? null;
    if (busy !== null) out.stream.reason = busy;
    if (!detailed) return out;
    if (found !== null) out.discovery.target = targetText(found.target);
    (out.archived as HostArchiveState).slugs = normaliseSlugs(archive.slugs);
    if (holder !== null) {
      out.key.name = holder.name;
      out.key.source = holder.source;
      if (holder.reason !== undefined) out.key.reason = holder.reason;
    }
    if (link !== null) {
      const cursor = link.upstream.cursor();
      if (cursor >= 0) out.stream.cursor = cursor;
      const lastEventAt = link.upstream.lastEventAt();
      if (lastEventAt !== undefined) out.stream.lastEventAt = lastEventAt;
    }
    return out;
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

  /** Why a data route cannot answer right now: no loops, no key, a rejected key; null when the link is up. */
  function unavailable(): string | null {
    if (link !== null) return null;
    if (discovery.current() === null) return "no_loops";
    if (holder === null) return "no_key";
    return holder.state === "rejected" ? "unauthorized" : "loops_down";
  }

  /** One assembly, with its progress in `snapshotState` as it goes (health shows it to the page). */
  async function assemble(client: LoopsClient, upstream: Upstream): Promise<AssembledSnapshot> {
    snapshotState = { state: "reading", reads: 0 };
    const out = await assembleSnapshot(client, {
      cursor: upstream.cursor(),
      knownArchivedSlugs: upstream.archivedSlugs(),
      rememberedSlugs: archive.slugs,
      observer: holder === null ? null : holder.name,
      onArchive: (report: ArchiveReport) => rememberArchive(report.slugs, report.source),
      ...(options.snapshotConcurrency === undefined ? {} : { concurrency: options.snapshotConcurrency }),
      onProgress: (progress) => {
        if (snapshotState.state !== "reading") return;
        snapshotState = { state: "reading", reads: progress.reads, ...(progress.projects === null ? {} : { projects: progress.projects }) };
      },
    });
    snapshotState = { state: "ready", projects: out.stats.projects, reads: out.stats.reads, ms: Math.round(out.stats.ms) };
    return out;
  }
  const snapshotText = (stats: SnapshotStats) =>
    `snapshot: ${stats.projects} project${stats.projects === 1 ? "" : "s"}, ${stats.reads} reads in ${Math.round(stats.ms)} ms${stats.slowest === null ? "" : ` (slowest ${stats.slowest.path} ${Math.round(stats.slowest.ms)} ms)`}${stats.log.quiet + stats.log.runs > 0 ? `, from the log ${stats.log.quiet} quiet, ${stats.log.runs} run${stats.log.runs === 1 ? "" : "s"}` : ""}${stats.log.complete ? "" : " (the log was not read whole: no quiet handed over)"}`;

  async function snapshot(res: ServerResponse): Promise<void> {
    await relinking;
    const why = unavailable();
    if (why !== null || link === null) {
      sendJson(res, 503, { error: why ?? "loops_down" });
      return;
    }
    const { client, upstream } = link;
    await upstream.start();
    if (upstream.state() !== "ok") {
      sendJson(res, 503, { error: upstream.state() === "unauthorized" ? "unauthorized" : "loops_down" });
      return;
    }
    try {
      // The key's own principal rides along as the observer: the world never shows it as a figure.
      const { snapshot: body, stats } = await assemble(client, upstream);
      sendJson(res, 200, body);
      step("snapshot", true, snapshotText(stats), stats.ms);
    } catch (error) {
      const reason = error instanceof SnapshotError ? error.reason : "loops_down";
      snapshotState = { state: "failed", reason };
      step("snapshot", false, `snapshot failed: ${reason}`);
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
    const send = (message: HostMessage) => {
      const id = message.type === "event" ? `id: ${message.envelope.seq}\n` : "";
      res.write(`${id}data: ${JSON.stringify(message)}\n\n`);
    };
    const tab: Tab = { send, cursor, unsubscribe: null, linked: false };
    tabs.set(res, tab);
    attach(tab);
    // For the step list only (serve mode stays quiet): a tab that comes back at its cursor asks for no snapshot, yet the
    // world is up for it; the list marks that once.
    if (cursor !== null && onStep !== undefined) onStep({ step: "browser", ok: true, text: `a paired browser is back at seq ${cursor}` });
    const end = () => {
      tab.unsubscribe?.();
      tab.unsubscribe = null;
      tabs.delete(res);
    };
    req.on("close", end);
    res.on("close", end);
  }

  async function passthrough(res: ServerResponse, loopsPath: string, query: URLSearchParams): Promise<void> {
    await relinking;
    const why = unavailable();
    if (why !== null || link === null) {
      sendJson(res, 503, { error: why ?? "loops_down" });
      return;
    }
    try {
      const upstreamResponse = await link.client.get(loopsPath, Object.fromEntries(query));
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
      options.keyStore?.forget();
      if (holder !== null) log(`key ${holder.name} (${holder.source}) forgotten`);
      holder = null;
      await relink();
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
    await relinking;
    const found = discovery.current();
    if (found === null) {
      sendJson(res, 503, { error: "no_loops", message: "crewhub-loops is not found yet: open Crewhub.app, then paste again." });
      return;
    }
    const verdict = await checkKey(clientFor(found, pasted), () => loopsAnswers(found.target));
    if (verdict.state === "unreachable") {
      sendJson(res, 503, { error: "loops_down", message: `crewhub-loops did not answer, so nothing is known about the key (${verdict.reason}). Is Crewhub.app open? Then paste again.` });
      return;
    }
    if (verdict.state === "rejected") {
      log(`a pasted key was rejected: ${verdict.reason.split(".")[0]}`);
      sendJson(res, 403, { error: "key_rejected", reason: verdict.reason });
      return;
    }
    let stored = false;
    if (options.keyStore !== undefined) {
      try {
        options.keyStore.save(pasted);
        stored = true;
      } catch (error) {
        log(`cannot store the key in ${options.keyStore.file}: ${error instanceof Error ? error.message : "unknown error"} (it is used for this run only)`);
      }
    }
    holder = { key: pasted, name: verdict.name, source: stored ? "stored" : "env", state: "ok" };
    log(`key ${verdict.name} accepted from the browser${stored ? `, stored in ${options.keyStore?.file}` : ""}`);
    await relink();
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
    const found = discovery.current();
    if (found === null) {
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
      sendJson(res, 409, { error: "town_conflict", message: "Another browser changed the town since this one read it; here is the town as the host has it", rev: outcome.conflict.rev, document: held });
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
      for (const tab of tabs.values()) tab.send({ type: "town", rev: outcome.rev });
    }
    sendJson(res, 200, { ok: true, rev: outcome.rev, document: current, canUndo: outcome.canUndo, canRedo: outcome.canRedo, changed: outcome.changed });
  }

  /**
   * `POST /world-api/session {id, password}` (round 12): a paired browser on an allowed origin signs the host in to
   * crewhub-loops as the person, for the chat's bubbles. The password is read once, handed to loops over loopback and
   * dropped: never stored, logged, echoed or returned; only the session cookie is kept (session.ts). `DELETE` signs
   * out and forgets it. The answers carry the states, never the cookie.
   */
  async function sessionRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.origin === undefined) {
      sendJson(res, 403, { error: "origin_required", message: "Sign-in is for the world's own page: send the Origin header" });
      return;
    }
    if (session === null) {
      req.resume();
      sendJson(res, 503, { error: "no_session_store", message: "This host keeps no chat session (no config folder)" });
      return;
    }
    if (req.method === "POST" && keyReadsChat && link !== null) {
      req.resume();
      sendJson(res, 409, { error: "not_needed", message: "This crewhub-loops lets the world's key read the chat: no sign-in is needed, the bubbles come by themselves." });
      return;
    }
    if (req.method === "DELETE") {
      req.resume();
      await session.forget();
      sendJson(res, 200, { ok: true, connection: connection(true) });
      return;
    }
    if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
      req.resume();
      sendJson(res, 415, { error: "unsupported_media_type", message: 'Send application/json: {"id": "…", "password": "…"}' });
      return;
    }
    const body = await readJsonBody(req, CONNECT_BODY_LIMIT);
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (id === "" || id.length > 64 || password === "" || password.length > 256) {
      sendJson(res, 400, { error: "validation_error", message: "Give the account id and the password you sign in to crewhub-loops with." });
      return;
    }
    await relinking;
    const found = discovery.current();
    if (found === null) {
      sendJson(res, 503, { error: "no_loops", message: "crewhub-loops is not found yet: open Crewhub.app, then sign in again." });
      return;
    }
    const outcome = await session.signIn(found.target, id, password);
    if (outcome.kind === "unreachable") {
      sendJson(res, 503, { error: "loops_down", message: `crewhub-loops did not answer the sign-in (${outcome.reason}). Is Crewhub.app open? Then sign in again.` });
      return;
    }
    if (outcome.kind === "refused") {
      log(`a sign-in for the chat was refused by crewhub-loops: ${outcome.code}`);
      sendJson(res, outcome.status === 429 ? 429 : 401, { error: outcome.code, reason: outcome.message });
      return;
    }
    sendJson(res, 200, { ok: true, connection: connection(true) });
  }

  async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
    if (building) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", [BUILDING_HEADER]: "1" });
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
        await Promise.race([relinking.then(() => link?.upstream.start()), new Promise<void>((resolve) => setTimeout(resolve, HEALTH_WAIT_MS).unref())]);
        const isPaired = paired(req);
        const health: HostHealth = {
          loops: legacyState(),
          keyName: holder === null ? "" : holder.name,
          sharedKey: false,
          loopsWebUrl: loopsWebUrl(),
          paired: isPaired,
          pairing: pairingMode,
          connection: connection(isPaired),
        };
        if (options.checkout !== undefined) health.checkout = options.checkout;
        const found = discovery.current();
        if (found !== null) health.transport = found.target.transport;
        const version = link?.upstream.loopsVersion();
        if (version !== undefined) {
          health.loopsCommit = version;
          if (versions.first !== undefined && versions.first !== version) health.loopsCommitBefore = versions.first;
        }
        if (link !== null && link.upstream.cursor() >= 0) health.cursor = link.upstream.cursor();
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
      case "/connect":
        await connect(req, res);
        return;
      case "/session":
        await sessionRoute(req, res);
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
      log(`request failed: ${error instanceof Error ? scrub(error.message) : "unknown error"}`);
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
  // The discovery's first pass links by itself (onChange); the explicit roads are found at once.
  void discovery.start();

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    mintPairLink,
    connection: () => connection(true),
    setBuilding(value) {
      building = value;
    },
    async close() {
      closed = true;
      clearInterval(idleBeat);
      clearRecheck();
      await session?.stop();
      discovery.stop();
      await relinking;
      if (link !== null) await link.upstream.stop();
      for (const res of tabs.keys()) res.end();
      tabs.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
