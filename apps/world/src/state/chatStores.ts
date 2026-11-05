/* The chat's page stores as one runtime: what an agent just said and the Recent answers (state/said.ts for their words),
   the host's chat threads, the page's probe of road 2 and the page chat's state. One subscribe for all of them; a reader
   compares its own value, so a change elsewhere renders nothing. The writers are handed to whoever produces (the world's
   outlets, the demo's chat, road 2's runner); the page's one instance and its hooks are in state/runtimes.ts. The clock
   and the timers come in, so a test builds its own instance. Nothing is written to disk; a reload starts empty. */
import type { ChatLine, ChatThreadFact, PageProbe } from "@crewhub/loops-client";
import { INITIAL_PAGE_CHAT, type PageChatState } from "./pageChat.ts";
import { RECENT_ANSWERS, SAID_MS, type Answer, type Said, type SaidMap } from "./said.ts";

/** The threads as the host last sent them: per agent, when the last message was written and how many are unread. */
export type ThreadMap = ReadonlyMap<string, ChatThreadFact>;

export interface ChatStoresConfig {
  /** Wall time in ms. */
  now: () => number;
  /** Runs `fn` after `ms`; answers the cancel. */
  schedule: (fn: () => void, ms: number) => () => void;
}

export interface ChatStores {
  said: {
    /**
     * Remembers an agent's line: the bubble (the newest replaces an older one of the same agent) for SAID_MS, and the
     * Recent answers list (newest first, RECENT_ANSWERS at most, for the page's life). A line the page saw already (the
     * same message id: a stream that replayed, two roads at once) is neither listed nor shown twice.
     */
    remember(line: ChatLine): void;
    /** The lines in flight, the same map until one arrives or goes. */
    lines(): SaidMap;
    /** How many bubbles are alive right now (the long-session probe, state/soak.ts). */
    count(): number;
  };
  /** The Recent answers list: the last RECENT_ANSWERS lines the page saw, newest first; the same array until one arrives. */
  recent(): readonly Answer[];
  /** The answers the person has not opened the chat for (round 65, walk findings w3-1 and w3-4). */
  unread: {
    /** The unread ones of the Recent answers, newest first; the same array until one arrives or the chat opens. */
    answers(): readonly Answer[];
    /** The chat opened (the Chat panel lists every recent answer; the demo's card is its chat): everything known is read. */
    read(): void;
  };
  threads: {
    /** The host's list, whole: replaces what was known. */
    remember(threads: readonly ChatThreadFact[]): void;
    /** Null until the host sends a list: a key that cannot read the chat, a demo page, a host from before. */
    get(): ThreadMap | null;
  };
  probe: {
    /** The page's probe of road 2 said something: kept for everyone who shows the road. */
    remember(next: PageProbe): void;
    /** `unknown` until the probe has said something. */
    get(): PageProbe;
  };
  page: {
    /** Road 2's runner publishes its state here, for the long-session probe and the tools. */
    publish(next: Partial<PageChatState>): void;
    get(): PageChatState;
  };
  subscribe(listener: () => void): () => void;
}

export function createChatStores({ now, schedule }: ChatStoresConfig): ChatStores {
  const listeners = new Set<() => void>();
  const tell = () => {
    for (const listener of listeners) listener();
  };

  const lines = new Map<string, Said>();
  let snapshot: SaidMap = new Map();
  let recent: readonly Answer[] = [];
  // The unread answers: the recent ones whose message the chat has not been opened for since (by message id, so a
  // replayed line stays read); recomputed when one arrives and when the chat opens, the same array between.
  let readIds: ReadonlySet<string> = new Set();
  let unread: readonly Answer[] = [];
  const refreshUnread = () => {
    unread = recent.filter((a) => !readIds.has(a.messageId));
  };
  let cancelSweep: (() => void) | null = null;
  const publishLines = () => {
    snapshot = new Map(lines);
    tell();
  };
  /** Drops every expired line and arms a wake-up for the next one to expire. */
  const sweep = (nowMs: number) => {
    let changed = false;
    let next = Number.POSITIVE_INFINITY;
    for (const [agentId, said] of lines) {
      if (said.until <= nowMs) {
        lines.delete(agentId);
        changed = true;
      } else next = Math.min(next, said.until);
    }
    cancelSweep?.();
    cancelSweep = Number.isFinite(next) ? schedule(() => sweep(now()), Math.max(0, next - nowMs)) : null;
    if (changed) publishLines();
  };

  let threads: ThreadMap | null = null;
  let probe: PageProbe = "unknown";
  let page: PageChatState = INITIAL_PAGE_CHAT;

  return {
    said: {
      remember(line) {
        // A message the page has shown already (a stream replay, two roads at once, a poll that overlapped): nothing again,
        // neither the list nor a fresh bubble (round 29, Low 6).
        if (recent.some((a) => a.messageId === line.messageId)) return;
        const nowMs = now();
        const said: Said = { text: line.text, agentName: line.agentName ?? null, messageId: line.messageId, threadId: line.threadId, shownAt: nowMs, until: nowMs + SAID_MS };
        lines.set(line.agentId, said);
        recent = [{ ...said, agentId: line.agentId, at: line.at }, ...recent].slice(0, RECENT_ANSWERS);
        refreshUnread();
        sweep(nowMs);
        publishLines();
      },
      lines: () => snapshot,
      count: () => lines.size,
    },
    recent: () => recent,
    unread: {
      answers: () => unread,
      read() {
        if (unread.length === 0) return;
        readIds = new Set(recent.map((a) => a.messageId));
        refreshUnread();
        tell();
      },
    },
    threads: {
      remember(next) {
        threads = new Map(next.map((t) => [t.agentId, t]));
        tell();
      },
      get: () => threads,
    },
    probe: {
      remember(next) {
        if (next === probe) return;
        probe = next;
        tell();
      },
      get: () => probe,
    },
    page: {
      publish(next) {
        page = { ...page, ...next };
        tell();
      },
      get: () => page,
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
