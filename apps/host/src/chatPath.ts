/**
 * The viewer key's chat path (road 1 of the chat; round 59d, C4): one module per link to loops, built with the link's
 * client and disposed with the link. It answers whether the key reads the chat on this loops (`reads()`: unknown until
 * asked), keeps the threads' facts where it does, turns an agent's `dm.created` on the key's stream into one chat line
 * (the message read by id with the key), and owns the one timer that coalesces the threads' re-reads. The host wires
 * it: `check()` after the key check or when the stream accepts the key, `onEvent` from its ear on the stream, the
 * threads to every tab and a line as a `chat` stream message (the bubble).
 *
 * What "reads the chat" means (round 12, round 29): a VIEWER key (`world/viewer-key`, L1: the key's own entry in
 * `GET /api/agents` says `viewer: true`; a loops from before has no such field) whose `GET /api/dm/threads` answers
 * 200. A plain external bot gets 200 there too, with its own (empty) threads, which is why the flag decides. A viewer
 * key reads only the chat of the person who made it (loops main #964): the threads' `unreadCount` is the maker's, as
 * loops' own chat head shows it, and never a plain key's. The chat bubbles feature switched off in loops (Settings >
 * Features) answers 409 to a viewer: no chat for now, said as that.
 *
 * The readers (threads, an agent's dm, a message's line) are `@crewhub/loops-client`'s, shared with the page's own
 * road. Tests: `chatPath.test.ts`, through this interface with a fake client; `chatKey.test.ts` and `chatFuzz.test.ts`
 * through the host against the stub.
 */
import type { ChatLine, ChatThreadFact, Envelope } from "@crewhub/loops-client";
import { readAgentDm, readDmLine, readThreads } from "@crewhub/loops-client";
import type { LoopsClient } from "./loops.ts";
import { readKeyBot } from "./keyBot.ts";

/** Whether the key reads the chat on this link: `unknown` until loops was asked (health says `session: unknown` then). */
export type ChatVerdict = "yes" | "no" | "unknown";

/** After a `dm.*` event the threads are read again once, this long after the first of a burst. */
export const THREADS_REFRESH_MS = 1000;

export interface ChatPathOptions {
  /** The link's client: reads with the key. */
  client: Pick<LoopsClient, "getJson">;
  /** The key's agent name: its own entry in `GET /api/agents` says whether it is a viewer. */
  keyName: string;
  /** The host's log: one line on the verdict, never the key. */
  log: (line: string) => void;
  /** The threads' facts, each time they were read where the key reads the chat: at the check and after `dm.*` events. */
  onThreads: (threads: ChatThreadFact[]) => void;
  /** An agent's line, read by id with the key after its `dm.created`. */
  onLine: (line: ChatLine) => void;
  /** The coalescing of the threads' re-reads; tests shorten it. */
  refreshMs?: number;
}

export interface ChatPath {
  reads(): ChatVerdict;
  /** The threads' facts as last read; null where the key does not (or is not known to) read the chat. */
  threads(): ChatThreadFact[] | null;
  /**
   * Asks loops once whether the key reads the chat (`GET /api/agents`, then `GET /api/dm/threads` for a viewer) and
   * says the verdict in the log; the threads go to `onThreads` where it does. Asked already: the same answer, no
   * second read. A read loops did not answer (a throw, a status other than 200, 401, 403 or 409) is no verdict: the
   * road stays unknown, one line says so, and the next check asks again (round 62, P2-1). Disposed before the
   * answer: nothing is kept or said.
   */
  check(): Promise<void>;
  /**
   * An event the key's stream saw. Where the key reads the chat, a `dm.*` event has the threads read again (once per
   * `refreshMs`) and an agent's `dm.created` has its message read by id, as one line to `onLine`; a read that fails,
   * answers no 200 or no readable message is no line. Anything else is nothing.
   */
  onEvent(envelope: Envelope): void;
  /** The link is gone: no timer, no further line or threads, a check in flight keeps nothing. */
  dispose(): void;
}

/**
 * The answer to the question, or no answer: `transient` says loops did not answer it (a read that threw, a status
 * outside the four loops answers about a key with), so nothing is known and the question stands (round 62, P2-1).
 */
type Asked = { reads: boolean; threads: ChatThreadFact[]; viewer: boolean; status: number | null; transient: false } | { transient: true; why: string };

/** The statuses that are loops' answer about the key: 200 (it reads), 401 and 403 (it may not), 409 (the feature is off). Anything else says nothing. */
const VERDICT_STATUSES: ReadonlySet<number> = new Set([200, 401, 403, 409]);

