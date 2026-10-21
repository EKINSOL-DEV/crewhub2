/**
 * The person's chat session (spec addendum "chat with the agents", road B option 2): the host signs in to
 * crewhub-loops as the person, once, over the same loopback road it reads with (TCP or the socket), keeps ONLY the
 * session cookie (0600, beside the key: `<configDir>/loops-session`), never the password, never logged, never in
 * health; and uses it for READS of the chat only, enforced by `SESSION_ROUTES` below and tested: the threads, a
 * thread's messages, one message by id, and the event stream filtered to `dm.*`. Never a send, a mark-read,
 * `/api/me/bubbles` or anything else: a person's session is a full admin session, so the list is the whole point.
 *
 * An agent's message to the person (`dm.created` whose actor is an agent) is read by id and handed to the host as
 * one `ChatLine` (the agent, the first line, when): a speech bubble over that agent's figure. What the person sent
 * shows nothing. Nothing of a conversation is kept beyond that line in flight.
 *
 * States, said plainly in health (`connection.session`): `signed-out` (no session), `signed-in` (as <name>),
 * `expired` (loops refused the kept cookie: sign in again; the host never retries with an expired cookie). "Forget the
 * session" signs out at loops (best effort) and deletes the file.
 *
 * PLANNED REMOVAL (decision 9, 21 October): this road stays until `world/viewer-key` is merged in loops and the world
 * has switched to the viewer key (a new key file or a paste); then, in that same track, this file and its tests go, with
 * the session file, the `/world-api/session` routes (allowList.ts, host.ts), the `signed-out`/`signed-in`/`expired`
 * states of `connection.session`, the Connection panel's Chat section and its words, the per-road `chatWords` and the
 * regress chat group's session half. The full list is in the spec addendum "chat with the agents". Nothing goes before.
 */
import path from "node:path";
import { readFileSync, statSync } from "node:fs";
import type { HostSessionState } from "@crewhub/loops-client";
import { removeQuietly, writeWhole } from "./keyStore.ts";
import { type Allow, type LoopsTarget, type LoopsTransport, createTransport } from "./transport.ts";

export const SESSION_FILE_NAME = "loops-session";
/** loops' session cookie (`auth/service.py` SESSION_COOKIE). The device cookie (`chl_device`) is never kept. */
export const SESSION_COOKIE = "chl_session";
/** The event types the session's stream asks for (`types=`): a message, and a message answered. */
export const DM_EVENT_TYPES = "dm.created,dm.answered";
const STREAM_IDLE_MS = 45_000;
const RECONNECT_MS = { min: 1500, max: 3000 };
const READ_TIMEOUT_MS = 10_000;

/** The one segment shape of a loops id or agent name. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * The session's allow-list: exactly these, by method and path; `{x}` is one segment. The two POSTs are the sign-in
 * and the sign-out of the session itself (no data is written); everything else is a read of the chat. Any other
 * path, method or query is refused here, before anything is sent.
 */
export const SESSION_ROUTES: readonly { method: "GET" | "POST"; pattern: string; query: readonly string[] }[] = [
  { method: "POST", pattern: "/api/auth/login", query: [] },
  { method: "POST", pattern: "/api/auth/logout", query: [] },
  { method: "GET", pattern: "/api/dm/threads", query: [] },
  { method: "GET", pattern: "/api/dm/threads/{agent}/messages", query: ["limit", "cursor"] },
  { method: "GET", pattern: "/api/dm/messages/{id}", query: [] },
  { method: "GET", pattern: "/api/events", query: ["after", "cursor", "from", "limit", "types"] },
  { method: "GET", pattern: "/api/events/stream", query: ["after", "cursor", "types"] },
];

function matches(pattern: string, pathname: string): boolean {
  const expected = pattern.split("/").filter((p) => p !== "");
  const actual = pathname.split("/").filter((p) => p !== "");
  if (actual.length !== expected.length) return false;
  return expected.every((want, i) => {
    const have = actual[i] as string;
    return want.startsWith("{") ? SEGMENT.test(have) : want === have;
  });
}

