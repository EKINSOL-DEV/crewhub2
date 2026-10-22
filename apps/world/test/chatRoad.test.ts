/* The chat road contract (round 28), as r28-road2's stub holds it: key when the host's key reads the chat, else page
   when the page's probe answers, else none. r28-session's file replaces the stub; this test says what road 2 relies on. */
import assert from "node:assert/strict";
import test from "node:test";
import { decideChatRoad } from "../src/state/chatRoad.ts";

test("decideChatRoad: the host's key first, then the page's probe, else none", () => {
  assert.equal(decideChatRoad({ hostKeyReadsChat: true, pageProbe: "unknown" }), "key");
  assert.equal(decideChatRoad({ hostKeyReadsChat: true, pageProbe: "on" }), "key", "the key road wins even where the page could read");
  assert.equal(decideChatRoad({ hostKeyReadsChat: false, pageProbe: "on" }), "page");
  assert.equal(decideChatRoad({ hostKeyReadsChat: null, pageProbe: "on" }), "page", "a host that says nothing of its key: the page's probe decides");
  for (const probe of ["signed-out", "origin-not-set", "unreachable", "unknown"] as const) {
    assert.equal(decideChatRoad({ hostKeyReadsChat: false, pageProbe: probe }), "none", probe);
    assert.equal(decideChatRoad({ hostKeyReadsChat: null, pageProbe: probe }), "none", probe);
  }
});
