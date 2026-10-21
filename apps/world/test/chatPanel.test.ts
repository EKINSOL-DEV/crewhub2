import assert from "node:assert/strict";
import test from "node:test";
import type { HostHealth } from "@crewhub/loops-client";
import { CHAT_FRAME_ALLOW, CHAT_FRAME_SANDBOX, CHAT_PARAM, chatFrameUrl, chatPlaceLine } from "../src/state/chatPanel.ts";
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

test("the text view says where chat lives: the panel in live mode, the scripted dock in the demo", () => {
  assert.match(chatPlaceLine("live"), /^Chat: crewhub-loops' own chat, framed in the world's Chat panel/);
  assert.match(chatPlaceLine("live"), /signed in to crewhub-loops as a person in this browser; the world keeps no session\.$/);
  assert.match(chatPlaceLine("demo"), /^Chat: the demo's own scripted chat, in the dock/);
  assert.doesNotMatch(chatPlaceLine("demo"), /panel/);
});