/** The session transport's gate (`Allow`): the route must be on `SESSION_ROUTES`; the events reads must ask for `dm.*` types only. */
export const allowedSessionPath: Allow = (method, pathname, query) => {
  const route = SESSION_ROUTES.find((r) => r.method === method && matches(r.pattern, pathname));
  if (route === undefined) throw new Error(`session path not on the allow-list: ${method} ${pathname}`);
  const search = new URLSearchParams();
  for (const name of route.query) {
    const value = query[name];
    if (value !== undefined) search.set(name, value);
  }
  if (pathname.startsWith("/api/events")) {
    const types = (search.get("types") ?? "").split(",").filter((t) => t !== "");
    if (types.length === 0 || !types.every((t) => t.startsWith("dm."))) throw new Error("the session reads dm.* events only");
  }
  const qs = search.toString();
  return qs === "" ? pathname : `${pathname}?${qs}`;
};

/** What the file holds: the cookie, who the person is, when. Never a password. */
export interface StoredSession {
  v: 1;
  cookie: string;
  user: { id: string; displayName: string };
  at: string;
}

export interface SessionStore {
  file: string;
  read(): StoredSession | null;
  save(session: StoredSession): void;
  forget(): void;
}

/** `<configDir>/loops-session`, written whole (temp + rename), mode 0600; unreadable or malformed is "none". */
export function createSessionStore(configDir: string): SessionStore {
  const file = path.join(configDir, SESSION_FILE_NAME);
  return {
    file,
    read() {
      let text: string;
      try {
        if ((statSync(file).mode & 0o077) !== 0) return null; // a file others may read is not trusted
        text = readFileSync(file, "utf8");
      } catch {
        return null;
      }
      try {
        const raw = JSON.parse(text) as Partial<StoredSession> | null;
        if (raw === null || raw.v !== 1 || typeof raw.cookie !== "string" || raw.cookie === "" || typeof raw.user?.id !== "string" || typeof raw.user.displayName !== "string" || typeof raw.at !== "string") return null;
        return { v: 1, cookie: raw.cookie, user: { id: raw.user.id, displayName: raw.user.displayName }, at: raw.at };
      } catch {
        return null;
      }
    },
    save(session) {
      writeWhole(configDir, file, `${JSON.stringify(session)}\n`);
    },
    forget() {
      removeQuietly(file);
    },
  };
}

/** An agent's message to the person, as the world shows it: a bubble over the agent's figure with the first line. */
export interface ChatLine {
  agentId: string;
  agentName?: string;
  /** The first line of the message, at most `LINE_MAX` characters. */
  text: string;
  /** When the message was written (ISO). */
  at: string;
  messageId: string;
  threadId: string;
}
const LINE_MAX = 140;

export type SignInOutcome = { kind: "ok"; name: string } | { kind: "refused"; status: number; code: string; message: string } | { kind: "unreachable"; reason: string };

export interface SessionOptions {
  store: SessionStore;
  log: (line: string) => void;
  /** An agent spoke to the person. */
  onChat: (line: ChatLine) => void;
  /** The state changed (for the tabs and the log). */
  onState?: (state: HostSessionState) => void;
  readTimeoutMs?: number;
  reconnectMs?: { min: number; max: number };
}

export interface Session {
  state(): HostSessionState;
  /** Signs in at `target`; on success the cookie is kept and the dm stream starts. The password lives in this call only. */
  signIn(target: LoopsTarget, id: string, password: string): Promise<SignInOutcome>;
  /** Uses the kept session, if any, against `target` (the discovery's road): the dm stream starts. Call on every (re)link. */
  follow(target: LoopsTarget | null): void;
  /** Signs out at loops (best effort), deletes the file, stops the stream. */
  forget(): Promise<void>;
  stop(): Promise<void>;
}

export const firstLine = (text: string): string => {
  const line = text.replace(/\r/g, "").split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
  return line.length > LINE_MAX ? `${line.slice(0, LINE_MAX - 1)}…` : line;
};

