/**
 * The host's connection to crewhub-loops as one module (round 59d, C1): the discovery (where loops is), the key and
 * loops' verdict on it (checked at every link, re-checked slowly when rejected, the stream's 401 as a second opinion),
 * the link (one client, one upstream stream, the chat path of chatPath.ts) and its relink on every change, the
 * memory of the closed buildings (archiveMemory.ts), loops' versions, the shared snapshot assembly and the tab feed
 * (every browser tab subscribed at its cursor, the host's own heartbeat while no link stands). host.ts keeps the HTTP:
 * routes, guard, pairing, static files, the town, and the JSON shapes of health and connect; it asks this module for
 * the states (`state`, `words`), hands it a pasted key (`setKey`, `forgetKey`), reads through it (`read`,
 * `snapshot`) and gives it each tab's stream (`feed`). The timings are one object (`ConnectionTimings`), given by
 * `apps/host/test/testHost.ts` for the tests; the discovery's disk and probe are the discovery's own seam.
 *
 * Tests: `connection.test.ts` and the moved host tests go through this interface against the loops stub, no HTTP;
 * `chatKey`, `connect`, `health`, `e2e` and the fuzzes through the host.
 */
import type { HostConnection, HostKeyState, HostMessage, HostSnapshotState, LoopsState, ChatThreadFact } from "@crewhub/loops-client";
import { createArchiveMemory } from "./archiveMemory.ts";
import type { ArchiveStore } from "./archiveStore.ts";
import { type ChatPath, createChatPath } from "./chatPath.ts";
import { DEFAULT_LOOPS_URL, type KeySource } from "./config.ts";
import { type Discovery, type DiscoveryInput, type Found, createDiscovery, loopsAnswers, targetText } from "./discovery.ts";
import { checkKey } from "./keyCheck.ts";
import type { KeyStore } from "./keyStore.ts";
import { type LoopsClient, type LoopsResponse, createLoopsClient } from "./loops.ts";
import { type ArchiveReport, type AssembledSnapshot, SnapshotError, type SnapshotStats, assembleSnapshot } from "./snapshot.ts";
import { type Upstream, createUpstream } from "./stream.ts";

/** What the stream's 401 or 403 means for a key that was accepted before: health's `connection.key.reason`. */
export const STREAM_REFUSED_REASON = "crewhub-loops refused the key on the event stream (401 or 403): it was revoked or its bot disabled meanwhile. Paste a new access key, or forget this one.";
/** How long a rejected key waits before the host re-checks it with loops (a health probe first). */
export const RECHECK_MS = 5 * 60_000;

/** One step of the connection, done: for the step list of `npm run world`. `ms` is what the step took, when it was timed. */
export interface HostStep {
  /** `browser`: a paired browser opened the stream at a cursor it already had (a tab back after a host restart). */
  step: "discovery" | "key" | "stream" | "snapshot" | "browser";
  ok: boolean;
  /** One line, in words: "crewhub-loops found via the app's socket …". Never the key. */
  text: string;
  ms?: number;
}

/** The timings, one object: the defaults are the host's, tests shorten them through `testHost.ts`. */
export interface ConnectionTimings {
  /** How long one read of loops may take before it counts as not answering. Default 10 s. */
  readTimeoutMs?: number;
  /** The upstream's ring buffer for the tabs' catch-up. Default 2000 envelopes. */
  bufferSize?: number;
  /** Backoff after an error upstream (loops away): doubling from min to max. Default 1 s to 30 s. */
  retryMs?: { min: number; max: number };
  /** How long a rejected key waits before it is re-checked with loops (a health probe first). Default `RECHECK_MS`. */
  recheckMs?: number;
  /** The pause before reconnecting after loops' normal 300 s end: min to max with jitter. Default 1.5 to 3 s. */
  reconnectMs?: { min: number; max: number };
  /** The host's own heartbeat on the tabs' stream while no link stands. Default 15 s. */
  heartbeatMs?: number;
}

export interface ConnectionOptions {
  /** Where loops is: the env's URL or socket, or the app's data folder for the discovery (and, in tests, the disk and the probe). */
  discovery: DiscoveryInput & { intervalMs?: number };
  /** The key at start, when a file had one. Absent: the connection waits for `setKey`. */
  key?: { key: string; name: string; source: KeySource };
  /** Where a pasted key is kept. Absent: a pasted key lives for this run only. */
  keyStore?: KeyStore;
  /** The memory of the closed buildings on disk. Absent: remembered for this run only. */
  archiveStore?: ArchiveStore;
  timings?: ConnectionTimings;
  /** Server-side log line; never the key. */
  log: (line: string) => void;
  /** The steps as they complete (`npm run world` prints them). Given, the connection does not log those lines itself. */
  onStep?: (step: HostStep) => void;
}

