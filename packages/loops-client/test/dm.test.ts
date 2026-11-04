/* The chat's dm readers (round 59d, C4): one set for the host's road and the page's. The facts here stood in
   pageChat.test.ts ("the readers") for the page's copies and, for the host's, in the host's own tests through the
   stub; read here through the readers' interface. */
import assert from "node:assert/strict";
import test from "node:test";
import { DM_LINE_MAX, firstLine, isMessageId, readAgentDm, readDmLine, readThreads } from "../src/dm.ts";

test("readThreads: the three fields of every row with an agent and a stamp; a count that is no count is 0; a bad row, a non-list, a null body are dropped", () => {
  assert.deepEqual(readThreads({ threads: [{ agentId: "a", lastMessageAt: "t", unreadCount: 2 }, { agentId: "", lastMessageAt: "t" }, { agentId: "b", lastMessageAt: "t", unreadCount: -1 }, null] }), [
    { agentId: "a", lastMessageAt: "t", unreadCount: 2 },
    { agentId: "b", lastMessageAt: "t", unreadCount: 0 },
  ]);
  assert.deepEqual(readThreads({ threads: [{ agentId: "c", lastMessageAt: "t", unreadCount: 1.5, extra: "dropped" }, { agentId: "d" }, 7] }), [{ agentId: "c", lastMessageAt: "t", unreadCount: 0 }], "nothing more than the three fields travels");
  assert.deepEqual(readThreads({ threads: "not a list" }), []);
  assert.deepEqual(readThreads([]), []);
  assert.deepEqual(readThreads(null), []);
  assert.deepEqual(readThreads(undefined), []);
});

test("readAgentDm: an agent's dm.created by its ids, from a stream envelope or an events row; the person's own, another type, no payload, a missing id or an id outside loops' shape are null", () => {
  const ids = { threadId: "t1", messageId: "m2", agentId: "crewhub-lead" };
  assert.deepEqual(readAgentDm({ v: 1, seq: 2, ts: "t", type: "dm.created", project: null, ticket: null, actor: { id: "crewhub-lead", kind: "agent" }, recipientIds: ["nicky"], payload: ids }), ids, "the stream's envelope");
  assert.deepEqual(readAgentDm({ seq: 2, type: "dm.created", actor: { id: "crewhub-lead", kind: "agent" }, payload: { ...ids, extra: 1 } }), ids, "an events row; only the ids travel");
  assert.equal(readAgentDm({ type: "dm.created", actor: { id: "nicky", kind: "user" }, payload: ids }), null, "the person's own message");
  assert.equal(readAgentDm({ type: "dm.answered", actor: { id: "crewhub-lead", kind: "agent" }, payload: ids }), null, "another type");
  assert.equal(readAgentDm({ type: "dm.created", actor: { id: "crewhub-lead", kind: "agent" }, payload: null }), null, "a null payload (round 34: the host's hand copy threw here)");
  assert.equal(readAgentDm({ type: "dm.created", actor: { id: "crewhub-lead", kind: "agent" }, payload: "ids" }), null);
  assert.equal(readAgentDm({ type: "dm.created", actor: { id: "crewhub-lead", kind: "agent" }, payload: { threadId: "t1", agentId: "x" } }), null, "no message id");
  assert.equal(readAgentDm({ type: "dm.created", actor: { id: "crewhub-lead", kind: "agent" }, payload: { ...ids, messageId: "m/3" } }), null, "an id outside the shape is never read");
  assert.equal(readAgentDm({ type: "dm.created", actor: null, payload: ids }), null);
  assert.equal(readAgentDm({ type: "dm.created", payload: ids }), null);
  assert.equal(readAgentDm(null), null);
  assert.equal(readAgentDm("dm.created"), null);
  assert.ok(isMessageId("dm_01JAZ-x_9") && !isMessageId("") && !isMessageId("a".repeat(65)) && !isMessageId("m/3") && !isMessageId(3));
});

test("readDmLine: the first line cut as a bubble shows it, the author's name when given, the event's ids; a person's message, an empty line, no text, no body are null", () => {
  const ids = { messageId: "m2", threadId: "t1", agentId: "crewhub-lead" };
  assert.deepEqual(readDmLine(ids, { message: { id: "m2", bodyText: "\n\nFirst line here.\nSecond", createdAt: "2026-10-22T21:00:00Z", author: { id: "crewhub-lead", kind: "agent", displayName: "CrewHub lead" } } }), {
    agentId: "crewhub-lead",
    agentName: "CrewHub lead",
    text: "First line here.",
    at: "2026-10-22T21:00:00Z",
    messageId: "m2",
    threadId: "t1",
  });
  const noName = readDmLine(ids, { message: { bodyText: "hi", createdAt: "2026-10-22T21:00:00Z", author: { kind: "agent", displayName: "" } } });
  assert.deepEqual(noName, { agentId: "crewhub-lead", text: "hi", at: "2026-10-22T21:00:00Z", messageId: "m2", threadId: "t1" }, "an empty name is no name (the page's rule, now the host's too)");
  assert.deepEqual(readDmLine({ ...ids, messageId: "other" }, { message: { id: "m2", bodyText: "hi", createdAt: "t" } })?.messageId, "other", "the ids are the event's");
  const stamped = readDmLine(ids, { message: { bodyText: "hi" } });
  assert.ok(stamped !== null && !Number.isNaN(Date.parse(stamped.at)), "no createdAt: stamped now");
  assert.equal(readDmLine(ids, { message: { bodyText: "hi", author: { kind: "user" } } }), null, "a person's message is no bubble (the page's rule, now the host's too)");
  assert.equal(readDmLine(ids, { message: { bodyText: "   \n  " } }), null, "an empty line is no bubble");
  assert.equal(readDmLine(ids, { message: { bodyText: 7 } }), null);
  assert.equal(readDmLine(ids, { message: null }), null);
  assert.equal(readDmLine(ids, null), null);
  assert.equal(readDmLine(ids, "text"), null);
});

test("firstLine: the first non-empty line, trimmed, carriage returns gone; exactly DM_LINE_MAX characters are kept whole, one more is cut to that length with an ellipsis (round 54, r54-mut-client)", () => {
  assert.equal(DM_LINE_MAX, 140);
  assert.equal(firstLine("\r\n  \r\n  Done with the lamp.  \r\nNext: the rug."), "Done with the lamp.");
  assert.equal(firstLine(""), "");
  assert.equal(firstLine("\n \n"), "");
  const long = "x".repeat(200);
  assert.equal(firstLine(long).length, DM_LINE_MAX);
  assert.ok(firstLine(long).endsWith("…"));
  assert.equal(firstLine("x".repeat(DM_LINE_MAX)), "x".repeat(DM_LINE_MAX));
  assert.equal(firstLine("x".repeat(DM_LINE_MAX + 1)), `${"x".repeat(DM_LINE_MAX - 1)}…`);
});
