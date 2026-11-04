/**
 * The team snapshot's freshness, once (round 61, W8): the rule (`freshnessOf`, missing or older than `STALE_AFTER_S`
 * is stale) and the words each package surface says for it (`freshnessWords`): the lane chip's and the figure tag's
 * short words, the text view's Town line, the director's clause under "No plan yet". The sentences are the ones the
 * surfaces said before, each still its own.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyFacts } from "../src/facts.ts";
import { STALE_AFTER_S, freshnessOf, freshnessWords } from "../src/freshness.ts";
import type { Freshness } from "../src/model.ts";

const TS = "2026-10-21T17:00:00Z";
const AT = Date.parse(TS);
/** "HH:MM" in the viewer's local time, worked out here on its own. */
const clock = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const withTeam = (ts: string | null) => ({ ...emptyFacts(), team: ts === null ? null : { v: 1 as const, ts, sessions: [] } });

test("freshnessOf: no snapshot or an unreadable stamp is stale with no age; older than STALE_AFTER_S is stale; the age never goes below zero", () => {
  assert.equal(STALE_AFTER_S, 300);
  assert.deepEqual(freshnessOf(withTeam(null), AT), { teamTs: null, ageSeconds: null, stale: true });
  assert.deepEqual(freshnessOf(withTeam("yesterday"), AT), { teamTs: "yesterday", ageSeconds: null, stale: true });
  assert.deepEqual(freshnessOf(withTeam(TS), AT + STALE_AFTER_S * 1000), { teamTs: TS, ageSeconds: STALE_AFTER_S, stale: false }, "exactly the limit is still fresh");
  assert.deepEqual(freshnessOf(withTeam(TS), AT + STALE_AFTER_S * 1000 + 1000), { teamTs: TS, ageSeconds: STALE_AFTER_S + 1, stale: true });
  assert.deepEqual(freshnessOf(withTeam(TS), AT - 5000), { teamTs: TS, ageSeconds: 0, stale: false }, "a stamp from the future reads as 0 s old");
  assert.equal(freshnessOf(withTeam(TS), AT + 1499).ageSeconds, 1, "rounded to the second");
});

test("freshnessWords: the three surfaces' words for a missing, a stale and a fresh snapshot", () => {
  const none: Freshness = { teamTs: null, ageSeconds: null, stale: true };
  assert.deepEqual(freshnessWords(none), {
    short: "status unknown",
    sentence: "No team snapshot: no team probe has reported to this crewhub-loops, so every agent's status is unknown.",
    whyUnknown: " No team probe has reported to this crewhub-loops, so a status stays unknown until one does.",
  });
  const stale: Freshness = { teamTs: TS, ageSeconds: 3600, stale: true };
  assert.deepEqual(freshnessWords(stale), {
    short: `stale since ${clock(TS)}`,
    sentence: `The team snapshot is stale since ${TS}: every agent's status shows as unknown.`,
    whyUnknown: ` The team snapshot is stale since ${TS}, so a status shows as unknown until a fresh one.`,
  });
  assert.equal(freshnessWords({ teamTs: "yesterday", ageSeconds: null, stale: true }).short, "status unknown", "an unreadable stamp has no clock time");
  const fresh: Freshness = { teamTs: TS, ageSeconds: 30, stale: false };
  assert.deepEqual(freshnessWords(fresh), { short: null, sentence: `Team snapshot from ${TS}, 30 s old.`, whyUnknown: "" });
  assert.equal(freshnessWords({ teamTs: TS, ageSeconds: null, stale: false }).sentence, `Team snapshot from ${TS}, 0 s old.`, "a fresh snapshot with no age is said 0 s old, as before");
});
