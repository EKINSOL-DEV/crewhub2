/* Which chat queries an event or a snapshot refreshes, and where the chat's navigations go (state/chatInvalidations.ts).
   Moved here whole from statePure.test.ts and stateSmall.test.ts in round 59d (C3): state/chat.ts, their one caller,
   is C9's module and loads in node only once C9 gives the chat its seam; until then these stay a step of their own. */
import assert from "node:assert/strict";
import test from "node:test";
import { chatInvalidations, opensSettings, snapshotInvalidations } from "../src/state/chatInvalidations.ts";

test("chatInvalidations: a dm event or a delivery naming a dm thread refreshes the messages and the threads; nothing else does", () => {
  const both = [["dm-messages"], ["dm-threads"]];
  assert.deepEqual(chatInvalidations({ type: "dm.created", payload: {} }), both);
  assert.deepEqual(chatInvalidations({ type: "dm.read", payload: {} }), both);
  assert.deepEqual(chatInvalidations({ type: "delivery.created", payload: { dmThreadId: "t1" } }), both);
  assert.deepEqual(chatInvalidations({ type: "delivery.created", payload: { dmThreadId: 7 } }), [], "a thread id that is no string");
  assert.deepEqual(chatInvalidations({ type: "ticket.moved", payload: {} }), []);
  assert.deepEqual(chatInvalidations({ type: "admin.dm", payload: {} }), [], "only a type that starts with dm.");
  assert.deepEqual(chatInvalidations({ type: "dmz.made", payload: {} }), [], "dm. with its dot: not any type that starts with dm");
});

test("snapshotInvalidations: a snapshot refreshes the threads, the messages, the summary and the agents, as a new list each time", () => {
  assert.deepEqual(snapshotInvalidations(), [["dm-threads"], ["dm-messages"], ["dm-summary"], ["agents"]]);
  assert.notEqual(snapshotInvalidations(), snapshotInvalidations());
});

test("opensSettings: only a route under /settings opens the Settings card", () => {
  assert.equal(opensSettings("/settings"), true);
  assert.equal(opensSettings("/settings/agents/connect"), true);
  assert.equal(opensSettings("/agents"), false);
  assert.equal(opensSettings("/x/settings"), false);
  assert.equal(opensSettings(""), false);
});
