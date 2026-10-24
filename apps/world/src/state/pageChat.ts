/* Road 2 of the chat in the page (round 28): the page reads the signed-in person's own conversation from crewhub-loops
   itself, as `packages/loops-client` pageChat.ts spells out (GET only, the four routes, the person's cookie, no header
   of our own, the sealed cursor), and feeds the same `said` store as the host's road (`rememberSaid`: the bubbles, the
   chat mark, Recent answers and the card) and the threads' facts (`rememberThreads`). It runs only when the contract's
   `decideChatRoad` says `page`: the host's key does not read the chat, and the page's own probe answered. Nothing of
   it goes through the host; the host only names the loops web origin (`health.loopsWebUrl`, the same origin the API
   is on).

   The runner is pure in its inputs (the fetch, the clock, hidden and online, the stores' two writers), so a test drives
   it in milliseconds; the page's wiring (state/pageChatPage.ts `startPageChat`) hands it the browser's. The store keeps what the panel and
   the tools read: the probe's verdict, the loops origin asked, whether the poll runs, how many polls, the last failure.
   The page's wiring is state/pageChatPage.ts (the browser's fetch, hidden and online, the stores, the chat road store),
   kept apart so this module and its test load under node without the world. */
import {
  isLoopbackOrigin,
  pollDelay,
  pollPageChat,
  probePageChat,
  reprobeDelay,
  type ChatLine,
  type ChatThreadFact,
  type FetchLike,
  type HostHealth,
  type PageProbe,
} from "@crewhub/loops-client";
import { decideChatRoad, hostKeyReadsChatOf, type ChatRoad } from "./chatRoad.ts";
import { loopsWebUrl } from "./source.ts";

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
/** The page's wiring (state/pageChatPage.ts) publishes the runner's state here. */
export function publishPageChat(next: Partial<PageChatState>): void {
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

/** The host's word on its key, as the contract reads it (chatRoad.ts `hostKeyReadsChatOf`): true, false, or null while the host has not said. */
export function hostKeyReadsChat(health: Pick<HostHealth, "connection"> | null | undefined): boolean | null {
  return hostKeyReadsChatOf(health);
}

/**
 * The origin the page asks: the loops web origin the host names (the API is on the same origin), never anything else;
 * null when the host names none (round 29, Low 7: the Chat panel's link may fall back to the app's own address, a
 * credentialed read may not).
 */
export function loopsOriginOf(health: Pick<HostHealth, "loopsWebUrl"> | null | undefined): string | null {
  if (typeof health?.loopsWebUrl !== "string" || !/^https?:\/\//.test(health.loopsWebUrl)) return null;
  // A url the browser cannot parse (round 34, found by the fuzz: `http://[`) names no origin: null, never a throw.
  try {
    return new URL(loopsWebUrl(health as HostHealth | null | undefined)).origin;
  } catch {
    return null;
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
 * contract says `page`, the poll loop at `pollDelay`'s pace; a verdict other than `on` is asked again after
 * `reprobeDelay` (30 s signed out or chat off; 5 min for a refused origin, each ask a CORS line in the console; a
 * back-off from 5 s to 5 min for nothing answering). A 401 or a 409 while polling ends the loop and the probe takes
 * over. One ask in flight at a time; `wake()` drops the pending timer and asks now. Nothing is asked while the host
 * has not said whether its key reads the chat, at a loops elsewhere than this computer, or offline. Every step is
 * cancelled by `stop()` (a generation count: a late answer of a stopped runner changes nothing).
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
  /** Failed probes in a row that found nothing answering (the "unreachable" back-off, round 29 Low 9). */
  let unreachable = 0;
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
    // One ask in flight per runner (round 29, Low 5); offline, nothing is asked: `wake()` (the online event) asks again.
    if (busy || !online()) return;
    busy = true;
    const outcome = await probePageChat(options.loopsOrigin, fetchFn, timeoutMs);
    busy = false;
    if (mine !== generation) return;
    unreachable = outcome.verdict === "unreachable" ? unreachable + 1 : 0;
    const next = road(outcome.verdict);
    set({ probe: outcome.verdict, road: next, failure: outcome.verdict === "on" ? null : outcome.detail, polling: next === "page" });
    if (next === "page") {
      options.onThreads?.(outcome.threads);
      cursor = null;
      failures = 0;
      void poll();
    } else later(() => void probe(), reprobeDelay(outcome.verdict, unreachable));
  }

  async function poll(): Promise<void> {
    const mine = generation;
    if (busy) return;
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
      case "chat-off":
        cursor = null;
        set({ probe: outcome.kind, road: road(outcome.kind), polling: false, failure: null });
        later(() => void probe(), reprobeDelay(outcome.kind));
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
      unreachable = 0;
      if (options.hostKeyReadsChat === true) {
        // The host's road: the page asks loops nothing.
        set({ probe: "unknown", road: "key", polling: false });
        return;
      }
      if (options.hostKeyReadsChat === null) {
        // The host has not said yet (round 29, Medium 2): no road on a guess, nothing asked; the page's wiring restarts
        // the runner when the host's word comes (the stream going live, a key word, a health read).
        set({ probe: "unknown", road: "none", polling: false });
        return;
      }
      if (!isLoopbackOrigin(options.loopsOrigin)) {
        // A loops elsewhere (round 29, Low 8): the person's cookie never travels with a cross-site ask, so nothing is
        // asked and the words say the viewer key is the road.
        set({ probe: "remote", road: road("remote"), polling: false });
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
      if (busy || options.hostKeyReadsChat !== false || state.probe === "remote") return;
      // The pending timer goes: one ask now, and the next is set after it (never two in flight, round 29 Low 5).
      cancel?.();
      cancel = null;
      if (state.road === "page") void poll();
      else if (state.probe !== "unknown") void probe();
    },
    state: () => state,
  };
}

/**
 * When the page reads the host's health again for the chat road (round 29, Medium 2): a value that changes when the
 * stream goes live and when the host's key word on the stream changes; null while nothing is known (the stream not
 * live yet and no key word), so the first read (the gate's) stands until the host says something.
 */
export function healthRereadKey(connection: string | null, streamKey: string | null): string | null {
  if (connection !== "live" && streamKey === null) return null;
  return `${connection === "live" ? "live" : "off"}:${streamKey ?? "-"}`;
}
