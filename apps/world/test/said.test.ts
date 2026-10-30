import assert from "node:assert/strict";
import test from "node:test";
import { SAID_FADE_MS, SAID_MS, clearSaid, getSaid, joinSentences, rememberSaid, saidBy, saidLabel, saidWords, subscribeSaid, getRecentAnswers } from "../src/state/said.ts";

const line = (agentId: string, text: string, n = 1) => ({ agentId, agentName: agentId.toUpperCase(), text, at: "2026-10-21T19:00:00.000Z", messageId: `dm_${agentId}${n === 1 ? "" : n}`, threadId: `dmt_${agentId}` });

test("said: an agent's line shows over that agent for SAID_MS, fades at the end, and the newest replaces the older", () => {
  clearSaid();
  const t0 = 1_000_000;
  let told = 0;
  const off = subscribeSaid(() => (told += 1));
  rememberSaid(line("boing", "On it. The nook is done,"), t0);
  assert.equal(told, 1);
  assert.deepEqual(saidBy("boing", t0), { text: "On it. The nook is done,", agentName: "BOING", messageId: "dm_boing", threadId: "dmt_boing", shownAt: t0, until: t0 + SAID_MS, fading: false });
  assert.equal(saidBy("other", t0), null);
  assert.equal(saidBy("boing", t0 + SAID_MS - SAID_FADE_MS)?.fading, true, "fading in the last seconds");
  assert.equal(saidBy("boing", t0 + SAID_MS), null, "gone when its time is up");
  rememberSaid(line("boing", "And the lamp.", 2), t0 + 1000);
  assert.equal(saidBy("boing", t0 + 1000)?.text, "And the lamp.");
  assert.equal(getSaid().size, 1, "one line per agent");
  rememberSaid(line("g-man", "Busy and calm."), t0 + 1000);
  assert.equal(getSaid().size, 2);
  off();
  clearSaid();
  assert.equal(getSaid().size, 0);
});

test("saidLabel: the bubble's accessible name joins the line and the action without doubling terminal punctuation", () => {
  assert.equal(saidWords("crewhub-lead", "the bubble proof on 8292."), "crewhub-lead says: the bubble proof on 8292.");
  assert.equal(saidLabel("crewhub-lead", "Answer from crewhub-lead: the bubble proof on 8292.", "Open crewhub-lead"), "crewhub-lead says: Answer from crewhub-lead: the bubble proof on 8292. Open crewhub-lead");
  assert.equal(saidLabel("g-man", "Busy and calm", "Open g-man"), "g-man says: Busy and calm. Open g-man", "a line without an end gets the full stop");
  assert.equal(joinSentences("Done!", "Open g-man"), "Done! Open g-man");
  assert.equal(joinSentences("Is it?", "Open g-man"), "Is it? Open g-man");
  assert.equal(joinSentences("Later\u2026", "Open g-man"), "Later\u2026 Open g-man");
  assert.equal(joinSentences("He said \"done.\"", "Open g-man"), "He said \"done.\" Open g-man", "a closing quote after the stop");
  assert.equal(joinSentences("(as agreed.)", "Open g-man"), "(as agreed.) Open g-man");
  assert.equal(joinSentences("trailing space. ", "Open g-man"), "trailing space. Open g-man");
  assert.equal(joinSentences("", "Open g-man"), "Open g-man");
  assert.equal(joinSentences("a colon:", "Open g-man"), "a colon:. Open g-man", "only terminal punctuation counts");
});

test("said (round 29, Low 6): a message the page has shown already is neither listed nor shown again: the bubble's time stands, the list keeps one row", () => {
  clearSaid();
  const t0 = 2_000_000;
  rememberSaid(line("boing", "Once."), t0);
  const first = saidBy("boing", t0);
  rememberSaid(line("boing", "Once."), t0 + 5000);
  assert.deepEqual(saidBy("boing", t0 + 5000), { ...first!, fading: false }, "the same message id again: the bubble is not restarted");
  assert.equal(getRecentAnswers().length, 1);
  rememberSaid(line("boing", "Twice.", 2), t0 + 6000);
  assert.equal(saidBy("boing", t0 + 6000)?.text, "Twice.", "a new message id: a new bubble");
  assert.equal(getRecentAnswers().length, 2);
  clearSaid();
});
