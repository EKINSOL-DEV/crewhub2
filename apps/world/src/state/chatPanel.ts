/* The Chat panel (spec addendum "chat with the agents", road A): the chat UI is crewhub-loops' own, framed in a panel of
   the world. The pure parts: where the frame points, what the frame may do, and the text view's line on where chat lives.
   The world handles no password: the frame carries the person's own crewhub-loops session (the cookie is SameSite=Lax and
   127.0.0.1:<world> and 127.0.0.1:<loops> are one site), or loops' own sign-in shows inside it. What the bubbles need is
   the road's (`chatWords`): nothing on the key road, the host's kept session on the session road. */
import type { HostHealth, HostSessionState } from "@crewhub/loops-client";
import type { AgentCardFacts } from "@crewhub/world-model";
import { loopsWebUrl } from "./source.ts";

/**
 * The page the panel frames: the root of the loops web app the host names (`health.loopsWebUrl`), which is the app
 * shell with its chat dock (the "Agent chats" menu at the panel's width). With an agent, `?chat=<loops agent id>`: loops'
 * web (world/viewer-key cb163004) opens that agent's chat through the dock's own rule once its list is known and then
 * drops the parameter from the address; the login redirect keeps the query, so the chat opens after a sign-in too. An
 * older loops ignores the parameter, so the panel's words name the head to open as well. The world's agent key is
 * loops' agent id for a registered agent; a worker's key (`session/name`) names nothing in the dock, and loops says
 * nothing about an unknown name. Only the origin of the host's URL is used, so nothing else of it reaches the frame.
 */
export function chatFrameUrl(health: HostHealth | null | undefined, agent: string | null = null): string {
  const root = `${new URL(loopsWebUrl(health)).origin}/`;
  return agent ? `${root}?${CHAT_PARAM}=${encodeURIComponent(agent)}` : root;
}

/**
 * The agent a card's Chat opens the panel for (round 13): the agent itself when loops' dock has a head for it
 * (`AgentCardFacts.chat.self`: enabled, loops role lead), else its lead when loops lists that one, else nobody: the card
 * shows no Chat button then and says why (`chatCardNote`). So `?chat=` only ever names an agent loops' dock can open,
 * and "Chat with <name>" never pretends.
 */
export function chatTargetOf(facts: Pick<AgentCardFacts, "key" | "displayName" | "chat">): { key: string; name: string } | null {
  if (facts.chat.self) return { key: facts.key, name: facts.displayName };
  return facts.chat.lead ? { key: facts.chat.lead.key, name: facts.chat.lead.displayName } : null;
}

/**
 * The card's line when loops has no chat head for the agent: why (loops' own reason, `AgentChatFacts.why`), and whose
 * chat to use instead when loops lists its lead; null for an agent with a head. English here, as `chatPlaceLine`.
 */
export function chatCardNote(facts: Pick<AgentCardFacts, "displayName" | "chat">): string | null {
  if (facts.chat.self) return null;
  const why = facts.chat.why ?? "not a lead";
  return facts.chat.lead
    ? `crewhub-loops chats with leads only: ${facts.displayName} is ${why}; chat with its lead ${facts.chat.lead.displayName}.`
    : `crewhub-loops chats with leads only: ${facts.displayName} is ${why}.`;
}

/** Loops' query parameter for one agent's chat (`apps/web/src/components/bubbles/openChat.ts` `OPEN_CHAT_PARAM`). */
export const CHAT_PARAM = "chat";

/**
 * What the framed loops web may do, no wider than its chat needs. Each token and why:
 * - allow-same-origin: the frame keeps loops' own origin, so the session cookie and loops' storage reach it
 *   (without it the frame is an opaque origin and loops is signed out);
 * - allow-scripts: loops' web is a React app;
 * - allow-forms: the sign-in form and the chat's compose form;
 * - allow-popups and allow-popups-to-escape-sandbox: a link in a message (a ticket, an attachment) opens in a real tab,
 *   not a sandboxed one that cannot load the app;
 * - allow-downloads: an attachment can be saved.
 * Not granted: allow-top-navigation (loops must never navigate the world away), allow-modals (a blocking dialog would
 * freeze the world's tab; loops uses its own dialogs), pointer lock, orientation lock, presentation.
 */
