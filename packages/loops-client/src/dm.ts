/**
 * The chat's dm readers, one set for both roads (round 59d, C4). The host reads the chat with the viewer key on its own
 * stream (road 1, `apps/host/src/chatPath.ts`) and the page reads the person's own chat through the origin (road 2,
 * `pageChat.ts`); crewhub-loops answers both the same way (`GET /api/dm/threads`, a `dm.created` event, `GET
 * /api/dm/messages/{id}`), so both read it here, leniently: loops' camelCase as it comes, a row or a field that is not
 * what it should be is dropped, never a throw (the round-34 fuzz found one in a hand-written copy: a `dm.created` with
 * a null payload). The strict validators of `validate.ts` (`validateDmThreadsResponse`, `validateDmMessagesResponse`)
 * pin the demo's shapes against the contract and stay there; a wire that drifts by one field must not drop a whole
 * list of threads here. Pure: no fetch, no clock but `at`'s fallback.
 */
import type { ChatLine, ChatThreadFact } from "./source.ts";

/** The first line of a message, at most this many characters: a bubble's line, a row in Recent answers. */
export const DM_LINE_MAX = 140;

/** The shape of a loops message id (`dm_…`), as loops' own route pattern has it; a read never aims at another. */
const MESSAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const isMessageId = (value: unknown): value is string => typeof value === "string" && MESSAGE_ID.test(value);

/** The first non-empty line of a message, trimmed, at most DM_LINE_MAX characters, an ellipsis after. */
export function firstLine(text: string): string {
  const line = text.replace(/\r/g, "").split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
  return line.length > DM_LINE_MAX ? `${line.slice(0, DM_LINE_MAX - 1)}…` : line;
}

/** The threads' facts from a `GET /api/dm/threads` answer: the three fields of every row that has its agent and stamp; a count that is no count is 0. */
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

/** An agent's `dm.created`, by its ids. */
export interface AgentDm {
  messageId: string;
  threadId: string;
  agentId: string;
}

/**
 * An agent's `dm.created` from one event, whichever way it came (the stream's envelope, a row of an events page): its
 * ids. Null for anything else: the person's own message (the actor is no agent), another type, a payload that is no
 * object or lacks an id, a message id outside loops' shape (never read, so never a path bent by an odd id).
 */
export function readAgentDm(event: unknown): AgentDm | null {
  const raw = event as { type?: unknown; actor?: { kind?: unknown } | null; payload?: { messageId?: unknown; threadId?: unknown; agentId?: unknown } | null } | null;
  if (raw?.type !== "dm.created" || raw.actor?.kind !== "agent") return null;
  const payload = raw.payload;
  if (typeof payload !== "object" || payload === null) return null;
  if (!isMessageId(payload.messageId) || typeof payload.threadId !== "string" || typeof payload.agentId !== "string") return null;
  return { messageId: payload.messageId, threadId: payload.threadId, agentId: payload.agentId };
}

/**
 * The bubble's line from a `GET /api/dm/messages/{id}` answer's body: the first line of `bodyText`, the author's name
 * when there is one, when it was written (now when the answer says not). Null when it is no agent's readable message:
 * no text, an empty first line, or an author whose `kind` is given and is not `agent` (what the person sent is no
 * bubble). The ids are the event's: the answer is trusted for its words only.
 */
export function readDmLine(ids: AgentDm, body: unknown): ChatLine | null {
  const message = (body as { message?: { bodyText?: unknown; createdAt?: unknown; author?: { displayName?: unknown; kind?: unknown } | null } | null } | null)?.message;
  if (!message || typeof message.bodyText !== "string") return null;
  if (message.author?.kind !== undefined && message.author.kind !== "agent") return null;
  const text = firstLine(message.bodyText);
  if (text === "") return null;
  const name = message.author?.displayName;
  return { agentId: ids.agentId, ...(typeof name === "string" && name !== "" ? { agentName: name } : {}), text, at: typeof message.createdAt === "string" ? message.createdAt : new Date().toISOString(), messageId: ids.messageId, threadId: ids.threadId };
}
