import assert from "node:assert/strict";
import test from "node:test";
import type { HostHealth } from "@crewhub/loops-client";
import { CHAT_FRAME_ALLOW, CHAT_FRAME_SANDBOX, CHAT_PARAM, CHAT_TYPING_WORDS, VIEWER_KEY_WORDS, chatCardNote, chatFrameUrl, chatGlance, chatPlaceLine, chatTargetOf, chatWords, chatWordsLine } from "../src/state/chatPanel.ts";
import { DEFAULT_LOOPS_URL } from "../src/state/source.ts";

const health = (loopsWebUrl?: string): HostHealth => ({ loops: "ok", keyName: "crewhub-world", sharedKey: false, pairing: "off", paired: true, ...(loopsWebUrl === undefined ? {} : { loopsWebUrl }) });

test("the frame points at the root of the loops web app the host names, origin only", () => {
  assert.equal(chatFrameUrl(health("http://127.0.0.1:8291")), "http://127.0.0.1:8291/");
  assert.equal(chatFrameUrl(health("http://127.0.0.1:8291/p/crewhub?x=1")), "http://127.0.0.1:8291/", "a path or a query in the URL never reaches the frame");
  assert.equal(chatFrameUrl(health()), `${DEFAULT_LOOPS_URL}/`, "a host from before loopsWebUrl: the app's default");
  assert.equal(chatFrameUrl(null), `${DEFAULT_LOOPS_URL}/`, "no host answer: the default");
  assert.equal(chatFrameUrl(health("javascript:alert(1)")), `${DEFAULT_LOOPS_URL}/`, "only http(s) is framed");
});

test("with an agent the frame asks loops for that agent's chat: ?chat=<loops agent id>, encoded; the chip's frame has no query", () => {
  assert.equal(CHAT_PARAM, "chat", "loops' OPEN_CHAT_PARAM");
  assert.equal(chatFrameUrl(health("http://127.0.0.1:8291"), "cl-lead"), "http://127.0.0.1:8291/?chat=cl-lead");
  assert.equal(chatFrameUrl(health("http://127.0.0.1:8291"), "ekinsol/cr-dev-1"), "http://127.0.0.1:8291/?chat=ekinsol%2Fcr-dev-1", "a worker's key travels encoded; loops ignores a name its dock has not");
  assert.equal(chatFrameUrl(health("http://127.0.0.1:8291"), "a&b=c"), "http://127.0.0.1:8291/?chat=a%26b%3Dc", "nothing else can be smuggled into the query");
  assert.equal(chatFrameUrl(health("http://127.0.0.1:8291"), null), "http://127.0.0.1:8291/");
  assert.equal(chatFrameUrl(health("http://127.0.0.1:8291"), ""), "http://127.0.0.1:8291/", "an empty name asks for nothing");
});

test("the frame's sandbox is no wider than loops' chat needs: never top navigation or modals", () => {
  const tokens = new Set<string>(CHAT_FRAME_SANDBOX);
  assert.equal(tokens.size, CHAT_FRAME_SANDBOX.length, "no token twice");
  for (const needed of ["allow-same-origin", "allow-scripts", "allow-forms", "allow-popups", "allow-popups-to-escape-sandbox", "allow-downloads"]) assert.ok(tokens.has(needed), needed);
  for (const never of ["allow-top-navigation", "allow-top-navigation-by-user-activation", "allow-modals", "allow-pointer-lock", "allow-orientation-lock", "allow-presentation"]) assert.ok(!tokens.has(never), `${never} is not granted`);
  assert.equal(CHAT_FRAME_ALLOW, "clipboard-write", "the permissions policy: the clipboard write of loops' copy buttons, nothing else");
});

