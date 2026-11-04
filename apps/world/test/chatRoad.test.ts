import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_TYPING_WORDS,
  KEY_ROAD_BUBBLES,
  PAGE_PROBES,
  VIEWER_KEY_WORDS,
  WORLD_ORIGIN_VAR,
  cardAnswersEmpty,
  chatGlance,
  chatPlaceLine,
  chatRoadView,
  chatWords,
  chatWordsLine,
  hostKeyReadsChatOf,
  decideChatRoad,
  noneWords,
  pageRoadBubbles,
  recentEmptyWords,
  worldOriginSetting,
  type ChatRoadView,
  type PageProbe,
} from "../src/state/chatRoad.ts";
import { EN as en } from "../src/i18n/en.ts";

const ORIGIN = "http://127.0.0.1:5180";
const view = (hostKeyReadsChat: boolean | null, pageProbe: PageProbe, pageOrigin = ORIGIN): ChatRoadView => chatRoadView({ hostKeyReadsChat, pageProbe, pageOrigin });
const KEY = view(true, "unknown");
const PAGE = view(false, "on");
const NONE = (probe: PageProbe) => view(false, probe);
const NONE_PROBES: readonly PageProbe[] = ["unknown", "signed-out", "origin-not-set", "unreachable"];

test("decideChatRoad: the default and the fallback: the host's key first, the page's own read second, else none", () => {
  assert.deepEqual(PAGE_PROBES, ["on", "signed-out", "origin-not-set", "unreachable", "chat-off", "remote", "unknown"]);
  for (const probe of PAGE_PROBES) assert.equal(decideChatRoad({ hostKeyReadsChat: true, pageProbe: probe }), "key", `the key reads the chat: road 1 whatever the probe says (${probe})`);
  assert.equal(decideChatRoad({ hostKeyReadsChat: false, pageProbe: "on" }), "page", "the key does not read the chat and the page's probe answered: road 2");
  assert.equal(decideChatRoad({ hostKeyReadsChat: null, pageProbe: "on" }), "page", "no host health known yet, the probe answered: road 2");
  for (const probe of NONE_PROBES) {
    assert.equal(decideChatRoad({ hostKeyReadsChat: false, pageProbe: probe }), "none", probe);
    assert.equal(decideChatRoad({ hostKeyReadsChat: null, pageProbe: probe }), "none", probe);
  }
  assert.deepEqual(chatRoadView({ hostKeyReadsChat: false, pageProbe: "on", pageOrigin: ORIGIN }), { hostKeyReadsChat: false, pageProbe: "on", pageOrigin: ORIGIN, road: "page" });
});

test("the exact setting for road 2 is this page's origin, named with the variable", () => {
  assert.equal(WORLD_ORIGIN_VAR, "CHL_WORLD_ORIGIN");
  assert.equal(worldOriginSetting(ORIGIN), "CHL_WORLD_ORIGIN=http://127.0.0.1:5180");
  assert.equal(worldOriginSetting("http://127.0.0.1:5283"), "CHL_WORLD_ORIGIN=http://127.0.0.1:5283", "8293's setting as crewy set it");
});

