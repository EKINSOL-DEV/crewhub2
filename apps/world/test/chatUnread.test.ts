/* The unread answers (round 65, walk findings w3-1 and w3-4): the recent answers the person has not opened the chat
   for; opening the chat (the Chat panel, or the card in the demo) reads every answer known. The store is
   state/chatStores.ts; the text view and the bubbles are untouched by it. */
import assert from "node:assert/strict";
import test from "node:test";
import { createChatStores } from "../src/state/chatStores.ts";
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
  return { s, tick };
}
let n = 0;
const line = (agentId: string, text = "hello"): ChatLine => ({ agentId, agentName: agentId.toUpperCase(), messageId: `m${++n}`, threadId: `t-${agentId}`, text, at: "2026-11-05T10:00:00.000Z" }) as ChatLine;

test("nothing came: nothing unread; an answer is unread until the chat opens, and the list is the same array until then", () => {
  const { s } = stores();
  assert.deepEqual(s.unread.answers(), []);
  s.said.remember(line("g-man"));
  const first = s.unread.answers();
  assert.equal(first.length, 1);
  assert.equal(first[0]?.agentId, "g-man");
  assert.equal(s.unread.answers(), first, "the same array while nothing changed");
  s.unread.read();
  assert.deepEqual(s.unread.answers(), []);
});

test("read clears what was known then, not what comes after; the newest comes first, as Recent answers do", () => {
  const { s } = stores();
  s.said.remember(line("g-man", "one"));
  s.unread.read();
  s.said.remember(line("cr-lead", "two"));
  s.said.remember(line("g-man", "three"));
  assert.deepEqual(s.unread.answers().map((a) => a.text), ["three", "two"]);
  s.unread.read();
  assert.deepEqual(s.unread.answers(), []);
});

test("an unread answer outlives its bubble: the bubble's 12 s pass and the answer is still unread", () => {
  const { s, tick } = stores();
  s.said.remember(line("cr-lead"));
  tick(13_000);
  assert.equal(s.said.lines().size, 0, "the bubble went");
  assert.equal(s.unread.answers().length, 1, "the answer is still unread");
});

test("a replayed message (the same id) adds nothing; subscribers hear a read that changes something, not one that does not", () => {
  const { s } = stores();
  let heard = 0;
  s.subscribe(() => void heard++);
  const l = line("g-man");
  s.said.remember(l);
  s.said.remember(l);
  assert.equal(s.unread.answers().length, 1);
  const before = heard;
  s.unread.read();
  assert.equal(heard, before + 1);
  s.unread.read();
  assert.equal(heard, before + 1, "nothing to read: nothing said");
});