export const CHAT_FRAME_SANDBOX = ["allow-same-origin", "allow-scripts", "allow-forms", "allow-popups", "allow-popups-to-escape-sandbox", "allow-downloads"] as const;

/** The permissions policy of the frame: only the clipboard write loops' copy buttons use. No camera, microphone or location. */
export const CHAT_FRAME_ALLOW = "clipboard-write";


/**
 * The chat's one story per road (round 14): what the bubbles need and what typing needs, the same words in the
 * Connection panel's Chat section, the Chat panel's small print and the text view's Chat line. `bubbles` is the state
 * (`connection.session.state`: key, signed-out, signed-in, expired; a host from before keeps none); `typing` is the
 * framed chat, which is crewhub-loops' own on every road and always needs the person signed in to loops in this browser.
 * On the key road the bubbles need no sign-in; on the session road the host keeps the person's session for chat reads
 * only, so "the world keeps no session" is said only where it is true. English here, as `chatPlaceLine`.
 */
export interface ChatWords {
  /** The bubbles on this road: whether they come, and what the world or the host keeps for them. */
  bubbles: string;
  /** Typing in the framed chat, the same on every road. */
  typing: string;
}

export const CHAT_TYPING_WORDS =
  "Typing in the framed chat is crewhub-loops' own: it needs you signed in to crewhub-loops as a person in this browser, with chat bubbles switched on there (Settings > Features); signed out, crewhub-loops' own sign-in shows in the frame, and the world handles no password.";

export function chatWords(session: Pick<HostSessionState, "state" | "name"> | null | undefined): ChatWords {
  const typing = CHAT_TYPING_WORDS;
  if (!session) return { bubbles: "This host keeps no session and shows no bubbles.", typing };
  const who = session.name ? ` as ${session.name}` : "";
  const of = session.name ? ` of ${session.name}` : "";
  switch (session.state) {
    case "key":
      return { bubbles: "A sign-in is not needed for the bubbles: this crewhub-loops lets the world's key read the chat, so the agents' answers show as bubbles and the world keeps no session.", typing };
    case "signed-in":
      return { bubbles: `Signed in${who}: the agents' answers show as bubbles. The host keeps that session for chat reads only (never the password, never a message).`, typing };
    case "expired":
      return { bubbles: `The session${of} is no longer accepted by crewhub-loops: sign in again in the Connection panel's Chat section for bubbles; the host keeps nothing until then.`, typing };
    default:
      return { bubbles: "Not signed in: no bubbles. Sign in in the Connection panel's Chat section and the host keeps your crewhub-loops session for chat reads only (never the password), so the agents' answers show as bubbles.", typing };
  }
}

/** Both sentences in one line, for the Chat panel's small print and the text view. */
export function chatWordsLine(session: Pick<HostSessionState, "state" | "name"> | null | undefined): string {
  const words = chatWords(session);
  return `${words.bubbles} ${words.typing}`;
}

/** The text view's line on where chat lives: the panel (live, with the road's story), or the demo's own scripted dock. */
export function chatPlaceLine(mode: "demo" | "live", session?: Pick<HostSessionState, "state" | "name"> | null): string {
  return mode === "demo"
    ? "Chat: the demo's own scripted chat, in the dock at the bottom right (the Agent chats menu on a phone); replies are scripted."
    : `Chat: crewhub-loops' own chat, framed in the world's Chat panel (the Chat chip, or Chat with an agent on its card): open the agent's chat head in the dock there. ${chatWordsLine(session)}`;
}
