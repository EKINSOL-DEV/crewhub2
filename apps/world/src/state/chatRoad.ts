/* The chat road (round 28; the contract of r28-common, shared with road 2's probe in state/pageChat): which of the two
   narrow roads the page's bubbles come by, as one value, and the words for every road in every place that speaks of the
   chat: the Connection panel's Chat section, the Chat panel's glance and "About this chat", Recent answers' empty state,
   the card's Answers, the text view's Chat line. Pure: no store, no fetch.

   The roads, both narrower than a person's session (crewhub-loops main 88760279, CL-494 steps 2 and 4):
   - `key`: the host reads the chat with the viewer key (`connection.session.state === "key"` in health). A viewer key
     reads ONLY the chat of the admin who made it (`agent_keys.made_by`, loops pull request 964): that person's messages and the
     agents' answers to them; a key with no maker reads no chat. Loops does not name the maker to the key (not on
     `GET /api/auth/me`, not on the key's agent entry, not on the threads list; a message carries its author, which is
     the maker only once they have written), so the words say "the person who made the key".
   - `page`: the page reads loops itself, as the signed-in person, with the person's cookie (`credentials: "include"`),
     where the owner set `CHL_WORLD_ORIGIN` to this page's exact origin (loops pull request 968); decided by the page's own probe.
   - `none`: neither; the honest line, per what the probe could tell.
   The default: `key` when the host's key reads the chat; else `page` when the page's probe answers; else `none`.
   Road A, the framed loops chat in the Chat panel, is not a read by the world and stays on every road (`chatPanel.ts`). */

export type ChatRoad = "key" | "page" | "none";

/**
 * What the page's probe of road 2 found (state/pageChat, r28-road2): `on`, `GET /api/dm/threads` with the cookie
 * answered 200; `signed-out`, loops answered but the person is not signed in to loops in this browser (401/403);
 * `origin-not-set`, loops is there but refuses the page's origin (a CORS failure: the world's origin is not set there);
 * `unreachable`, nothing answered at all; `unknown`, the probe has not run or could not tell.
 */
export type PageProbe = "on" | "signed-out" | "origin-not-set" | "unreachable" | "chat-off" | "remote" | "unknown";
export const PAGE_PROBES: readonly PageProbe[] = ["on", "signed-out", "origin-not-set", "unreachable", "chat-off", "remote", "unknown"];

/**
 * The host's word on its key, from health (round 29): `true` where `connection.session.state` is `key`; `null` where
 * the host has not said (`unknown`: no link yet, the key unchecked or being checked; or no connection at all); `false`
 * where its connection names no session (it knows the key does not read the chat).
 */
export function hostKeyReadsChatOf(health: { connection?: { session?: { state: string } } } | null | undefined): boolean | null {
  const connection = health?.connection;
  if (!connection) return null;
  if (connection.session === undefined) return false;
  return connection.session.state === "key" ? true : null;
}

export interface ChatRoadInput {
  /** Whether the host's key reads the chat (health `connection.session.state === "key"`); null while no host health is known. */
  hostKeyReadsChat: boolean | null;
  /** The page's own probe of road 2; `unknown` until it has run. */
  pageProbe: PageProbe;
}

/** The default and the fallback: the host's key first, the page's own read second, else none. */
export function decideChatRoad(input: ChatRoadInput): ChatRoad {
  if (input.hostKeyReadsChat === true) return "key";
  if (input.pageProbe === "on") return "page";
  return "none";
}

/** The road with what its words need: the page's own origin, which is the exact value of loops' `CHL_WORLD_ORIGIN` for road 2. */
export interface ChatRoadView extends ChatRoadInput {
  road: ChatRoad;
  /** This page's origin (`location.origin`), e.g. `http://127.0.0.1:5180`. */
  pageOrigin: string;
}

export function chatRoadView(input: ChatRoadInput & { pageOrigin: string }): ChatRoadView {
  return { ...input, road: decideChatRoad(input) };
}

/** Loops' setting that opens road 2, with the one value it must have for this page. */
export const WORLD_ORIGIN_VAR = "CHL_WORLD_ORIGIN";
export const worldOriginSetting = (pageOrigin: string): string => `${WORLD_ORIGIN_VAR}=${pageOrigin}`;

/** The way to road 1: a viewer key, by loops' card; what it reads is said with it, so nobody is surprised by whose chat it is. */
export const VIEWER_KEY_WORDS = "make a viewer key in Settings > Agents > Connect CrewHub World (it reads only the chat of the person who makes it) and paste it in the world's Connect screen";

