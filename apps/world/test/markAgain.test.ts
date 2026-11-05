/* A chat mark clicked after its bubble went shows the answer there (round 67, walk finding v1-1 on sugg/w3-4): live, a
   mark outlives its bubble (w3-4), and a click on it entered the building with nothing on screen about the answer. The
   store shows the agent's newest answer as its bubble again, for the bubble's SAID_MS, as when it came; the Recent
   answers list and the unread answers are untouched (the mark stays until the chat opens). The store is
   state/chatStores.ts; the mark's click is wired in App.tsx. */
import assert from "node:assert/strict";
import test from "node:test";
import { createChatStores } from "../src/state/chatStores.ts";
import { SAID_MS } from "../src/state/said.ts";
import type { ChatLine } from "@crewhub/loops-client";

function stores() {
  let now = 1_000;
  const timers: { fn: () => void; at: number }[] = [];
  const s = createChatStores({
    now: () => now,
    schedule: (fn, ms) => {
      const t = { fn, at: now + ms };
      timers.push(t);
      return () => void timers.splice(timers.indexOf(t), 1);
    },
  });
  const tick = (ms: number) => {
    now += ms;
    for (const t of [...timers]) if (t.at <= now) (timers.splice(timers.indexOf(t), 1), t.fn());
  };
  return { s, tick, at: () => now };
}
let n = 0;
const line = (agentId: string, text = "hello"): ChatLine => ({ agentId, agentName: agentId.toUpperCase(), messageId: `m${++n}`, threadId: `t-${agentId}`, text, at: "2026-11-05T10:00:00.000Z" }) as ChatLine;

test("after the bubble went, again shows the agent's answer as its bubble once more, for SAID_MS, and goes again after", () => {
  const { s, tick, at } = stores();
  s.said.remember(line("cr-lead", "the nook is done"));
  tick(13_000);
  assert.equal(s.said.lines().size, 0, "the bubble went");
  s.said.again("cr-lead");
  const shown = s.said.lines().get("cr-lead");
  assert.equal(shown?.text, "the nook is done");
  assert.equal(shown?.messageId, "m1", "the same answer, not a new one");
  assert.equal(shown?.shownAt, at());
  assert.equal(shown?.until, at() + SAID_MS);
  tick(SAID_MS);
  assert.equal(s.said.lines().size, 0, "gone again when its time is up");
});

test("the lists are untouched: Recent answers the same, the answer still unread until the chat opens", () => {
  const { s, tick } = stores();
  s.said.remember(line("cr-lead"));
  tick(13_000);
  const recent = s.recent();
  const unread = s.unread.answers();
  s.said.again("cr-lead");
  assert.equal(s.recent(), recent, "the same array: nothing arrived");
  assert.equal(s.unread.answers(), unread, "still the one unread answer");
  assert.equal(s.unread.answers().length, 1);
});

test("the agent's newest answer, not an older one; a bubble still live gets its full time again", () => {
  const { s, tick, at } = stores();
  s.said.remember(line("cr-lead", "one"));
  tick(1_000);
  s.said.remember(line("cr-lead", "two"));
  tick(5_000);
  s.said.again("cr-lead");
  const shown = s.said.lines().get("cr-lead");
  assert.equal(shown?.text, "two");
  assert.equal(shown?.until, at() + SAID_MS);
});

test("an agent with no answer: nothing shown, nobody told", () => {
  const { s } = stores();
  let heard = 0;
  s.subscribe(() => void heard++);
  s.said.again("g-man");
  assert.equal(s.said.lines().size, 0);
  assert.equal(heard, 0);
});
