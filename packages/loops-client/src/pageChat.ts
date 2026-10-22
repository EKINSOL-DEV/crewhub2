/**
 * Road 2 of the chat (round 28, CL-494 step 4): the page itself reads the signed-in person's own conversation from
 * crewhub-loops, with the person's session cookie, through the one origin the owner named on loops
 * (`CHL_WORLD_ORIGIN=http://127.0.0.1:<this page's port>`). The host and its key are not involved: nothing of this
 * road goes through the host, the page keeps nothing, and a bubble is the only thing that comes of it.
 *
 * What loops allows from that origin, and what this module therefore does, exactly:
 *   - `GET` only, four routes only: `/api/dm/threads`, `/api/dm/threads/{agent}/messages`, `/api/dm/messages/{id}`
 *     and `/api/events` (a poll: `types` forced to `dm.created,dm.answered`, `limit` at most 50; no stream);
 *   - `fetch(url, { method: "GET", credentials: "include" })` and nothing else in the request: no header of our own,
 *     not even a content type or an accept beyond the browser's own, so every call is a simple request and the browser
 *     sends no pre-flight (loops offers none: an OPTIONS is a 403 there); never a key (a page that sent one would be
 *     refused, and the key stays on the host);
 *   - the sealed cursor loops hands back with every events page is sent back as `cursor=`; the first poll asks
 *     `from=tail` (the cursor of now: nothing from before the page opened, as the host's road reads live).
 *
 * What the browser lets the page see of a refusal, and what the verdict says (`probeVerdict`): a 200 is the road on;
 * a 401 (loops answered through the origin, with the CORS headers, without accepting a session) is "signed out"; a
 * refusal of the origin itself (no `Access-Control-*` header: the setting is empty, names another port, or this loops
 * is from before it) reaches the page as one opaque `TypeError` from fetch, the same as a server that is not there,
 * so a second ask in `no-cors` mode (an opaque answer that proves only that something answered) tells "the origin is
 * not set" from "unreachable". A readable 403 cannot come through the origin (the guard's 403 carries no CORS header);
 * one that does is read as "signed out" too. Pure where it can be: the URLs, the request shape, the readers and the
 * verdict take their inputs; `probePageChat` and `pollPageChat` call `fetch` (the one injected, the page's by default).
 */
import type { ChatLine, ChatThreadFact } from "./source.ts";

/** The two event types the road may ask for (loops forces them through the origin; naming them is the honest shape). */
export const PAGE_CHAT_EVENT_TYPES = "dm.created,dm.answered";
/** The largest page loops gives through the origin; a larger `limit` is clamped there, so none is asked. */
export const PAGE_CHAT_EVENTS_LIMIT = 50;
/** The first line of a message, at most this many characters (the host's rule for a bubble's line). */
export const PAGE_CHAT_LINE_MAX = 140;

/** The one request shape of the road: a GET with the person's cookie and nothing of our own. Frozen: a test pins it. */
export const PAGE_CHAT_INIT: Readonly<RequestInit> = Object.freeze({ method: "GET", credentials: "include" });

/** The one segment shape of a loops agent name, as loops' own route pattern has it. */
const AGENT = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MESSAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `<origin>/api/dm/threads`. `origin` is the loops web origin the host names in its health (`loopsWebUrl`). */
export function threadsUrl(origin: string): string {
  return `${origin}/api/dm/threads`;
}
/** `<origin>/api/dm/threads/<agent>/messages`; an agent name outside loops' own shape is refused here, before anything is sent. */
export function threadMessagesUrl(origin: string, agent: string): string {
  if (!AGENT.test(agent)) throw new Error(`not an agent name: ${agent}`);
  return `${origin}/api/dm/threads/${agent}/messages`;
}
/** `<origin>/api/dm/messages/<id>`; an id outside loops' own shape is refused here. */
export function messageUrl(origin: string, messageId: string): string {
  if (!MESSAGE_ID.test(messageId)) throw new Error(`not a message id: ${messageId}`);
  return `${origin}/api/dm/messages/${messageId}`;
}
/**
 * `<origin>/api/events?types=dm.created,dm.answered&limit=50` plus the sealed cursor (`cursor=`), or `from=tail` for
 * the first ask (the cursor of now and no events). Never `after=`: the sealed cursor is loops' own road.
 */
