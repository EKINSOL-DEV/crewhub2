/* The Chat panel (spec addendum "chat with the agents", road A): the chat UI is crewhub-loops' own, framed in a panel of
   the world. The pure parts: where the frame points, what the frame may do, and the text view's line on where chat lives.
   The world handles no password and no session: the frame carries the person's own crewhub-loops session (the cookie is
   SameSite=Lax and 127.0.0.1:<world> and 127.0.0.1:<loops> are one site), or loops' own sign-in shows inside it. */
import type { HostHealth } from "@crewhub/loops-client";
import { loopsWebUrl } from "./source.ts";

/**
 * The page the panel frames: the root of the loops web app the host names (`health.loopsWebUrl`), which is the app
 * shell with its chat dock (the "Agent chats" menu at the panel's width). Loops has no chat route and a cross-origin
 * parent cannot send its in-page open-chat event, so the agent is not preselected: the panel says which head to open.
 * Only the origin is used, so nothing else of the URL (a path, a query) reaches the frame.
 */
export function chatFrameUrl(health: HostHealth | null | undefined): string {
  return `${new URL(loopsWebUrl(health)).origin}/`;
}

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


/** The text view's line on where chat lives: the panel (live), or the demo's own scripted dock. */
export function chatPlaceLine(mode: "demo" | "live"): string {
  return mode === "demo"
    ? "Chat: the demo's own scripted chat, in the dock at the bottom right (the Agent chats menu on a phone); replies are scripted."
    : "Chat: crewhub-loops' own chat, framed in the world's Chat panel (the Chat chip, or Chat with an agent on its card): open the agent's chat head in the dock there. It needs you signed in to crewhub-loops as a person in this browser; the world keeps no session.";
}
