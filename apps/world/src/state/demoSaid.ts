/* The demo's dock answers as lines of the said store (round 17): in pure demo mode (no host) the scripted replies the
   copied dock shows ("(demo reply) …") feed the same store the live bubbles and the Recent answers list use, so demo and
   live look alike: a bubble over the agent, the text view's "says" line, the chat mark from the town, and the row in
   Recent answers (a row opens the agent's card there, as the demo's bubble tap does). The pure part: a `dm.created`
   envelope the demo source emits (its actor the agent, its payload the thread, the message and the agent) and the
   thread's messages give one ChatLine, the message's first line cut as the host cuts it (`firstLine`, the same rule as
   apps/host/src/session.ts: at most LINE_MAX characters, an ellipsis after). Null for the person's own message or an
   event of another kind. */
import type { ChatLine, DmMessage, Envelope } from "@crewhub/loops-client";

/** The first non-empty line of a message, at most LINE_MAX characters (the host's rule for the live line). */
export const LINE_MAX = 140;
export function firstLine(text: string): string {
  const line = text.replace(/\r/g, "").split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
  return line.length > LINE_MAX ? `${line.slice(0, LINE_MAX - 1)}…` : line;
}

/** True for the envelope that carries an agent's own message to the person (the reply), never the person's or the postman's events. */
export function isAgentDm(envelope: Pick<Envelope, "type" | "actor" | "payload">): envelope is Pick<Envelope, "type" | "actor" | "payload"> & { payload: { threadId: string; messageId: string; agentId: string } } {
  const { threadId, messageId, agentId } = envelope.payload;
  return envelope.type === "dm.created" && envelope.actor.kind === "agent" && typeof threadId === "string" && typeof messageId === "string" && typeof agentId === "string" && envelope.actor.id === agentId;
}

/** The line for the said store from the envelope's message among `messages`; null when it is not there or not the agent's. */
export function demoChatLine(envelope: Pick<Envelope, "type" | "actor" | "payload">, messages: readonly Pick<DmMessage, "id" | "threadId" | "author" | "bodyText" | "createdAt">[], agentName: string | null): ChatLine | null {
  if (!isAgentDm(envelope)) return null;
  const message = messages.find((m) => m.id === envelope.payload.messageId);
  if (message === undefined || message.author.kind !== "agent") return null;
  const text = firstLine(message.bodyText);
  if (text === "") return null;
  return { agentId: envelope.payload.agentId, ...(agentName === null ? {} : { agentName }), text, at: message.createdAt, messageId: message.id, threadId: message.threadId };
}