export function eventsUrl(origin: string, resume: { cursor: string } | { fromTail: true }): string {
  const query = new URLSearchParams();
  query.set("types", PAGE_CHAT_EVENT_TYPES);
  query.set("limit", String(PAGE_CHAT_EVENTS_LIMIT));
  if ("cursor" in resume) query.set("cursor", resume.cursor);
  else query.set("from", "tail");
  return `${origin}/api/events?${query.toString()}`;
}

/**
 * What the page can tell about the road from one `GET /api/dm/threads`: the contract's `pageProbe` values. `chat-off`
 * (round 29): loops answered 409 `feature_off` through the origin, its chat bubbles feature is switched off there;
 * `remote`: the loops origin is not on this computer, so the page does not ask at all (the person's cookie never
 * travels cross-site; the viewer key is the road there).
 */
export type PageProbe = "on" | "signed-out" | "origin-not-set" | "unreachable" | "chat-off" | "remote" | "unknown";

/** Whether `origin` is this computer's (`127.0.0.1`, `localhost`, `[::1]`): the only kind the page probes. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/** One ask through the origin, as the page sees it: an answer (any status the page may read) or one opaque failure. */
export type PageAnswer = { kind: "answer"; status: number; body: unknown } | { kind: "failed"; reason: string };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

/** One GET through the origin with the road's one request shape; the body as JSON when there is one (null otherwise). */
export async function pageGet(url: string, fetchFn: FetchLike = defaultFetch, timeoutMs = 10_000): Promise<PageAnswer> {
  try {
    const response = await fetchFn(url, { ...PAGE_CHAT_INIT, signal: AbortSignal.timeout(timeoutMs) });
    const body: unknown = await response.json().catch(() => null);
    return { kind: "answer", status: response.status, body };
  } catch (error) {
    return { kind: "failed", reason: error instanceof Error ? (error.name === "TimeoutError" ? "no answer in time" : error.message) : "no answer" };
  }
}

/**
 * The verdict from the probe's answer. `somethingAnswered` is the second ask's outcome, made only when the first was
 * an opaque failure: true when a `no-cors` GET of the same route got any answer at all (the server is there and the
 * origin is what it refuses), false when that failed too (nothing answers), null when it was not made.
 */
export function probeVerdict(answer: PageAnswer, somethingAnswered: boolean | null): PageProbe {
  if (answer.kind === "answer") {
    if (answer.status === 200) return "on";
    if (answer.status === 401 || answer.status === 403) return "signed-out";
    // Loops' chat bubbles feature off (Settings > Features): every chat read answers 409 feature_off through the origin.
    if (answer.status === 409) return "chat-off";
    return "unreachable";
  }
  return somethingAnswered === true ? "origin-not-set" : "unreachable";
}

/**
 * The probe: `GET /api/dm/threads` with credentials; on an opaque failure a second GET of the same route in `no-cors`
 * mode (the answer is opaque and unreadable by design; only that one came tells the server is there). The threads
 * of a 200 answer come back with the verdict, read as the host reads them, so the card's facts are known at once.
 */
export async function probePageChat(origin: string, fetchFn: FetchLike = defaultFetch, timeoutMs = 10_000): Promise<{ verdict: PageProbe; threads: ChatThreadFact[]; detail: string }> {
  const answer = await pageGet(threadsUrl(origin), fetchFn, timeoutMs);
  if (answer.kind === "answer") return { verdict: probeVerdict(answer, null), threads: answer.status === 200 ? readThreads(answer.body) : [], detail: `${answer.status}` };
  let somethingAnswered = false;
  try {
    await fetchFn(threadsUrl(origin), { ...PAGE_CHAT_INIT, mode: "no-cors", signal: AbortSignal.timeout(timeoutMs) });
    somethingAnswered = true;
  } catch {
    somethingAnswered = false;
  }
  return { verdict: probeVerdict(answer, somethingAnswered), threads: [], detail: `${answer.reason}; something answered: ${somethingAnswered}` };
}

