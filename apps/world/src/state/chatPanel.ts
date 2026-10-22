/* The Chat panel (spec addendum "chat with the agents", road A): the chat UI is crewhub-loops' own, framed in a panel of
   the world. The pure parts: where the frame points, what the frame may do, and which agent a card's Chat opens. The
   world handles no password: the frame carries the person's own crewhub-loops session (the cookie is SameSite=Lax and
   127.0.0.1:<world> and 127.0.0.1:<loops> are one site), or loops' own sign-in shows inside it. The frame is not a read
   by the world: what the bubbles need is the chat road (state/chatRoad, round 28: the viewer key on the host, or the
   page's own read, or neither), and its words live there. */
import type { HostHealth } from "@crewhub/loops-client";
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

