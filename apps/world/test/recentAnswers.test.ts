import assert from "node:assert/strict";
import test from "node:test";
import { answerLabel, answerName, answerTarget, answerTime, RECENT_NOTE, recentEmptyWords } from "../src/state/recentAnswers.ts";
import { clearSaid, getRecentAnswers, RECENT_ANSWERS, rememberSaid, SAID_MS, saidBy } from "../src/state/said.ts";

const line = (agentId: string, text: string, n: number) => ({ agentId, agentName: agentId.toUpperCase(), text, at: new Date(Date.UTC(2026, 9, 22, 1, 2, n)).toISOString(), messageId: `dm_${n}`, threadId: `dmt_${agentId}` });

test("recent answers: the last 10 lines stay newest first for the page's life, past the bubble; a replayed message once; clearSaid forgets", () => {
  clearSaid();
  const t0 = 1_000_000;
  assert.deepEqual(getRecentAnswers(), []);
  rememberSaid(line("g-man", "Busy and calm.", 1), t0);
  rememberSaid(line("cr-lead", "(demo reply) The nook is done.", 2), t0 + 1000);
  const two = getRecentAnswers();
  assert.deepEqual(two.map((a) => [a.agentId, a.text, a.messageId, a.at]), [
    ["cr-lead", "(demo reply) The nook is done.", "dm_2", "2026-10-22T01:02:02.000Z"],
    ["g-man", "Busy and calm.", "dm_1", "2026-10-22T01:02:01.000Z"],
  ]);
  assert.equal(two[0]!.shownAt, t0 + 1000);
  assert.equal(saidBy("g-man", t0 + SAID_MS + 1), null, "the bubble is gone");
  assert.equal(getRecentAnswers(), two, "the list is the same array while nothing arrives, and keeps the answer past the bubble");
  rememberSaid(line("cr-lead", "(demo reply) The nook is done.", 2), t0 + 2000);
  assert.equal(getRecentAnswers().length, 2, "the same message id (a replayed stream) is not listed twice");
  for (let n = 3; n < 3 + RECENT_ANSWERS; n += 1) rememberSaid(line("cr-lead", `line ${n}`, n), t0 + n * 1000);
  const full = getRecentAnswers();
  assert.equal(full.length, RECENT_ANSWERS);
  assert.equal(full[0]!.text, `line ${2 + RECENT_ANSWERS}`, "newest first");
  assert.equal(full.some((a) => a.agentId === "g-man"), false, "the oldest fell off");
  clearSaid();
  assert.deepEqual(getRecentAnswers(), []);
});

test("recent answers: the empty state says per road whether an answer can arrive (the key road, or none), and the demo's own dock", () => {
  assert.match(recentEmptyWords("demo", null), /^No answers yet: write to an agent in the demo's chat dock .* its scripted reply shows as a bubble and stays here/);
  assert.match(recentEmptyWords("live", { state: "key" }), /^No answers yet: this crewhub-loops lets the world's key read the chat/);
  assert.match(recentEmptyWords("live", null), /^No answers can arrive: this crewhub-loops does not let the world read the chat\. For bubbles, make a viewer key in Settings > Agents > Connect CrewHub World/);
  assert.equal(recentEmptyWords("live", undefined), recentEmptyWords("live", null));
  assert.match(RECENT_NOTE, /^The last 10 answers this page saw, newest first/);
});
test("recent answers: the row's time, name, target and accessible name", () => {
  const a = { agentId: "cr-lead", agentName: "CR Lead", text: "(demo reply) The nook is done.", at: "2026-10-22T01:02:03.000Z", shownAt: 5, messageId: "dm_1", threadId: "dmt", until: 6 };
  const local = new Date("2026-10-22T01:02:03.000Z");
  const two = (n: number) => String(n).padStart(2, "0");
  const expected = `${two(local.getHours())}:${two(local.getMinutes())}:${two(local.getSeconds())}`;
  assert.equal(answerTime(a), expected, "HH:MM:SS local");
  assert.match(answerTime(a), /^\d\d:\d\d:\d\d$/);
  assert.equal(answerTime({ at: "not a date", shownAt: Date.UTC(2026, 9, 22, 1, 2, 3) }), expected, "a time that does not parse: when the page saw it");
  assert.equal(answerName(a), "CR Lead");
  assert.equal(answerName({ agentId: "cr-lead", agentName: null }), "cr-lead");
  assert.equal(answerLabel(a, "Chat with CR Lead"), `CR Lead at ${expected}: (demo reply) The nook is done. Chat with CR Lead`, "no double full stop");
  assert.equal(answerLabel({ ...a, text: "Done" }, "Chat with CR Lead"), `CR Lead at ${expected}: Done. Chat with CR Lead`);
  const self = answerTarget(a, { key: "cr-lead", displayName: "CR Lead", chat: { self: true, why: null, lead: null } });
  assert.deepEqual(self, { agent: { key: "cr-lead", name: "CR Lead" }, action: "Chat with CR Lead", note: null });
  const worker = answerTarget({ agentId: "s/dev", agentName: "Dev" }, { key: "s/dev", displayName: "Dev", chat: { self: false, why: "a worker, not an agent registered in crewhub-loops", lead: { key: "cr-lead", displayName: "CR Lead" } } });
  assert.deepEqual(worker, { agent: { key: "cr-lead", name: "CR Lead" }, action: "Chat with its lead CR Lead", note: "crewhub-loops chats with leads only: Dev is a worker, not an agent registered in crewhub-loops; chat with its lead CR Lead." });
  const nobody = answerTarget({ agentId: "postman", agentName: "Postman" }, { key: "postman", displayName: "Postman", chat: { self: false, why: "the postman (loops role router)", lead: null } });
  assert.deepEqual(nobody, { agent: null, action: "Open the chat", note: "crewhub-loops chats with leads only: Postman is the postman (loops role router)." });
  assert.deepEqual(answerTarget({ agentId: "gone", agentName: null }, null), { agent: { key: "gone", name: "gone" }, action: "Chat with gone", note: null }, "an agent no longer in the model: the panel for its id, loops decides");
});