/** A browser tab on the stream, as the host hands it over: the connection writes to it and ends it when it closes. */
export interface TabSink {
  send(message: HostMessage): void;
  /** The tab's last seq, or null for a tab that asks for a snapshot first. */
  cursor: number | null;
  /** The host closes: the tab's response ends. */
  end(): void;
}

/** The words health and the routes need beside the states. */
export interface ConnectionWords {
  /** The legacy tri-state the world from before reads: no loops is down, no key or a rejected key is unauthorized. */
  loops: LoopsState;
  key: HostKeyState["state"];
  /** The key's agent name; `""` without a key. */
  keyName: string;
  /** Whether loops is found (the town belongs to an installation only then). */
  found: boolean;
  transport?: "tcp" | "unix";
  /** The origin of loops' web app. */
  loopsWebUrl: string;
  /** loops' version as the stream last read it, and the first one this run when loops was updated under the host. */
  version?: string;
  versionBefore?: string;
  /** The stream's cursor, once it has one. */
  cursor?: number;
}

export type KeyOutcome =
  | { state: "ok"; name: string; stored: boolean }
  | { state: "rejected"; reason: string }
  | { state: "unreachable"; reason: string }
  | { state: "no_loops" };

export type ReadOutcome = { kind: "unavailable"; reason: string } | { kind: "ok"; response: LoopsResponse };

export type SnapshotOutcome =
  | { kind: "ok"; body: unknown; stats: SnapshotStats }
  /** No link, or the stream not up: the reason as the route answers it (`no_loops`, `no_key`, `unauthorized`, `loops_down`). */
  | { kind: "unavailable"; reason: string }
  /** loops' own failure keeps its reason; the host's own says so in `message` (never "loops down" while loops answers). */
  | { kind: "failed"; reason: string; message?: string };

