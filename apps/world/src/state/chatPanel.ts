/* The Chat panel (spec addendum "chat with the agents", road A): the chat UI is crewhub-loops' own, framed in a panel of
   the world. The pure parts: where the frame points, what the frame may do, and the text view's line on where chat lives.
   The world handles no password: the frame carries the person's own crewhub-loops session (the cookie is SameSite=Lax and
   127.0.0.1:<world> and 127.0.0.1:<loops> are one site), or loops' own sign-in shows inside it. What the bubbles need is
   the road's (`chatWords`): a crewhub-loops that lets the world's key read the chat (the key road, `connection.session`
   `key`), else no bubbles and the way to a viewer key. The sign-in road went in round 19. */
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
 * The chat's one story per road (round 14; two roads since round 19): what the bubbles need and what typing needs, the
 * same words in the Connection panel's Chat section, the Chat panel's "About this chat" and the text view's Chat line.
 * `bubbles` is the road (`connection.session`: `key`, this loops lets the world's key read the chat, so the answers
 * come as bubbles and the world keeps no session; absent, it does not: no bubbles, and how to make a viewer key);
 * `typing` is the framed chat, which is crewhub-loops' own on every road and always needs the person signed in to loops
 * in this browser. English here, as `chatPlaceLine`.
 */
export interface ChatWords {
  /** The bubbles on this road: whether they come, and what the world or the host keeps for them. */
  bubbles: string;
  /** Typing in the framed chat, the same on every road. */
  typing: string;
}

export const CHAT_TYPING_WORDS =
  "Typing in the framed chat is crewhub-loops' own: it needs you signed in to crewhub-loops as a person in this browser, with chat bubbles switched on there (Settings > Features); signed out, crewhub-loops' own sign-in shows in the frame, and the world handles no password.";

/** The way to the bubbles on a crewhub-loops that does not let the world's key read the chat: a viewer key, by loops' card. */
export const VIEWER_KEY_WORDS = "make a viewer key in Settings > Agents > Connect CrewHub World (a crewhub-loops with world/viewer-key) and paste it in the world's Connect screen";

export function chatWords(session: Pick<HostSessionState, "state"> | null | undefined): ChatWords {
  const typing = CHAT_TYPING_WORDS;
  if (session?.state === "key") return { bubbles: "A sign-in is not needed for the bubbles: this crewhub-loops lets the world's key read the chat, so the agents' answers show as bubbles and the world keeps no session.", typing };
  return { bubbles: `No bubbles: this crewhub-loops does not let the world read the chat. For the agents' answers as bubbles, ${VIEWER_KEY_WORDS}.`, typing };
}

/**
 * The Chat panel's one line to act on (round 17): the one thing the person must do on this road, under "crewhub-loops'
 * own chat, framed here". Typing always needs loops' own sign-in in the frame; the bubbles' side is one clause by the
 * road. The whole story (`chatWordsLine`) stays behind the panel's "About this chat" disclosure, in the Connection
 * panel and in the text view.
 */
export function chatGlance(session: Pick<HostSessionState, "state"> | null | undefined): string {
  if (session?.state === "key") return "Sign in to crewhub-loops below to type; the answers come as bubbles without it.";
  return "Sign in to crewhub-loops below to type; no bubbles here: a viewer key would read the chat.";
}

/** Both sentences in one line, for the Chat panel's disclosure, the Connection panel and the text view. */
export function chatWordsLine(session: Pick<HostSessionState, "state"> | null | undefined): string {
  const words = chatWords(session);
  return `${words.bubbles} ${words.typing}`;
}

/** The text view's line on where chat lives: the panel (live, with the road's story), or the demo's own scripted dock. */
export function chatPlaceLine(mode: "demo" | "live", session?: Pick<HostSessionState, "state"> | null): string {
  return mode === "demo"
    ? "Chat: the demo's own scripted chat, in the dock at the bottom right (the Agent chats menu on a phone); replies are scripted."
    : `Chat: crewhub-loops' own chat, framed in the world's Chat panel (the Chat chip, or Chat with an agent on its card): open the agent's chat head in the dock there. ${chatWordsLine(session)}`;
}
