import assert from "node:assert/strict";
import test from "node:test";
import { clearThreads, getThreads, rememberThreads } from "../src/state/threads.ts";
import { threadWords } from "../src/world/agentCard/sections/answers.ts";

const NOW = Date.parse("2026-10-22T09:00:00Z");

test("the threads store (round 24): null until the host sends a list, then the list whole by agent, replaced each time; clear forgets", () => {
  clearThreads();
  assert.equal(getThreads(), null, "a key that cannot read the chat, a demo page: nothing known");
  rememberThreads([{ agentId: "boing", lastMessageAt: "2026-10-22T07:00:00Z", unreadCount: 1 }, { agentId: "g-man", lastMessageAt: "2026-10-22T08:00:00Z", unreadCount: 0 }]);
  assert.deepEqual([...getThreads()!.keys()], ["boing", "g-man"]);
  rememberThreads([{ agentId: "g-man", lastMessageAt: "2026-10-22T08:30:00Z", unreadCount: 2 }]);
  assert.equal(getThreads()!.get("boing"), undefined, "the list is replaced, not merged");
  assert.equal(getThreads()!.get("g-man")?.unreadCount, 2);
  rememberThreads([]);
  assert.equal(getThreads()!.size, 0, "an empty list is still a list: the key reads the chat and there is no thread");
  clearThreads();
  assert.equal(getThreads(), null);
});

test("thread words: when the last message was written, in source time, and what is unread", () => {
  // Whose unread (round 25): always the installation owner's, the only count that reaches the card (the viewer road).
  assert.equal(threadWords({ lastMessageAt: "2026-10-22T07:00:00Z", unreadCount: 1 }, NOW), "last message 2 h ago, 1 unread in the key maker's view");
  assert.equal(threadWords({ lastMessageAt: "2026-10-22T08:59:50Z", unreadCount: 0 }, NOW), "last message just now, nothing unread in the key maker's view");
  assert.equal(threadWords({ lastMessageAt: "2026-10-21T09:00:00Z", unreadCount: 3 }, NOW), "last message yesterday, 3 unread in the key maker's view");
  assert.equal(threadWords({ lastMessageAt: "not a stamp", unreadCount: 0 }, NOW), "last message at an unknown time, nothing unread in the key maker's view");
});
