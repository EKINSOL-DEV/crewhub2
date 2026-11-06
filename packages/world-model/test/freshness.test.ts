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
/** "YYYY-MM-DD HH:MM:SS" in the viewer's local time: the stamp is not from today, so the sentences say its date (W1). */
const stamp = (iso: string) => {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
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
    sentence: `The team snapshot is stale since ${stamp(TS)}: every agent's status shows as unknown.`,
    whyUnknown: ` The team snapshot is stale since ${stamp(TS)}, so a status shows as unknown until a fresh one.`,
  });
  assert.equal(freshnessWords({ teamTs: "yesterday", ageSeconds: null, stale: true }).short, "status unknown", "an unreadable stamp has no clock time");
  const fresh: Freshness = { teamTs: TS, ageSeconds: 30, stale: false };
  assert.deepEqual(freshnessWords(fresh), { short: null, sentence: `Team snapshot from ${stamp(TS)}, 30 s old.`, whyUnknown: "" });
  assert.equal(freshnessWords({ teamTs: TS, ageSeconds: null, stale: false }).sentence, `Team snapshot from ${stamp(TS)}, 0 s old.`, "a fresh snapshot with no age is said 0 s old, as before");
});

test("a Freshness built by hand, no stamp yet not stale (the building sign's lead chip, the view's words): the lane keeps its words, the Town line still says no snapshot", () => {
  // `freshnessOf` never makes this one; the page does (WorldCanvas.tsx builds `{ stale, teamTs, ageSeconds: null }`). `short` follows
  // `stale` alone, as the lane chip did; the sentences follow the stamp first, as the text view and the director did.
  const byHand: Freshness = { teamTs: null, ageSeconds: null, stale: false };
  assert.deepEqual(freshnessWords(byHand), {
    short: null,
    sentence: "No team snapshot: no team probe has reported to this crewhub-loops, so every agent's status is unknown.",
    whyUnknown: " No team probe has reported to this crewhub-loops, so a status stays unknown until one does.",
  });
  assert.equal(freshnessWords({ teamTs: TS, ageSeconds: 900, stale: true }).short, `stale since ${clock(TS)}`);
});

/* Round 62's mutation run: what the rows above left open. */
test("freshnessOf: an empty stamp is no stamp; the age rounds half up, over the whole second", () => {
  assert.deepEqual(freshnessOf(withTeam(""), AT), { teamTs: null, ageSeconds: null, stale: true });
  assert.equal(freshnessOf(withTeam(TS), AT + 1500).ageSeconds, 2, "half a second rounds up");
  assert.deepEqual(freshnessOf(withTeam(TS), AT + 3_600_000), { teamTs: TS, ageSeconds: 3600, stale: true }, "an hour is 3600 s, not nearly");
});

test("freshnessWords: the short words' clock is the viewer's own, hours and minutes, both two digits", () => {
  // A zone half an hour off UTC, so that neither figure can come from UTC, and a time whose hour, minute and second all differ.
  const was = process.env.TZ;
  process.env.TZ = "Asia/Kolkata";
  try {
    assert.equal(freshnessWords({ teamTs: "2026-10-21T03:35:07Z", ageSeconds: 3600, stale: true }).short, "stale since 09:05");
    assert.equal(freshnessWords({ teamTs: "2026-10-21T17:00:00Z", ageSeconds: 3600, stale: true }).short, "stale since 22:30");
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
});
