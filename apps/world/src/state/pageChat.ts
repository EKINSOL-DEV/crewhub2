/* Road 2 of the chat in the page (round 28): the page reads the signed-in person's own conversation from crewhub-loops
   itself, as `packages/loops-client` pageChat.ts spells out (GET only, the four routes, the person's cookie, no header
   of our own, the sealed cursor), and feeds the same `said` store as the host's road (`rememberSaid`: the bubbles, the
   chat mark, Recent answers and the card) and the threads' facts (`rememberThreads`). It runs only when the contract's
   `decideChatRoad` says `page`: the host's key does not read the chat, and the page's own probe answered. Nothing of
   it goes through the host; the host only names the loops web origin (`health.loopsWebUrl`, the same origin the API
   is on).

   The runner is pure in its inputs (the fetch, the clock, hidden and online, the stores' two writers), so a test drives
   it in milliseconds; the page's wiring (`startPageChat`) hands it the browser's. The store keeps what the panel and
   the tools read: the probe's verdict, the loops origin asked, whether the poll runs, how many polls, the last failure. */
import { useSyncExternalStore } from "react";
import {
  POLL_MS,
  REPROBE_MS,
  originSetting,
  pollDelay,
  pollPageChat,
  probePageChat,
  type ChatLine,
  type ChatThreadFact,
  type FetchLike,
  type HostHealth,
  type PageProbe,
} from "@crewhub/loops-client";
import { decideChatRoad, type ChatRoad } from "./chatRoad.ts";
import { rememberSaid } from "./said.ts";
import { loopsWebUrl } from "./source.ts";
import { rememberThreads } from "./threads.ts";

export interface PageChatState {
  /** The probe's last verdict; `unknown` before it ran (and on the key road, where it never runs). */
  probe: PageProbe;
  /** The loops origin the page asks (the host's `loopsWebUrl`, origin only); null before a host named one. */
  origin: string | null;
  /** The road as the contract decides it from the host's word and the probe. */
  road: ChatRoad;
  /** Whether the poll loop runs right now. */
  polling: boolean;
  /** Polls made since the page opened, and lines they brought. */
  polls: number;
  lines: number;
  /** The last poll's or probe's failure, in words; null when the last one answered. */
  failure: string | null;
  /** When the last poll answered (ms since the epoch); null before one. */
  lastPollAt: number | null;
}

const INITIAL: PageChatState = { probe: "unknown", origin: null, road: "none", polling: false, polls: 0, lines: 0, failure: null, lastPollAt: null };

let current: PageChatState = INITIAL;
const listeners = new Set<() => void>();
function publish(next: Partial<PageChatState>): void {
  current = { ...current, ...next };
  for (const listener of listeners) listener();
}

export const subscribePageChat = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getPageChat = () => current;
export function usePageChat(): PageChatState {
  return useSyncExternalStore(subscribePageChat, getPageChat, getPageChat);
}
/** Forgets everything (the tests, a new source). */
export function resetPageChat(): void {
  current = INITIAL;
  for (const listener of listeners) listener();
}

/** The host's word on its key: true where health says the key reads the chat, false where it says another state, null where it says nothing. */
export function hostKeyReadsChat(health: Pick<HostHealth, "connection"> | null | undefined): boolean | null {
  const state = health?.connection?.session?.state;
  if (state === undefined) return null;
  return state === "key";
}

/** The origin the page asks: the loops web origin the host names (the API is on the same origin), never anything else. */
export function loopsOriginOf(health: Pick<HostHealth, "loopsWebUrl"> | null | undefined): string {
  return new URL(loopsWebUrl(health as HostHealth | null | undefined)).origin;
}

/**
 * The page's own words for the probe's verdict, with the exact setting value where it applies (round 28, r28-road2's
 * supply to the contract's words: r28-session owns the final text per road; these say what the probe can tell).
 */
export function pageProbeWords(probe: PageProbe, loopsOrigin: string | null, pageOrigin: string): string {
  switch (probe) {
    case "on":
      return "This page reads the chat itself: you are signed in to crewhub-loops in this browser and the world's origin is set there, so the agents' answers show as bubbles and the world keeps nothing.";
    case "signed-out":
      return "crewhub-loops answers this page but you are not signed in to crewhub-loops in this browser: sign in there (the Chat panel's frame, or the app) and the answers show as bubbles here.";
    case "origin-not-set":
      return `crewhub-loops${loopsOrigin ? ` at ${loopsOrigin}` : ""} does not answer this page's origin: set ${originSetting(pageOrigin)} on crewhub-loops and restart it (a crewhub-loops from before that setting cannot).`;
    case "unreachable":
      return `crewhub-loops${loopsOrigin ? ` at ${loopsOrigin}` : ""} did not answer this page.`;
    default:
      return "";
  }
}

export interface PageChatRunnerOptions {
  loopsOrigin: string;
  hostKeyReadsChat: boolean | null;
  fetch?: FetchLike;
  /** The page's clock and timers (injected by the tests). */
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => () => void;
  hidden?: () => boolean;
  online?: () => boolean;
  onLine?: (line: ChatLine) => void;
  onThreads?: (threads: ChatThreadFact[]) => void;
  onState?: (state: PageChatState) => void;
  timeoutMs?: number;
}