export interface Connection {
  /** Starts the discovery; its first pass links by itself. */
  start(): void;
  /** The states as health reports them: always the states, the details (paths, names, cursor, slugs) only when `detailed`. */
  state(detailed: boolean): HostConnection;
  words(): ConnectionWords;
  /** Resolves once a link in the making has made its first attempt (health waits for it, bounded). */
  settled(): Promise<void>;
  /**
   * One read of loops with the key through the link, after a relink in flight: `unavailable` with why (`no_loops`,
   * `no_key`, `unauthorized`, `loops_down`) when no link stands, else the answer; a read that fails throws as the
   * client does (the route's catch).
   */
  read(path: string, query: Record<string, string>): Promise<ReadOutcome>;
  /** The snapshot: shared with every tab that asks while one assembly runs on the same upstream with no reset since. */
  snapshot(): Promise<SnapshotOutcome>;
  /** A pasted key: checked with loops, stored, switched to. The key is never logged. */
  setKey(key: string): Promise<KeyOutcome>;
  forgetKey(): Promise<void>;
  /** A tab on the stream: a status now, the upstream at its cursor, the threads; returns detach. */
  feed(tab: TabSink): () => void;
  /** Tabs on the stream right now. */
  tabs(): number;
  /** A message of the host's own to every tab (the town's revision, worldDb.ts). */
  broadcast(message: HostMessage): void;
  /** Replaces every occurrence of the key in `text`. */
  scrub(text: string): string;
  close(): Promise<void>;
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

/** The link to loops: a client and the one upstream stream, for one target and one key, with the chat path on it. */
interface Link {
  found: Found;
  client: LoopsClient;
  upstream: Upstream;
  chat: ChatPath;
}

interface Tab {
  sink: TabSink;
  cursor: number | null;
  unsubscribe: (() => void) | null;
  /** Whether the tab has seen a link: a switch then means a reset (the tab re-snapshots). */
  linked: boolean;
}

export function createConnection(options: ConnectionOptions): Connection {
  const { log, onStep } = options;
  const timings = options.timings ?? {};
  const heartbeatMs = timings.heartbeatMs ?? 15_000;
  const recheckMs = timings.recheckMs ?? RECHECK_MS;
  let closed = false;
  /** A step done: the list (world mode) or the log (serve mode), never both. */
  const step = (kind: HostStep["step"], ok: boolean, text: string, ms?: number) => {
    if (onStep !== undefined) onStep(ms === undefined ? { step: kind, ok, text } : { step: kind, ok, text, ms });
    else log(text);
  };
  // The last snapshot assembled for a tab: for health's `connection.snapshot` (the page says "Reading 12 projects…").
  let snapshotState: HostSnapshotState = { state: "idle" };

  // --- The discovery: where loops is. ---
  const { intervalMs, ...discoveryInput } = options.discovery;
  const discoveryStarted = performance.now();
  const discovery: Discovery = createDiscovery(discoveryInput, {
    ...(intervalMs === undefined ? {} : { intervalMs }),
    log: (line) => (line.startsWith("loops found") ? step("discovery", true, line, performance.now() - discoveryStarted) : log(line)),
    onChange: () => void relink(),
  });
  const appRoads = discoveryInput.loopsUrl === null && discoveryInput.loopsSocket === null;

  // --- The key. ---
  let holder: KeyHolder | null = options.key === undefined ? null : { ...options.key, state: "unchecked" };
  const readTimeoutMs = timings.readTimeoutMs;
  const clientFor = (found: Found, key: string): LoopsClient => createLoopsClient(found.target, key, readTimeoutMs === undefined ? {} : { readTimeoutMs });
  const scrub = (text: string): string => (holder !== null && holder.key.length > 0 && text.includes(holder.key) ? text.split(holder.key).join("[redacted]") : text);

  // --- The closed buildings the host knows (archiveMemory.ts): the memory on disk belongs to one loops, judged at
  // every link; the stream's archive events and every snapshot's report keep it.
  const archive = createArchiveMemory({
    ...(options.archiveStore === undefined ? {} : { store: options.archiveStore }),
    targetNow: () => {
      const found = discovery.current();
      return found === null ? null : targetText(found.target);
    },
    log,
  });

  // --- loops' version: the first one this run read and the last one, so an upgrade under the host is said (health's
  // `loopsCommitBefore`) and logged once per change; the stream reads it each time it opens after being down.
  const versions: { first?: string; last?: string } = {};
  const sawVersion = (version: string) => {
    versions.first ??= version;
    if (versions.last !== undefined && versions.last !== version) log(`crewhub-loops version ${versions.last} → ${version}: loops was updated under the host, which reads everything again`);
    versions.last = version;
  };

  // --- The chat over the key (chatPath.ts): one per link, asked after the key check or when the stream accepts the
  // key, fed the stream's dm events, disposed with the link. Its threads go to every tab, whole; its lines go out as
  // `chat` messages (the bubbles). Health reads its verdict (`connection.session`).
  function sendThreads(threads: ChatThreadFact[]): void {
    for (const tab of tabs.values()) tab.sink.send({ type: "threads", threads });
  }
  function chatPathFor(client: LoopsClient, keyName: string): ChatPath {
    // Only for the link that stands, with the key it was built for, while the connection runs: at the check inside
    // relink no link stands yet, and the tabs get the threads as they attach (attach()); a line or a re-read of a link
    // that is gone, or whose key was forgotten or replaced while a check was in flight, is dropped.
    const live = (): boolean => !closed && link?.chat === chat && holder?.name === keyName;
    const chat: ChatPath = createChatPath({
      client,
      keyName,
      log,
      onThreads: (threads) => {
        if (live()) sendThreads(threads);
      },
      onLine: (line) => {
        if (live()) for (const tab of tabs.values()) tab.sink.send({ type: "chat", chat: line });
      },
    });
    return chat;
  }

  // --- A rejected key waits (round 8). No stream retries: each was a 401 and a health probe every 30 s. The host waits
  // for a new key, a Forget or a discovery change (every one goes through relink, which cancels the wait), and
  // re-checks the kept key slowly (recheckMs, 5 min by default: one keyless health probe, and only when loops answers
  // the key check, so a bot re-enabled in loops comes back by itself and a loops that is down is never a verdict).
  // At most one probe a minute, as agreed with loops' keeper. Health says when (`connection.key.recheckAt`).
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
  const tabs = new Map<TabSink, Tab>();
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
      tab.sink.send({ type: "status", loops: legacyState(), key: keyWord() });
      return;
    }
    if (tab.linked) tab.sink.send({ type: "reset", reason: "reconnected" });
    tab.unsubscribe = link.upstream.subscribe(tab.linked ? null : tab.cursor, (message) => tab.sink.send(withKey(message)));
    tab.linked = true;
    // The chat threads' facts (round 24), when the key reads the chat: the tab gets the list as it stands.
    const threads = link.chat.threads();
    if (threads !== null) tab.sink.send({ type: "threads", threads });
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
        old.chat.dispose();
        for (const tab of tabs.values()) {
          tab.unsubscribe?.();
          tab.unsubscribe = null;
        }
        await old.upstream.stop();
      }
      if (found !== null) archive.linked(targetText(found.target));
      if (found === null || holder === null) {
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
        return;
      }
      let chat: ChatPath;
      if (verdict.state === "ok") {
        mine.state = "ok";
        delete mine.reason;
        mine.name = verdict.name;
        step("key", true, `key ${mine.name} (${mine.source}) accepted by loops at ${targetText(found.target)}`, performance.now() - keyStarted);
        // Does this loops let the key read the chat (a viewer key, round 12)? Then the bubbles come over the key's own
        // stream; a loops that answers anything else (an older loops, a plain external bot's key) shows no bubbles, and
        // health says so by leaving `connection.session` out (round 19: the sign-in road is gone).
        chat = chatPathFor(client, mine.name);
        await chat.check();
        if (closed || holder !== mine || discovery.current() !== found) {
          chat.dispose();
          return;
        }
      } else {
        // Nothing is known about the key: it keeps the state it had (a fresh key stays unchecked), never rejected.
        mine.state = before === "checking" ? "unchecked" : before;
        log(`key ${mine.name} (${mine.source}) ${mine.state}: ${scrub(verdict.reason)}; the stream keeps trying`);
        chat = chatPathFor(client, mine.name);
      }
      const upstreamOptions: Parameters<typeof createUpstream>[1] = { log: (line) => log(scrub(line)), healthy, onVersion: sawVersion, heartbeatMs };
      if (timings.bufferSize !== undefined) upstreamOptions.bufferSize = timings.bufferSize;
      if (timings.retryMs !== undefined) upstreamOptions.retryMs = timings.retryMs;
      if (timings.reconnectMs !== undefined) upstreamOptions.reconnectMs = timings.reconnectMs;
      const upstream = createUpstream(client, upstreamOptions);
      link = { found, client, upstream, chat };
      // The connection's own ear on its stream, for as long as this link lives: the stream is the second opinion on
      // the key (a confirmed 401/403 is rejected, ok is ok, down says nothing), loops going away sends the discovery
      // looking again on the app's roads, the dm events feed the chat path and the archive events the memory of the
      // closed buildings. Subscribed with no cursor, so the first message is the stream's current status, not a
      // change: skipped.
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
              chat.dispose();
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
              // The key was never checked with a 200 (loops was not up at the host's start, round 29 High 1): the
              // check's own tail runs now, so health says whether the key reads the chat and the dm gate opens.
              if (chat.reads() === "unknown") void chat.check();
            }
          } else if (message.stream !== "busy" && appRoads) void discovery.refresh();
          return;
        }
        if (message.type !== "event") return;
        // A `dm.*` event the key's stream sees (round 24): the chat path reads the threads again and an agent's message as a line.
        chat.onEvent(message.envelope);
        if (message.envelope.project === null) return;
        archive.heard(message.envelope.type, message.envelope.project.slug);
      });
      for (const tab of tabs.values()) attach(tab);
      // The first attempt decides the states a connect answers with; it is bounded by the read timeout. A first
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
    for (const tab of tabs.values()) tab.sink.send(beat);
  }, heartbeatMs);

  /** Why a data route cannot answer right now: no loops, no key, a rejected key; null when the link is up. */
  function unavailableNow(): string | null {
    if (link !== null) return null;
    if (discovery.current() === null) return "no_loops";
    if (holder === null) return "no_key";
    return holder.state === "rejected" ? "unauthorized" : "loops_down";
  }

  /**
   * The assembly on its way (round 53, r51-review H3). After a reset every open tab asks for a snapshot at once, and each
   * used to read the whole studio again. A `snapshot()` that comes while one runs on the same upstream, with no reset
   * since it began, takes its answer: the snapshot of the moment that assembly started, at its cursor. The tab's stream
   * then replays the events after that cursor from the buffer, or says `reset: cursor` and the tab asks again.
   */
  let shared: { upstream: Upstream; resets: number; result: Promise<AssembledSnapshot> } | null = null;

  /** One assembly, with its progress in `snapshotState` as it goes (health shows it to the page). */
  async function assemble(client: LoopsClient, upstream: Upstream): Promise<AssembledSnapshot> {
    snapshotState = { state: "reading", reads: 0 };
    const out = await assembleSnapshot(client, {
      cursor: upstream.cursor(),
      archived: archive.forSnapshot(),
      observer: holder === null ? null : holder.name,
      onArchive: (report: ArchiveReport) => archive.reported(report),
      onProgress: (progress) => {
        if (snapshotState.state !== "reading") return;
        snapshotState = { state: "reading", reads: progress.reads, ...(progress.projects === null ? {} : { projects: progress.projects }) };
      },
    });
    snapshotState = { state: "ready", projects: out.stats.projects, reads: out.stats.reads, ms: Math.round(out.stats.ms) };
    return out;
  }
  const snapshotText = (stats: SnapshotStats) =>
    `snapshot: ${stats.projects} project${stats.projects === 1 ? "" : "s"}, ${stats.reads} reads in ${Math.round(stats.ms)} ms${stats.slowest === null ? "" : ` (slowest ${stats.slowest.path} ${Math.round(stats.slowest.ms)} ms)`}${stats.log.quiet + stats.log.runs > 0 ? `, from the log ${stats.log.quiet} quiet, ${stats.log.runs} run${stats.log.runs === 1 ? "" : "s"}` : ""}${stats.log.road === "ticket" ? " (the quiet judged per ticket, crewhub-loops filters by ticket)" : ""}${stats.log.complete ? "" : " (the log was not read whole: no quiet handed over)"}`;

  async function snapshot(): Promise<SnapshotOutcome> {
    await relinking;
    const why = unavailableNow();
    if (why !== null || link === null) return { kind: "unavailable", reason: why ?? "loops_down" };
    const { client, upstream } = link;
    await upstream.start();
    if (upstream.state() !== "ok") return { kind: "unavailable", reason: upstream.state() === "unauthorized" ? "unauthorized" : "loops_down" };
    // The key's own principal rides along as the observer: the world never shows it as a figure. One assembly for
    // the tabs that ask while it runs; only the request that started it says the step.
    const resets = upstream.resets();
    const current = shared !== null && shared.upstream === upstream && shared.resets === resets ? shared : null;
    const mine = current ?? { upstream, resets, result: assemble(client, upstream) };
    if (current === null) {
      shared = mine;
      const done = () => {
        if (shared === mine) shared = null;
      };
      mine.result.then(done, done);
    }
    try {
      const { snapshot: body, stats } = await mine.result;
      if (current === null) step("snapshot", true, snapshotText(stats), stats.ms);
      return { kind: "ok", body, stats };
    } catch (error) {
      // loops' own failures keep their reason; anything else (a read the allow-list refused, a bug) is the host's
      // own and says so (review F8), never "loops down" while loops answers.
      const reason = error instanceof SnapshotError ? error.reason : "snapshot_failed";
      const detail = error instanceof SnapshotError ? "" : `: ${scrub(error instanceof Error ? error.message : String(error))}`;
      snapshotState = { state: "failed", reason };
      if (current === null) step("snapshot", false, `snapshot failed: ${reason}${detail}`);
      return { kind: "failed", reason, ...(detail === "" ? {} : { message: `The host could not assemble the snapshot${detail}` }) };
    }
  }

  /** The connection as health reports it: the states always, the details only when `detailed` (a paired browser). */
  function state(detailed: boolean): HostConnection {
    const found = discovery.current();
    // The chat path's verdict (chatPath.ts) in the two words health has used since round 29: the key reads the chat
    // on the link that stands; the question was asked on it (no link: not asked).
    const keyReadsChat = link?.chat.reads() === "yes";
    const chatKnown = link !== null && link.chat.reads() !== "unknown";
    const out: HostConnection = {
      discovery: { state: found === null ? "searching" : "found" },
      key: { state: holder === null ? "none" : holder.state },
      stream: { state: streamState(), reconnects: link?.upstream.reconnects() ?? 0 },
      archived: archive.state(detailed),
    };
    out.snapshot = snapshotState;
    // The chat's road (round 19; round 29): `session: { state: "key" }` when this loops lets the world's key read the
    // chat, so the bubbles come; `{ state: "unknown" }` while the host cannot say yet (no link, the key unchecked or
    // being checked, the question not yet answered on this link); absent when it knows the key does not read it (an
    // older loops, a plain external bot's key, the chat bubbles feature off). A rejected key or none: absent (no road).
    if (keyReadsChat && link !== null) out.session = { state: "key" };
    else if (!chatKnown && holder !== null && holder.state !== "rejected") out.session = { state: "unknown" };
    if (recheckAt !== undefined && holder?.state === "rejected") out.key.recheckAt = recheckAt;
    if (found !== null) out.discovery.via = found.via;
    const busy = link?.upstream.busy() ?? null;
    if (busy !== null) out.stream.reason = busy;
    if (!detailed) return out;
    if (found !== null) out.discovery.target = targetText(found.target);
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

  function words(): ConnectionWords {
    const found = discovery.current();
    const out: ConnectionWords = { loops: legacyState(), key: keyWord(), keyName: holder === null ? "" : holder.name, found: found !== null, loopsWebUrl: loopsWebUrl() };
    if (found !== null) out.transport = found.target.transport;
    const version = link?.upstream.loopsVersion();
    if (version !== undefined) {
      out.version = version;
      if (versions.first !== undefined && versions.first !== version) out.versionBefore = versions.first;
    }
    if (link !== null && link.upstream.cursor() >= 0) out.cursor = link.upstream.cursor();
    return out;
  }

  /**
   * A pasted key (`POST /world-api/connect`, after the route's own checks): checked with loops (`GET /api/auth/me` and
   * one board read), a probe, reader or unknown key refused with the reason, an accepted one stored and switched to.
   */
  async function setKey(pasted: string): Promise<KeyOutcome> {
    await relinking;
    const found = discovery.current();
    if (found === null) return { state: "no_loops" };
    const verdict = await checkKey(clientFor(found, pasted), () => loopsAnswers(found.target));
    if (verdict.state === "unreachable") return { state: "unreachable", reason: verdict.reason };
    if (verdict.state === "rejected") {
      log(`a pasted key was rejected: ${verdict.reason.split(".")[0]}`);
      return { state: "rejected", reason: verdict.reason };
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
    return { state: "ok", name: verdict.name, stored };
  }

  async function forgetKey(): Promise<void> {
    options.keyStore?.forget();
    if (holder !== null) log(`key ${holder.name} (${holder.source}) forgotten`);
    holder = null;
    await relink();
  }

  function feed(sink: TabSink): () => void {
    const tab: Tab = { sink, cursor: sink.cursor, unsubscribe: null, linked: false };
    tabs.set(sink, tab);
    attach(tab);
    // For the step list only (serve mode stays quiet): a tab that comes back at its cursor asks for no snapshot, yet the
    // world is up for it; the list marks that once.
    if (sink.cursor !== null && onStep !== undefined) onStep({ step: "browser", ok: true, text: `a paired browser is back at seq ${sink.cursor}` });
    return () => {
      tab.unsubscribe?.();
      tab.unsubscribe = null;
      tabs.delete(sink);
    };
  }

  return {
    start() {
      // The discovery's first pass links by itself (onChange); the explicit roads are found at once.
      void discovery.start();
    },
    state,
    words,
    settled: () => relinking.then(() => link?.upstream.start()),
    async read(path, query) {
      await relinking;
      const why = unavailableNow();
      if (why !== null || link === null) return { kind: "unavailable", reason: why ?? "loops_down" };
      return { kind: "ok", response: await link.client.get(path, query) };
    },
    snapshot,
    setKey,
    forgetKey,
    feed,
    tabs: () => tabs.size,
    broadcast(message) {
      for (const tab of tabs.values()) tab.sink.send(message);
    },
    scrub,
    async close() {
      closed = true;
      // The chat path first: no threads re-read fires from a closing host while relinking settles.
      link?.chat.dispose();
      clearInterval(idleBeat);
      clearRecheck();
      discovery.stop();
      await relinking;
      if (link !== null) {
        link.chat.dispose();
        await link.upstream.stop();
      }
      for (const tab of tabs.values()) tab.sink.end();
      tabs.clear();
    },
  };
}