/** The way to road 2, with the exact setting for this page. */
export const pageRoadWords = (pageOrigin: string): string => `let this page read your own chat: set ${worldOriginSetting(pageOrigin)} on that crewhub-loops (on this computer), restart it and sign in to it in this browser`;

/**
 * The chat's one story per road (round 14; three roads since round 28): what the bubbles need and what typing needs,
 * the same words in the Connection panel's Chat section, the Chat panel's "About this chat" and the text view's Chat
 * line. `bubbles` is the road; `typing` is the framed chat, which is crewhub-loops' own on every road and always needs
 * the person signed in to loops in this browser. English here, as the card's words.
 */
export interface ChatWords {
  /** The bubbles on this road: whether they come, whose chat they come from, and what the world or the host keeps for them. */
  bubbles: string;
  /** Typing in the framed chat, the same on every road. */
  typing: string;
}

export const CHAT_TYPING_WORDS =
  "Typing in the framed chat is crewhub-loops' own: it needs you signed in to crewhub-loops as a person in this browser, with chat bubbles switched on there (Settings > Features); signed out, crewhub-loops' own sign-in shows in the frame, and the world handles no password.";

/** Road 1's words, the same in every place: whose chat the key reads. */
export const KEY_ROAD_BUBBLES = "A sign-in is not needed for the bubbles: this crewhub-loops lets the world's key read the chat of the person who made the key (only theirs), so the agents' answers to that person show as bubbles, and the world keeps no session.";

/** Road 2's words: the page reads as you, nothing through the host. */
export const pageRoadBubbles = (pageOrigin: string): string => `The bubbles come from your own chat: this crewhub-loops lets this page read the chat as you, signed in there in this browser (the world's origin is set there, ${worldOriginSetting(pageOrigin)}), so the agents' answers to you show as bubbles; nothing of it goes through the host, and the world keeps nothing.`;

/**
 * The `none` road's reason and way out, by what the probe could tell. The reason finishes a sentence that starts with
 * "No bubbles:" or "No answers can arrive:"; the way finishes "For bubbles, ...".
 */
export function noneWords(view: Pick<ChatRoadView, "pageProbe" | "pageOrigin"> & Partial<Pick<ChatRoadView, "hostKeyReadsChat">>): { reason: string; way: string } {
  const key = "this crewhub-loops does not let the world's key read the chat";
  // The host has not said yet (round 29, Medium 2): no road is decided on that, and nothing is asked of loops.
  if (view.hostKeyReadsChat === null && view.pageProbe === "unknown") return { reason: "the host has not said yet whether its key reads the chat (it is still connecting to crewhub-loops)", way: "wait a moment: the road is decided once the host has connected" };
  switch (view.pageProbe) {
    case "signed-out":
      return { reason: `${key}, and this page may read your own chat only once you are signed in to crewhub-loops in this browser`, way: `sign in to crewhub-loops in this browser (the framed chat, or the app), or ${VIEWER_KEY_WORDS}` };
    case "origin-not-set":
      return { reason: `${key}, nor this page: the world's origin is not set there`, way: `set ${worldOriginSetting(view.pageOrigin)} on that crewhub-loops and restart it, or ${VIEWER_KEY_WORDS}` };
    case "unreachable":
      return { reason: `${key}, and this page cannot reach crewhub-loops from this browser`, way: `${VIEWER_KEY_WORDS}, or run crewhub-loops on this computer with ${worldOriginSetting(view.pageOrigin)} set` };
    case "chat-off":
      return { reason: `${key}, and crewhub-loops' chat bubbles are switched off there (Settings > Features), so this page cannot read your chat either`, way: `switch the chat bubbles on in crewhub-loops (Settings > Features) and this page reads your own chat, or ${VIEWER_KEY_WORDS}` };
    case "remote":
      return { reason: `${key}, and this page reads the chat from the browser only from a crewhub-loops on this computer (yours is at another address, so your sign-in there never travels with the page's asks)`, way: VIEWER_KEY_WORDS };
    case "on":
    case "unknown":
    default:
      return { reason: key, way: `${VIEWER_KEY_WORDS}, or ${pageRoadWords(view.pageOrigin)}` };
  }
}