export interface PageChatRunner {
  start(): void;
  stop(): void;
  /** The page came back into view, or the browser is online again: ask now. */
  wake(): void;
  state(): PageChatState;
}

/**
 * The runner: the probe first (unless the host's key reads the chat: then nothing is asked, ever), then, where the
 * contract says `page`, the poll loop at `pollDelay`'s pace; a verdict other than `on` is asked again every REPROBE_MS
 * while the page is visible. A 401 while polling ends the loop and the probe takes over. Every step is cancelled by
 * `stop()` (a generation count: a late answer of a stopped runner changes nothing).
 */
export function createPageChatRunner(options: PageChatRunnerOptions): PageChatRunner {
  const fetchFn = options.fetch;
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? ((fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  });
  const hidden = options.hidden ?? (() => false);
  const online = options.online ?? (() => true);
  const timeoutMs = options.timeoutMs ?? 10_000;
  let state: PageChatState = { ...INITIAL, origin: options.loopsOrigin };
  let generation = 0;
  let cancel: (() => void) | null = null;
  let cursor: string | null = null;
  let failures = 0;
  let busy = false;
  const set = (next: Partial<PageChatState>) => {
    state = { ...state, ...next };
    options.onState?.(state);
  };
  const road = (probe: PageProbe) => decideChatRoad({ hostKeyReadsChat: options.hostKeyReadsChat, pageProbe: probe });
  const later = (fn: () => void, ms: number) => {
    cancel?.();
    cancel = schedule(fn, ms);
  };

  async function probe(): Promise<void> {
    const mine = generation;
    busy = true;
    const outcome = await probePageChat(options.loopsOrigin, fetchFn, timeoutMs);
    busy = false;
    if (mine !== generation) return;
    const next = road(outcome.verdict);
    set({ probe: outcome.verdict, road: next, failure: outcome.verdict === "on" ? null : outcome.detail, polling: next === "page" });
    if (next === "page") {
      options.onThreads?.(outcome.threads);
      cursor = null;
      failures = 0;
      void poll();
    } else later(() => void probe(), REPROBE_MS);
  }

  async function poll(): Promise<void> {
    const mine = generation;
    if (!online()) {
      // Offline: nothing is scheduled; `wake()` (the online event) asks again.
      set({ polling: true });
      return;
    }
    busy = true;
    const outcome = await pollPageChat(options.loopsOrigin, cursor === null ? { fromTail: true } : { cursor }, fetchFn, timeoutMs);
    busy = false;
    if (mine !== generation) return;
    switch (outcome.kind) {
      case "ok": {
        failures = 0;
        cursor = outcome.cursor;
        for (const line of outcome.lines) options.onLine?.(line);
        if (outcome.threads !== null) options.onThreads?.(outcome.threads);
        set({ polls: state.polls + 1, lines: state.lines + outcome.lines.length, failure: null, lastPollAt: now(), polling: true });
        break;
      }
      case "cursor-expired":
        cursor = null;
        set({ polls: state.polls + 1, failure: null, lastPollAt: now() });
        break;
      case "signed-out":
        cursor = null;
        set({ probe: "signed-out", road: road("signed-out"), polling: false, failure: null });
        later(() => void probe(), REPROBE_MS);
        return;
      case "failed":
        failures += 1;
        set({ polls: state.polls + 1, failure: outcome.reason });
        break;
    }
    later(() => void poll(), pollDelay({ hidden: hidden(), failures }));
  }

  return {
    start() {
      generation += 1;
      cancel?.();
      cancel = null;
      cursor = null;
      failures = 0;
      if (options.hostKeyReadsChat === true) {
        // The host's road: the page asks loops nothing.
        set({ probe: "unknown", road: "key", polling: false });
        return;
      }
      void probe();
    },
    stop() {
      generation += 1;
      cancel?.();
      cancel = null;
      busy = false;
      set({ polling: false });
    },
    wake() {
      if (busy || options.hostKeyReadsChat === true) return;
      if (state.road === "page") void poll();
      else if (state.probe !== "unknown") void probe();
    },
    state: () => state,
  };
}

let running: PageChatRunner | null = null;
let unlisten: (() => void) | null = null;

/**
 * The page's wiring: one runner for the live page, restarted when the host's word (its key reads the chat, the loops
 * origin) changes; the lines go to the said store, the threads to the threads store; visibility and the online event
 * wake it. Returns the stop.
 */
export function startPageChat(input: { loopsOrigin: string; hostKeyReadsChat: boolean | null }): () => void {
  stopPageChat();
  const runner = createPageChatRunner({
    ...input,
    hidden: () => document.hidden,
    online: () => navigator.onLine,
    onLine: (line) => rememberSaid(line),
    onThreads: (threads) => rememberThreads(threads),
    onState: (state) => publish(state),
  });
  running = runner;
  const visible = () => {
    if (!document.hidden) runner.wake();
  };
  const online = () => runner.wake();
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("online", online);
  unlisten = () => {
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("online", online);
  };
  runner.start();
  return stopPageChat;
}

export function stopPageChat(): void {
  unlisten?.();
  unlisten = null;
  running?.stop();
  running = null;
}

/** The pace the panel may say: the poll every POLL_MS while the page shows. */
export const PAGE_CHAT_POLL_MS = POLL_MS;
