import assert from "node:assert/strict";
import test from "node:test";
import { readThreadFacts } from "../src/hostSource.ts";

test("thread facts from the host (round 24): a list of rows with an agent id, a stamp and a count; a bad row is dropped, a non-list is null", () => {
  assert.deepEqual(readThreadFacts([{ agentId: "boing", lastMessageAt: "2026-10-22T07:05:00.174Z", unreadCount: 1 }]), [{ agentId: "boing", lastMessageAt: "2026-10-22T07:05:00.174Z", unreadCount: 1 }]);
  assert.deepEqual(readThreadFacts([{ agentId: "boing", lastMessageAt: "x", unreadCount: 0, extra: "dropped" }]), [{ agentId: "boing", lastMessageAt: "x", unreadCount: 0 }], "nothing more than the three fields travels");
  assert.deepEqual(readThreadFacts([{ agentId: "", lastMessageAt: "x", unreadCount: 0 }, { agentId: "a", unreadCount: 0 }, { agentId: "b", lastMessageAt: "x", unreadCount: -1 }, { agentId: "c", lastMessageAt: "x", unreadCount: 1.5 }, null, { agentId: "ok", lastMessageAt: "x", unreadCount: 2 }]), [{ agentId: "ok", lastMessageAt: "x", unreadCount: 2 }]);
  assert.deepEqual(readThreadFacts([]), []);
  assert.equal(readThreadFacts({ threads: [] }), null);
  assert.equal(readThreadFacts(undefined), null);
});
