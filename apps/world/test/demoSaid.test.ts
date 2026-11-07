import assert from "node:assert/strict";
import test from "node:test";
import { demoChatLine, firstLine, isAgentDm, LINE_MAX } from "../src/state/demoSaid.ts";

const envelope = (type: string, actor: { id: string; kind: "agent" | "user" | "system" }, payload: Record<string, unknown>) => ({ type, actor, payload });
const msg = (id: string, kind: "agent" | "user", bodyText: string) => ({ id, threadId: "dmt_g", author: { id: kind === "agent" ? "g-man" : "nicky", kind, displayName: kind === "agent" ? "G-Man" : "Nicky" }, bodyText, createdAt: "2026-10-22T01:02:03.000Z" });

test("demoSaid: the agent's dm.created becomes a chat line with the first line of its message; the person's and other events do not", () => {
  const messages = [msg("dm_1", "user", "Morning, how is the team?"), msg("dm_2", "agent", "(demo reply) Busy and calm.\nSecond line.")];
  const reply = envelope("dm.created", { id: "g-man", kind: "agent" }, { threadId: "dmt_g", messageId: "dm_2", agentId: "g-man" });
  assert.equal(isAgentDm(reply), true);
  assert.deepEqual(demoChatLine(reply, messages, "G-Man"), { agentId: "g-man", agentName: "G-Man", text: "(demo reply) Busy and calm.", at: "2026-10-22T01:02:03.000Z", messageId: "dm_2", threadId: "dmt_g" });
  assert.deepEqual(demoChatLine(reply, messages, null), { agentId: "g-man", text: "(demo reply) Busy and calm.", at: "2026-10-22T01:02:03.000Z", messageId: "dm_2", threadId: "dmt_g" }, "no name known: the id serves");
  const own = envelope("dm.created", { id: "nicky", kind: "user" }, { threadId: "dmt_g", messageId: "dm_1", agentId: "g-man" });
  assert.equal(isAgentDm(own), false, "the person's own message is no answer");
  assert.equal(demoChatLine(own, messages, "G-Man"), null);
  assert.equal(demoChatLine(envelope("dm.answered", { id: "g-man", kind: "agent" }, { threadId: "dmt_g", messageId: "dm_1", agentId: "g-man" }), messages, "G-Man"), null, "dm.answered names the person's message, not the reply");
  assert.equal(demoChatLine(envelope("dm.created", { id: "postman", kind: "agent" }, { threadId: "dmt_g", messageId: "dm_2", agentId: "g-man" }), messages, "G-Man"), null, "another actor (the postman) is not the agent");
  assert.equal(demoChatLine(envelope("dm.created", { id: "system", kind: "system" }, { threadId: "dmt_g", messageId: "dm_2", agentId: "g-man" }), messages, "G-Man"), null, "the system is not the agent");
  assert.equal(demoChatLine(reply, [msg("dm_9", "agent", "other")], "G-Man"), null, "a message not in the thread read: nothing");
  assert.equal(demoChatLine(reply, [msg("dm_2", "agent", "\n  \n")], "G-Man"), null, "an empty body: nothing to say");
});

test("demoSaid: firstLine is the host's rule: the first non-empty line, at most LINE_MAX characters with an ellipsis", () => {
  assert.equal(LINE_MAX, 140);
  assert.equal(firstLine("\r\n\nHello there.\nMore."), "Hello there.");
  assert.equal(firstLine("  padded  "), "padded");
  assert.equal(firstLine(""), "");
  const long = "x".repeat(200);
  assert.equal(firstLine(long), `${"x".repeat(139)}…`);
  assert.equal(firstLine("y".repeat(140)), "y".repeat(140), "exactly LINE_MAX stays whole");
});