export function chatWords(view: ChatRoadView): ChatWords {
  const typing = CHAT_TYPING_WORDS;
  if (view.road === "key") return { bubbles: KEY_ROAD_BUBBLES, typing };
  if (view.road === "page") return { bubbles: pageRoadBubbles(view.pageOrigin), typing };
  const none = noneWords(view);
  return { bubbles: `No bubbles: ${none.reason}. For the agents' answers as bubbles, ${none.way}.`, typing };
}

/** Both sentences in one line, for the Chat panel's disclosure, the Connection panel and the text view. */
export function chatWordsLine(view: ChatRoadView): string {
  const words = chatWords(view);
  return `${words.bubbles} ${words.typing}`;
}

/**
 * The Chat panel's one line to act on (round 17): the one thing the person must do on this road, under "crewhub-loops'
 * own chat, framed here". Typing always needs loops' own sign-in in the frame; the bubbles' side is one clause by the
 * road. Short: at most two lines of the panel (about 110 characters), so the exact origin setting is not in it; the
 * whole story with the value (`chatWordsLine`) stays behind "About this chat".
 */
export function chatGlance(view: ChatRoadView): string {
  const head = "Sign in to crewhub-loops below to type;";
  if (view.road === "key") return `${head} the answers come as bubbles without it.`;
  // The page road means signed in (the probe answered 200 with the person's own session): nothing to sign in to.
  if (view.road === "page") return "Type to an agent below (you are signed in there); the answers come as bubbles: this page reads your own chat.";
  switch (view.pageProbe) {
    case "signed-out":
      return `${head} signed in, the answers come as bubbles: this page reads your chat.`;
    case "origin-not-set":
      return `${head} no bubbles: the world's origin is not set on crewhub-loops (see About).`;
    case "unreachable":
      return `${head} no bubbles: this page cannot reach crewhub-loops (see About).`;
    case "chat-off":
      return `${head} no bubbles: crewhub-loops' chat bubbles are switched off there (see About).`;
    case "remote":
      return `${head} no bubbles: a viewer key is the road to a crewhub-loops elsewhere (see About).`;
    default:
      if (view.hostKeyReadsChat === null) return `${head} no bubbles yet: the host is still connecting to crewhub-loops.`;
      return `${head} no bubbles: a viewer key or the world's origin would read the chat.`;
  }
}

/**
 * The Recent answers list's empty state in plain words, per road: in the demo an answer comes from its own dock
 * (round 17); on a live page whether answers can arrive at all, whose, and the way when none can.
 */
export function recentEmptyWords(mode: "demo" | "live", view: ChatRoadView | null | undefined): string {
  if (mode === "demo") return "No answers yet: write to an agent in the demo's chat dock (bottom right) and its scripted reply shows as a bubble and stays here.";
  if (view?.road === "key") return "No answers yet: this crewhub-loops lets the world's key read the chat of the person who made the key, so an agent's answer to them shows as a bubble and stays here.";
  if (view?.road === "page") return "No answers yet: this page reads your own chat from crewhub-loops, so an agent's answer to you shows as a bubble and stays here.";
  const none = noneWords(view ?? { pageProbe: "unknown", pageOrigin: "" });
  return `No answers can arrive: ${none.reason}. For bubbles, ${none.way}.`;
}

/**
 * The card's Answers section when the agent has no answer in the list (round 22): why none can be known, per road, in
 * one sentence; the same facts as `recentEmptyWords`, said for one agent.
 */
export function cardAnswersEmpty(mode: "demo" | "live", view: ChatRoadView | null | undefined): string {
  if (mode === "demo") return "No answer yet: write to it in the demo's chat dock (bottom right) and its scripted reply shows here.";
  if (view?.road === "key") return "No answer from it since this page opened; this crewhub-loops lets the world's key read the chat of the person who made the key, so one to them would show here.";
  if (view?.road === "page") return "No answer from it since this page opened; this page reads your own chat from crewhub-loops, so one to you would show here.";
  const none = noneWords(view ?? { pageProbe: "unknown", pageOrigin: "" });
  return `No answers can arrive here: ${none.reason}. For the agents' answers, ${none.way}.`;
}

/** The text view's line on where chat lives: the panel (live, with the road's story), or the demo's own scripted dock. */
export function chatPlaceLine(mode: "demo" | "live", view: ChatRoadView): string {
  return mode === "demo"
    ? "Chat: the demo's own scripted chat, in the dock at the bottom right (the Agent chats menu on a phone); replies are scripted."
    : `Chat: crewhub-loops' own chat, framed in the world's Chat panel (the Chat chip, or Chat with an agent on its card): open the agent's chat head in the dock there. ${chatWordsLine(view)}`;
}