test("chatWords: one story per road, the same words for the Connection panel, the Chat panel and the text view; typing the same everywhere", () => {
  assert.equal(CHAT_TYPING_WORDS, "Typing in the framed chat is crewhub-loops' own: it needs you signed in to crewhub-loops as a person in this browser, with chat bubbles switched on there (Settings > Features); signed out, crewhub-loops' own sign-in shows in the frame, and the world handles no password.");
  for (const v of [KEY, PAGE, ...NONE_PROBES.map(NONE)]) {
    assert.equal(chatWords(v).typing, CHAT_TYPING_WORDS, `typing is the same on every road (${v.road}/${v.pageProbe})`);
    assert.equal(chatWordsLine(v), `${chatWords(v).bubbles} ${CHAT_TYPING_WORDS}`);
  }
  // Road 1: whose chat the key reads, said plainly (loops #964: only the maker's; loops names the maker to nobody).
  assert.equal(chatWords(KEY).bubbles, KEY_ROAD_BUBBLES);
  assert.equal(KEY_ROAD_BUBBLES, "A sign-in is not needed for the bubbles: this crewhub-loops lets the world's key read the chat of the person who made the key (only theirs), so the agents' answers to that person show as bubbles, and the world keeps no session.");
  assert.match(VIEWER_KEY_WORDS, /^make a viewer key in Settings > Agents > Connect CrewHub World \(it reads only the chat of the person who makes it\) and paste it in the world's Connect screen$/);
  // Road 2: the page reads as you; nothing through the host; the setting named with its value.
  assert.equal(chatWords(PAGE).bubbles, pageRoadBubbles(ORIGIN));
  assert.equal(pageRoadBubbles(ORIGIN), "The bubbles come from your own chat: this crewhub-loops lets this page read the chat as you, signed in there in this browser (the world's origin is set there, CHL_WORLD_ORIGIN=http://127.0.0.1:5180), so the agents' answers to you show as bubbles; nothing of it goes through the host, and the world keeps nothing.");
  // None: the honest line, per what the probe could tell, each with both ways out where both are open.
  const none = Object.fromEntries(NONE_PROBES.map((p) => [p, chatWords(NONE(p)).bubbles])) as Record<PageProbe, string>;
  for (const p of NONE_PROBES) {
    assert.match(none[p], /^No bubbles: this crewhub-loops does not let the world's key read the chat/, p);
    assert.match(none[p], /For the agents' answers as bubbles, /, p);
    assert.match(none[p], /make a viewer key in Settings > Agents > Connect CrewHub World/, `${p}: the way to road 1 is always there`);
    assert.ok(!/signed-out|signed-in|expired|Forget the session|password/.test(none[p]), `${p}: nothing of the sign-in road`);
  }
  assert.equal(none.unknown, `No bubbles: this crewhub-loops does not let the world's key read the chat. For the agents' answers as bubbles, ${VIEWER_KEY_WORDS}, or let this page read your own chat: set CHL_WORLD_ORIGIN=http://127.0.0.1:5180 on that crewhub-loops (on this computer), restart it and sign in to it in this browser.`);
  assert.equal(none["signed-out"], `No bubbles: this crewhub-loops does not let the world's key read the chat, and this page may read your own chat only once you are signed in to crewhub-loops in this browser. For the agents' answers as bubbles, sign in to crewhub-loops in this browser (the framed chat, or the app), or ${VIEWER_KEY_WORDS}.`);
  assert.equal(none["origin-not-set"], `No bubbles: this crewhub-loops does not let the world's key read the chat, nor this page: the world's origin is not set there. For the agents' answers as bubbles, set CHL_WORLD_ORIGIN=http://127.0.0.1:5180 on that crewhub-loops and restart it, or ${VIEWER_KEY_WORDS}.`);
  assert.equal(none.unreachable, `No bubbles: this crewhub-loops does not let the world's key read the chat, and this page cannot reach crewhub-loops from this browser. For the agents' answers as bubbles, ${VIEWER_KEY_WORDS}, or run crewhub-loops on this computer with CHL_WORLD_ORIGIN=http://127.0.0.1:5180 set.`);
  assert.deepEqual(noneWords({ pageProbe: "on", pageOrigin: ORIGIN }), noneWords({ pageProbe: "unknown", pageOrigin: ORIGIN }), "a probe 'on' with the road none cannot happen; it reads as unknown");
  assert.equal(chatWords(view(null, "unknown")).bubbles, "No bubbles: the host has not said yet whether its key reads the chat (it is still connecting to crewhub-loops). For the agents' answers as bubbles, wait a moment: the road is decided once the host has connected.", "the host has not said yet (round 29): no guess, the honest wait");
  assert.equal(chatGlance(view(null, "unknown")), "Sign in to crewhub-loops below to type; no bubbles yet: the host is still connecting to crewhub-loops.");
  assert.equal(chatWords(view(false, "unknown")).bubbles, none.unknown, "the host said: its key does not read the chat; the probe has not run");
});

test("chatGlance: the Chat panel's one line to act on, per road and per none case, short, one story with chatWords", () => {
  assert.equal(chatGlance(KEY), "Sign in to crewhub-loops below to type; the answers come as bubbles without it.");
  assert.equal(chatGlance(PAGE), "Type to an agent below (you are signed in there); the answers come as bubbles: this page reads your own chat.", "the page road means signed in: nothing to sign in to (round 29)");
  assert.equal(chatGlance(NONE("unknown")), "Sign in to crewhub-loops below to type; no bubbles: a viewer key or the world's origin would read the chat.");
  assert.equal(chatGlance(NONE("signed-out")), "Sign in to crewhub-loops below to type; signed in, the answers come as bubbles: this page reads your chat.");
  assert.equal(chatGlance(NONE("origin-not-set")), "Sign in to crewhub-loops below to type; no bubbles: the world's origin is not set on crewhub-loops (see About).");
  assert.equal(chatGlance(NONE("unreachable")), "Sign in to crewhub-loops below to type; no bubbles: this page cannot reach crewhub-loops (see About).");
  for (const v of [KEY, PAGE, ...NONE_PROBES.map(NONE), view(false, "origin-not-set", "http://localhost:51234")]) {
    const line = chatGlance(v);
    assert.ok(line.length <= 112, `two lines of the panel (${v.road}/${v.pageProbe}): ${line.length} characters`);
    if (v.road === "page") assert.match(line, /^Type to an agent below \(you are signed in there\);/, "on the page road the person is signed in already");
    else assert.match(line, /^Sign in to crewhub-loops below to type;/, "typing needs loops' own sign-in in the frame on every other road");
    const bubbles = v.road !== "none" || v.pageProbe === "signed-out";
    assert.equal(/come as bubbles/.test(line), bubbles, `bubbles where a road is open or one sign-in away (${v.road}/${v.pageProbe})`);
    assert.equal(/no bubbles/.test(line), !bubbles, `one story with chatWords: ${chatWords(v).bubbles.slice(0, 40)}`);
  }
});

test("recent answers and the card: the empty state per road and per none case, and the demo's own dock", () => {
  // Round 31 (question 11): the empty line opens with "since this page opened" wherever an answer could arrive.
  assert.match(recentEmptyWords("demo", null), /^No answers since this page opened: write to an agent in the demo's chat dock .* its scripted reply shows as a bubble and stays here/);
  assert.equal(recentEmptyWords("live", KEY), "No answers since this page opened: this crewhub-loops lets the world's key read the chat of the person who made the key, so an agent's answer to them shows as a bubble and stays here.");
  assert.equal(recentEmptyWords("live", PAGE), "No answers since this page opened: this page reads your own chat from crewhub-loops, so an agent's answer to you shows as a bubble and stays here.");
  for (const words of [recentEmptyWords("demo", null), recentEmptyWords("live", KEY), recentEmptyWords("live", PAGE), cardAnswersEmpty("live", KEY), cardAnswersEmpty("live", PAGE)]) assert.ok(words.includes("since this page opened"), words);
  for (const p of NONE_PROBES) {
    const { reason, way } = noneWords(NONE(p));
    assert.equal(recentEmptyWords("live", NONE(p)), `No answers can arrive: ${reason}. For bubbles, ${way}.`, p);
    assert.equal(cardAnswersEmpty("live", NONE(p)), `No answers can arrive here: ${reason}. For the agents' answers, ${way}.`, p);
  }
  assert.match(recentEmptyWords("live", NONE("unknown")), /^No answers can arrive: this crewhub-loops does not let the world's key read the chat\. For bubbles, make a viewer key in Settings > Agents > Connect CrewHub World/);
  assert.equal(recentEmptyWords("live", null), recentEmptyWords("live", view(false, "unknown", "")), "no road known: the none words with no origin");
  assert.match(cardAnswersEmpty("demo", null), /^No answer yet: write to it in the demo's chat dock/);
  assert.equal(cardAnswersEmpty("live", KEY), "No answer from it since this page opened; this crewhub-loops lets the world's key read the chat of the person who made the key, so one to them would show here.");
  assert.equal(cardAnswersEmpty("live", PAGE), "No answer from it since this page opened; this page reads your own chat from crewhub-loops, so one to you would show here.");
  assert.equal(cardAnswersEmpty("live", undefined), cardAnswersEmpty("live", null));
});

test("the text view says where chat lives: the panel in live mode with the road's story, the scripted dock in the demo", () => {
  assert.equal(chatPlaceLine("live", KEY), `Chat: crewhub-loops' own chat, framed in the world's Chat panel (the Chat chip, or Chat with an agent on its card): open the agent's chat head in the dock there. ${chatWordsLine(KEY)}`);
  assert.match(chatPlaceLine("live", PAGE), /The bubbles come from your own chat/);
  assert.match(chatPlaceLine("live", NONE("unknown")), /No bubbles: this crewhub-loops does not let the world's key read the chat\. For the agents' answers as bubbles, make a viewer key/);
  assert.match(chatPlaceLine("demo", KEY), /^Chat: the demo's own scripted chat, in the dock/);
  assert.doesNotMatch(chatPlaceLine("demo", KEY), /panel|signed in/);
});

test("the Connect screen's viewer hint says whose chat the key reads and names road 2 with the exact setting", () => {
  assert.match(en["world.connect.connect.step2"] ?? "", /reads only your own chat \(the chat of the person who makes the key\)/);
  // Round 29: the steps name loops main's real buttons (the walk quoted the card and the key window).
  assert.match(en["world.connect.connect.step1"] ?? "", /press \*\*Connect CrewHub World\*\*\. Once the bot exists the card is titled \*\*CrewHub World\*\*: press \*\*New access key\*\*, then \*\*Make a new access key\*\*\./);
  assert.match(en["world.connect.connect.step3"] ?? "", /^In the window "The access key of CrewHub World" press \*\*Copy the access key\*\*, then \*\*I have saved the access key, close\*\*: the key is shown once\.$/);
  assert.match(en["world.connect.connect.viewer"] ?? "", /no bubbles with it, unless crewhub-loops on this computer lets this page read your own chat: CHL_WORLD_ORIGIN=\{origin\} set there/);
  assert.match(en["world.connection.panel.key.viewer"] ?? "", /reads only the chat of the person who made it/);
  for (const key of Object.keys(en)) assert.ok(!/signed-out|signed-in|Forget the session/.test(en[key] ?? ""), `${key}: nothing of the sign-in road`);
});

test("round 29: the probe's two new verdicts have their own words: chat off (loops' bubbles feature off, switch it on) and remote (a loops elsewhere: the viewer key is the road); the host's word read from health", () => {
  const off = noneWords({ pageProbe: "chat-off", pageOrigin: ORIGIN });
  assert.match(off.reason, /crewhub-loops' chat bubbles are switched off there \(Settings > Features\)/);
  assert.match(off.way, /^switch the chat bubbles on in crewhub-loops \(Settings > Features\) and this page reads your own chat, or make a viewer key/);
  assert.equal(chatGlance(view(false, "chat-off")), "Sign in to crewhub-loops below to type; no bubbles: crewhub-loops' chat bubbles are switched off there (see About).");
  const remote = noneWords({ pageProbe: "remote", pageOrigin: ORIGIN });
  assert.match(remote.reason, /only from a crewhub-loops on this computer/);
  assert.equal(remote.way, VIEWER_KEY_WORDS, "the viewer key is the road to a loops elsewhere");
  assert.equal(chatGlance(view(false, "remote")), "Sign in to crewhub-loops below to type; no bubbles: a viewer key is the road to a crewhub-loops elsewhere (see About).");
  assert.equal(hostKeyReadsChatOf({ connection: { session: { state: "key" } } }), true);
  assert.equal(hostKeyReadsChatOf({ connection: { session: { state: "unknown" } } }), null, "the host has not said");
  assert.equal(hostKeyReadsChatOf({ connection: {} }), false, "no session: the host knows the key does not read the chat");
  assert.equal(hostKeyReadsChatOf({}), null);
  assert.equal(hostKeyReadsChatOf(null), null);
});