/** The value of `chl_session` among loops' Set-Cookie lines, or null. The device cookie is left where it is. */
export function sessionCookieOf(setCookies: readonly string[]): string | null {
  for (const line of setCookies) {
    const first = line.split(";")[0] ?? "";
    const eq = first.indexOf("=");
    if (eq === -1) continue;
    if (first.slice(0, eq).trim() === SESSION_COOKIE) {
      const value = first.slice(eq + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

export function createSession(options: SessionOptions): Session {
  const { store, log } = options;
  const readTimeoutMs = options.readTimeoutMs ?? READ_TIMEOUT_MS;
  const reconnect = options.reconnectMs ?? RECONNECT_MS;
  let kept: StoredSession | null = store.read();
  let expired = false;
  let target: LoopsTarget | null = null;
  let abort: AbortController | null = null;
  let running: Promise<void> | null = null;
  let generation = 0;
  let stopped = false;

  const state = (): HostSessionState => {
    if (kept === null) return { state: "signed-out" };
    return { state: expired ? "expired" : "signed-in", name: kept.user.displayName, id: kept.user.id, at: kept.at };
  };
  const tell = () => options.onState?.(state());
  /** A transport with the kept cookie and the session's own gate. The cookie never leaves this closure. */
  const transportFor = (at: LoopsTarget, cookie: string): LoopsTransport => createTransport(at, { Cookie: `${SESSION_COOKIE}=${cookie}` }, allowedSessionPath);

  async function stopStream(): Promise<void> {
    generation += 1;
    abort?.abort();
    abort = null;
    const was = running;
    running = null;
    if (was !== null) await was.catch(() => undefined);
  }

  /** The dm stream: live from now, reconnecting; a 401 ends it for good (expired) until a new sign-in. */
  function startStream(): void {
    if (stopped || kept === null || expired || target === null || running !== null) return;
    const mine = generation;
    const session = kept;
    const at = target;
    const transport = transportFor(at, session.cookie);
    abort = new AbortController();
    const signal = abort.signal;
    running = (async () => {
      let first = true;
      while (!signal.aborted && mine === generation) {
        try {
          const response = await transport.request("/api/events/stream", { types: DM_EVENT_TYPES }, { accept: "application/x-ndjson", signal, timeoutMs: readTimeoutMs });
          if (response.status === 401 || response.status === 403) {
            await response.body?.cancel().catch(() => undefined);
            expired = true;
            log(`the chat session of ${session.user.displayName} is no longer accepted by crewhub-loops (${response.status}): sign in again`);
            tell();
            return;
          }
          if (response.status !== 200 || response.body === null) {
            await response.body?.cancel().catch(() => undefined);
            if (first) log(`the chat stream answered ${response.status}; trying again`);
          } else {
            if (first) log(`the chat stream is open as ${session.user.displayName} (dm.* only)`);
            first = false;
            await follow(response.body, signal, transport);
          }
        } catch {
          // the road broke or the read timed out: reconnect below
        }
        if (signal.aborted || mine !== generation) return;
        await new Promise((r) => setTimeout(r, reconnect.min + Math.random() * (reconnect.max - reconnect.min)));
      }
    })().finally(() => {
      if (mine === generation) running = null;
    });
  }

  async function follow(body: ReadableStream<Uint8Array>, signal: AbortSignal, transport: LoopsTransport): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let idle: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (idle !== null) clearTimeout(idle);
      idle = setTimeout(() => reader.cancel().catch(() => undefined), STREAM_IDLE_MS);
    };
    arm();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || signal.aborted) break;
        arm();
        pending += decoder.decode(value, { stream: true });
        let at = pending.indexOf("\n");
        while (at !== -1) {
          const text = pending.slice(0, at).trim();
          pending = pending.slice(at + 1);
          if (text !== "") await handleLine(text, transport, signal);
          at = pending.indexOf("\n");
        }
      }
    } finally {
      if (idle !== null) clearTimeout(idle);
      reader.releaseLock();
    }
  }

  async function handleLine(text: string, transport: LoopsTransport, signal: AbortSignal): Promise<void> {
    let line: Record<string, unknown>;
    try {
      line = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    if (line["type"] !== "dm.created") return;
    const actor = line["actor"] as { id?: unknown; kind?: unknown } | undefined;
    const payload = line["payload"] as { messageId?: unknown; threadId?: unknown; agentId?: unknown } | undefined;
    if (actor?.kind !== "agent" || typeof payload?.messageId !== "string" || typeof payload.threadId !== "string" || typeof payload.agentId !== "string") return;
    // The event carries ids only: the message is read by id, as the person.
    let chat: ChatLine | null = null;
    try {
      const response = await transport.request(`/api/dm/messages/${encodeURIComponent(payload.messageId)}`, {}, { accept: "application/json", signal, timeoutMs: readTimeoutMs });
      const body = (await response.json().catch(() => null)) as { message?: { bodyText?: unknown; createdAt?: unknown; author?: { displayName?: unknown } } } | null;
      if (response.status === 401 || response.status === 403) {
        expired = true;
        log(`the chat session of ${kept?.user.displayName ?? "?"} is no longer accepted by crewhub-loops (${response.status}): sign in again`);
        tell();
        abort?.abort();
        return;
      }
      if (response.status !== 200 || typeof body?.message?.bodyText !== "string") return;
      const name = body.message.author?.displayName;
      chat = {
        agentId: payload.agentId,
        ...(typeof name === "string" ? { agentName: name } : {}),
        text: firstLine(body.message.bodyText),
        at: typeof body.message.createdAt === "string" ? body.message.createdAt : new Date().toISOString(),
        messageId: payload.messageId,
        threadId: payload.threadId,
      };
    } catch {
      return;
    }
    if (chat.text !== "") options.onChat(chat);
  }

  return {
    state,
    async signIn(at, id, password) {
      const transport = createTransport(at, {}, allowedSessionPath);
      let response: Response;
      try {
        response = await transport.request("/api/auth/login", {}, { accept: "application/json", method: "POST", body: JSON.stringify({ id, password }), timeoutMs: readTimeoutMs });
      } catch (error) {
        return { kind: "unreachable", reason: error instanceof Error && error.name === "TimeoutError" ? "crewhub-loops did not answer in time" : "crewhub-loops did not answer" };
      }
      const body = (await response.json().catch(() => null)) as { user?: { id?: unknown; displayName?: unknown }; error?: { code?: unknown; message?: unknown } } | null;
      if (response.status !== 200) {
        const code = typeof body?.error?.code === "string" ? body.error.code : `http_${response.status}`;
        const message = typeof body?.error?.message === "string" ? body.error.message : `crewhub-loops answered ${response.status}`;
        return { kind: "refused", status: response.status, code, message };
      }
      const cookie = sessionCookieOf(response.headers.getSetCookie());
      const userId = typeof body?.user?.id === "string" ? body.user.id : id;
      const displayName = typeof body?.user?.displayName === "string" ? body.user.displayName : userId;
      if (cookie === null) return { kind: "unreachable", reason: "crewhub-loops answered without a session cookie" };
      await stopStream();
      kept = { v: 1, cookie, user: { id: userId, displayName }, at: new Date().toISOString() };
      expired = false;
      try {
        store.save(kept);
      } catch (error) {
        log(`cannot keep the chat session in ${store.file}: ${error instanceof Error ? error.message : "unknown error"} (it lasts this run)`);
      }
      target = at;
      log(`signed in to crewhub-loops as ${displayName} for the chat's bubbles (the session kept in ${store.file})`);
      tell();
      startStream();
      return { kind: "ok", name: displayName };
    },
    follow(at) {
      target = at;
      void stopStream().then(() => startStream());
    },
    async forget() {
      const was = kept;
      await stopStream();
      kept = null;
      expired = false;
      store.forget();
      if (was !== null && target !== null) {
        try {
          const response = await transportFor(target, was.cookie).request("/api/auth/logout", {}, { accept: "application/json", method: "POST", timeoutMs: readTimeoutMs });
          await response.body?.cancel().catch(() => undefined);
        } catch {
          // best effort: the file is gone either way
        }
        log(`the chat session of ${was.user.displayName} is forgotten (signed out at crewhub-loops when it answered)`);
      }
      tell();
    },
    async stop() {
      stopped = true;
      await stopStream();
    },
  };
}