/** The threads' facts from a `GET /api/dm/threads` answer, leniently (loops' camelCase; a row without its facts is dropped). */
export function readThreads(body: unknown): ChatThreadFact[] {
  const rows = (body as { threads?: unknown } | null)?.threads;
  if (!Array.isArray(rows)) return [];
  const out: ChatThreadFact[] = [];
  for (const row of rows as { agentId?: unknown; lastMessageAt?: unknown; unreadCount?: unknown }[]) {
    if (typeof row?.agentId !== "string" || row.agentId === "" || typeof row.lastMessageAt !== "string") continue;
    out.push({ agentId: row.agentId, lastMessageAt: row.lastMessageAt, unreadCount: typeof row.unreadCount === "number" && Number.isInteger(row.unreadCount) && row.unreadCount >= 0 ? row.unreadCount : 0 });
  }
  return out;
}

/** An agent's `dm.created` among the events, by its ids; the person's own messages and the other types are not it. */
export interface AgentDm {
  messageId: string;
  threadId: string;
  agentId: string;
}

/** One events page as the poll reads it: the agents' new messages (ids only), whether any `dm.*` event came, the next cursor. */
export interface EventsPage {
  agentDms: AgentDm[];
  dmEvents: number;
  /** The sealed cursor to send next; null when the answer carried none (then the poll starts again at the tail). */
  cursor: string | null;
}

export function readEvents(body: unknown): EventsPage {
  const raw = body as { events?: unknown; cursor?: unknown } | null;
  const events = Array.isArray(raw?.events) ? (raw.events as unknown[]) : [];
  const agentDms: AgentDm[] = [];
  let dmEvents = 0;
  for (const event of events as { type?: unknown; actor?: { kind?: unknown; id?: unknown }; payload?: { messageId?: unknown; threadId?: unknown; agentId?: unknown } }[]) {
    if (typeof event?.type !== "string" || !event.type.startsWith("dm.")) continue;
    dmEvents += 1;
    const payload = event.payload;
    if (event.type !== "dm.created" || event.actor?.kind !== "agent" || typeof payload?.messageId !== "string" || typeof payload.threadId !== "string" || typeof payload.agentId !== "string") continue;
    if (!MESSAGE_ID.test(payload.messageId)) continue;
    agentDms.push({ messageId: payload.messageId, threadId: payload.threadId, agentId: payload.agentId });
  }
  return { agentDms, dmEvents, cursor: typeof raw?.cursor === "string" && raw.cursor !== "" ? raw.cursor : null };
}

/** The first non-empty line of a message, at most PAGE_CHAT_LINE_MAX characters, an ellipsis after (the host's rule). */
export function firstLine(text: string): string {
  const line = text.replace(/\r/g, "").split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
  return line.length > PAGE_CHAT_LINE_MAX ? `${line.slice(0, PAGE_CHAT_LINE_MAX - 1)}…` : line;
}

/** The bubble's line from a `GET /api/dm/messages/{id}` answer, read leniently as the host reads it; null when it is not an agent's readable message. */
export function readPageChatLine(ids: AgentDm, body: unknown): ChatLine | null {
  const message = (body as { message?: { bodyText?: unknown; createdAt?: unknown; author?: { displayName?: unknown; kind?: unknown } } } | null)?.message;
  if (!message || typeof message.bodyText !== "string") return null;
  if (message.author?.kind !== undefined && message.author.kind !== "agent") return null;
  const text = firstLine(message.bodyText);
  if (text === "") return null;
  const name = message.author?.displayName;
  return { agentId: ids.agentId, ...(typeof name === "string" && name !== "" ? { agentName: name } : {}), text, at: typeof message.createdAt === "string" ? message.createdAt : new Date().toISOString(), messageId: ids.messageId, threadId: ids.threadId };
}

/**
 * How long to wait before the next poll. Visible and online: POLL_MS (5 s: a bubble lives 12 s and loops' own answer
 * to a chat is a poll by design, so an answer shows within 5 s, 2.5 s on average, at a dozen cheap indexed reads a
 * minute on loopback). A hidden tab shows no bubble, so it asks once a minute (the Recent answers list still fills).
 * After a failure the wait doubles from POLL_MS to POLL_MAX_MS and starts again at POLL_MS on the next answer.
 * Offline (`navigator.onLine` false) the poll is not scheduled at all: the `online` event asks again.
 */