export function createChatPath(options: ChatPathOptions): ChatPath {
  const { client, keyName, log, onThreads, onLine } = options;
  const refreshMs = options.refreshMs ?? THREADS_REFRESH_MS;
  let verdict: ChatVerdict = "unknown";
  let threadFacts: ChatThreadFact[] | null = null;
  let asked: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  async function ask(): Promise<Asked> {
    try {
      const agents = await client.getJson("/api/agents");
      if (!VERDICT_STATUSES.has(agents.status)) return { transient: true, why: `GET /api/agents answered ${agents.status}` };
      // The key's own entry says what kind of bot it is (keyBot.ts, the one reader; the doctor prints the same fact).
      if (agents.status !== 200 || readKeyBot(agents.body, keyName).kind !== "viewer") return { reads: false, threads: [], viewer: false, status: null, transient: false };
      const threads = await client.getJson("/api/dm/threads");
      if (!VERDICT_STATUSES.has(threads.status)) return { transient: true, why: `GET /api/dm/threads answered ${threads.status}` };
      return { reads: threads.status === 200, threads: threads.status === 200 ? readThreads(threads.body) : [], viewer: true, status: threads.status, transient: false };
    } catch {
      // A read that threw (a timeout, a refused connection): nothing reached loops, so nothing is known.
      return { transient: true, why: "the read failed" };
    }
  }

  /** The host's one line on the key's chat road, after the question was asked. */
  function tell(chat: Exclude<Asked, { transient: true }>): void {
    if (chat.reads) log(`the key reads the chat on this crewhub-loops: only the chat of the person who made the key; their agents' answers come over its stream, no sign-in needed; ${chat.threads.length} chat thread(s)${chat.threads.length === 0 ? " (none yet is no error: the maker has not written to an agent)" : ""}`);
    // Loops' chat bubbles feature switched off (Settings > Features) answers 409 feature_off to every chat read (round
    // 29, Medium 3): a viewer key that reads nothing until it is switched on, said as that and not as "no viewer key".
    else if (chat.viewer && chat.status === 409) log(`the key is a viewer but crewhub-loops' chat bubbles feature is switched off there (Settings > Features): no bubbles over the key until it is switched on (the host asks again at the next link)`);
    else if (chat.viewer) log(`the viewer key reads no chat on this crewhub-loops (GET /api/dm/threads answered ${chat.status}): no bubbles over the key; a viewer key reads only the chat of the person who made it, so a key with no maker, or whose maker is no longer an enabled admin, reads none (make a new one in Settings > Agents > Connect CrewHub World), and chat bubbles switched off in crewhub-loops (Settings > Features) close the chat for everyone`);
    else log(`the key does not read the chat on this crewhub-loops (no viewer key): no bubbles over the key; make a viewer key in Settings > Agents > Connect CrewHub World (it reads only its maker's chat), or set CHL_WORLD_ORIGIN to the world page's origin on that crewhub-loops so the page reads your own chat`);
  }

  function check(): Promise<void> {
    asked ??= ask().then((chat) => {
      if (disposed) return;
      if (chat.transient) {
        // No verdict (round 62, P2-1): loops did not answer (a timeout, a 5xx, a loops half up after a restart). The
        // road stays unknown, said once; the memo is cleared so the next check asks again (the ear's, when the
        // stream opens; the next link's). Before, this was recorded as the definitive no, blaming the key or the maker.
        asked = null;
        log(`the key's chat road is not known yet: crewhub-loops did not answer the chat reads (${chat.why}); asked again when the stream opens or at the next link`);
        return;
      }
      verdict = chat.reads ? "yes" : "no";
      threadFacts = chat.reads ? chat.threads : null;
      tell(chat);
      if (threadFacts !== null) onThreads(threadFacts);
    });
    return asked;
  }

  /** The threads read again once (coalesced within refreshMs) and handed on when the read answers 200. */
  function refresh(): void {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void client
        .getJson("/api/dm/threads")
        .then(({ status, body }) => {
          if (status !== 200 || disposed || verdict !== "yes") return;
          threadFacts = readThreads(body);
          onThreads(threadFacts);
        })
        .catch(() => undefined);
    }, refreshMs);
  }

  /** The message read by id with the key, as one line; null when not readable (no 200, no message, a read that failed). */
  async function readLine(dm: { messageId: string; threadId: string; agentId: string }): Promise<ChatLine | null> {
    try {
      const { status, body } = await client.getJson(`/api/dm/messages/${encodeURIComponent(dm.messageId)}`);
      return status === 200 ? readDmLine(dm, body) : null;
    } catch {
      return null;
    }
  }

  return {
    reads: () => verdict,
    threads: () => threadFacts,
    check,
    onEvent(envelope) {
      if (disposed || verdict !== "yes" || !envelope.type.startsWith("dm.")) return;
      refresh();
      const dm = readAgentDm(envelope);
      if (dm === null) return;
      void readLine(dm).then((line) => {
        if (line !== null && !disposed) onLine(line);
      });
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