test("the text view says where chat lives: the panel in live mode with the road's story, the scripted dock in the demo", () => {
  assert.match(chatPlaceLine("live", { state: "key" }), /^Chat: crewhub-loops' own chat, framed in the world's Chat panel/);
  assert.equal(chatPlaceLine("live", { state: "key" }), `Chat: crewhub-loops' own chat, framed in the world's Chat panel (the Chat chip, or Chat with an agent on its card): open the agent's chat head in the dock there. ${chatWordsLine({ state: "key" })}`);
  assert.match(chatPlaceLine("live"), /No bubbles: this crewhub-loops does not let the world read the chat\. For the agents' answers as bubbles, make a viewer key/, "no session in health: this loops does not let the key read the chat");
  assert.match(chatPlaceLine("demo"), /^Chat: the demo's own scripted chat, in the dock/);
  assert.doesNotMatch(chatPlaceLine("demo"), /panel|signed in/);
});

test("chatWords: one story per road (key, or not), the same words for the Connection panel, the Chat panel and the text view", () => {
  assert.equal(CHAT_TYPING_WORDS, "Typing in the framed chat is crewhub-loops' own: it needs you signed in to crewhub-loops as a person in this browser, with chat bubbles switched on there (Settings > Features); signed out, crewhub-loops' own sign-in shows in the frame, and the world handles no password.");
  for (const session of [undefined, null, { state: "key" }] as const) assert.equal(chatWords(session).typing, CHAT_TYPING_WORDS, "typing is the same on every road");
  const key = chatWords({ state: "key" });
  assert.equal(key.bubbles, "A sign-in is not needed for the bubbles: this crewhub-loops lets the world's key read the chat, so the agents' answers show as bubbles and the world keeps no session.");
  const none = chatWords(undefined);
  assert.equal(none.bubbles, `No bubbles: this crewhub-loops does not let the world read the chat. For the agents' answers as bubbles, ${VIEWER_KEY_WORDS}.`);
  assert.match(none.bubbles, /make a viewer key in Settings > Agents > Connect CrewHub World/, "the way to the bubbles: loops' card");
  assert.equal(chatWords(null).bubbles, none.bubbles);
  assert.ok(!/sign in|Sign in/.test(none.bubbles.replace(/sign-in/g, "")), "no sign-in road any more: nothing asks the person to sign in for bubbles");
  assert.equal(chatWordsLine({ state: "key" }), `${key.bubbles} ${key.typing}`);
  assert.equal(chatWordsLine(undefined), `${none.bubbles} ${none.typing}`);
});

test("a card's Chat names only an agent loops' dock can open: the lead itself, a worker's lead, nobody for the postman; the card's words say why", () => {
  const h = health("http://127.0.0.1:8291");
  const lead = { key: "cl-lead", displayName: "CL Lead", chat: { self: true, why: null, lead: null } };
  const worker = { key: "ekinsol/cl-dev-1", displayName: "cl-dev-1", chat: { self: false, why: "a worker, not an agent registered in crewhub-loops", lead: { key: "cl-lead", displayName: "CL Lead" } } };
  const postman = { key: "postman", displayName: "Postman", chat: { self: false, why: "the postman (loops role router)", lead: null } };
  const disabled = { key: "cl-old", displayName: "Old Lead", chat: { self: false, why: "disabled in crewhub-loops", lead: { key: "cl-lead", displayName: "CL Lead" } } };
  assert.deepEqual(chatTargetOf(lead), { key: "cl-lead", name: "CL Lead" });
  assert.equal(chatFrameUrl(h, chatTargetOf(lead)?.key ?? null), "http://127.0.0.1:8291/?chat=cl-lead");
  assert.deepEqual(chatTargetOf(worker), { key: "cl-lead", name: "CL Lead" }, "a worker's card chats with its lead");
  assert.equal(chatFrameUrl(h, chatTargetOf(worker)?.key ?? null), "http://127.0.0.1:8291/?chat=cl-lead", "never ?chat=<worker>: loops' dock has no head for it");
  assert.equal(chatTargetOf(postman), null, "the postman has no head and no lead: no Chat button at all");
  assert.equal(chatFrameUrl(h, chatTargetOf(postman)?.key ?? null), "http://127.0.0.1:8291/", "the chip's root is all that is left");
  assert.equal(chatCardNote(lead), null, "a lead's card has the Chat button and no note");
  assert.equal(chatCardNote(worker), "crewhub-loops chats with leads only: cl-dev-1 is a worker, not an agent registered in crewhub-loops; chat with its lead CL Lead.");
  assert.equal(chatCardNote(postman), "crewhub-loops chats with leads only: Postman is the postman (loops role router).");
  assert.equal(chatCardNote(disabled), "crewhub-loops chats with leads only: Old Lead is disabled in crewhub-loops; chat with its lead CL Lead.");
});

test("chatGlance: the Chat panel's one line to act on, per road, short, one story with chatWords", () => {
  assert.equal(chatGlance({ state: "key" }), "Sign in to crewhub-loops below to type; the answers come as bubbles without it.");
  assert.equal(chatGlance(undefined), "Sign in to crewhub-loops below to type; no bubbles here: a viewer key would read the chat.");
  assert.equal(chatGlance(null), chatGlance(undefined));
  for (const session of [{ state: "key" as const }, null]) {
    const line = chatGlance(session);
    assert.ok(line.length <= 140, `short: ${line.length} characters`);
    assert.match(line, /^Sign in to crewhub-loops below to type;/, "typing always needs loops' own sign-in in the frame");
    assert.equal(/come as bubbles/.test(line), session !== null, "bubbles only on the key road");
    assert.equal(/no bubbles/.test(line), session === null, `one story with chatWords: ${chatWords(session).bubbles.slice(0, 40)}`);
  }
});