export const POLL_MS = 5_000;
export const POLL_HIDDEN_MS = 60_000;
export const POLL_MAX_MS = 60_000;
export function pollDelay(input: { hidden: boolean; failures: number }): number {
  if (input.hidden) return POLL_HIDDEN_MS;
  if (input.failures <= 0) return POLL_MS;
  return Math.min(POLL_MAX_MS, POLL_MS * 2 ** input.failures);
}

/**
 * How long a verdict other than "on" stands before the page asks again: "signed out" and "chat off" every REPROBE_MS
 * (readable answers, no console line; a sign-in in another tab or in the Chat panel's frame, or the feature switched
 * on, brings the road on by itself); "the origin is not set" every REPROBE_SLOW_MS, since each such ask is one CORS
 * refusal the browser prints in the console (the page cannot stop that line) and the setting only changes with a
 * loops restart; "unreachable" backs off from the poll's pace, doubling with each failed probe up to REPROBE_SLOW_MS
 * (no console line is at stake, and a loops restarting is the common case: `attempts` counts the failed probes in a
 * row). The page coming back into view asks at once.
 */
export const REPROBE_MS = 30_000;
export const REPROBE_SLOW_MS = 300_000;
export function reprobeDelay(probe: PageProbe, attempts = 1): number {
  if (probe === "origin-not-set") return REPROBE_SLOW_MS;
  if (probe === "unreachable") return Math.min(REPROBE_SLOW_MS, POLL_MS * 2 ** Math.max(0, attempts - 1));
  return REPROBE_MS;
}

/** What one poll did, for the runner and the log. */
export type PollOutcome =
  | { kind: "ok"; lines: ChatLine[]; threads: ChatThreadFact[] | null; cursor: string | null }
  /** Loops no longer accepts the session (a 401, or a readable 403): the road is off until a probe says otherwise. */
  | { kind: "signed-out" }
  /** Loops' chat bubbles feature was switched off (409 feature_off on a chat read): the road is off until a probe says otherwise. */
  | { kind: "chat-off" }
  /** The cursor is no longer good (410): the next poll starts at the tail. */
  | { kind: "cursor-expired" }
  | { kind: "failed"; reason: string };

/**
 * One poll: the events since `cursor` (or from the tail), each agent message read by id as one line, and the threads
 * read again when any `dm.*` event came (the card's facts). Never more than the four routes, never another method.
 * A message read that fails (no answer, a 5xx) fails the poll without a cursor, so the next poll asks the same page
 * again and the line is not lost (round 29, Low 4); a 404 is a message the person may not see, skipped; a 409 is the
 * chat bubbles feature switched off meanwhile (chat-off).
 */
export async function pollPageChat(origin: string, resume: { cursor: string } | { fromTail: true }, fetchFn: FetchLike = defaultFetch, timeoutMs = 10_000): Promise<PollOutcome> {
  const answer = await pageGet(eventsUrl(origin, resume), fetchFn, timeoutMs);
  if (answer.kind === "failed") return { kind: "failed", reason: answer.reason };
  if (answer.status === 401 || answer.status === 403) return { kind: "signed-out" };
  if (answer.status === 410) return { kind: "cursor-expired" };
  if (answer.status !== 200) return { kind: "failed", reason: `events answered ${answer.status}` };
  const page = readEvents(answer.body);
  const lines: ChatLine[] = [];
  for (const ids of page.agentDms) {
    const read = await pageGet(messageUrl(origin, ids.messageId), fetchFn, timeoutMs);
    if (read.kind === "failed") return { kind: "failed", reason: `the message ${ids.messageId}: ${read.reason}` };
    if (read.status === 401 || read.status === 403) return { kind: "signed-out" };
    if (read.status === 409) return { kind: "chat-off" };
    if (read.status === 404) continue;
    if (read.status !== 200) return { kind: "failed", reason: `the message ${ids.messageId} answered ${read.status}` };
    const line = readPageChatLine(ids, read.body);
    if (line !== null) lines.push(line);
  }
  let threads: ChatThreadFact[] | null = null;
  if (page.dmEvents > 0) {
    const read = await pageGet(threadsUrl(origin), fetchFn, timeoutMs);
    if (read.kind === "answer" && read.status === 409) return { kind: "chat-off" };
    if (read.kind === "answer" && read.status === 200) threads = readThreads(read.body);
  }
  return { kind: "ok", lines, threads, cursor: page.cursor };
}
