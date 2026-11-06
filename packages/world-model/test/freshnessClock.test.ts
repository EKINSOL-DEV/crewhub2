/**
 * Design choice W1 (`clock`): the text view's Town line and the director's clause say the snapshot's time as a clock
 * time in the viewer's zone ("Team snapshot from 21:02:48, 11 s old."), with the date only when the stamp is not from
 * today, in place of the ISO stamp a screen reader spells out character by character. The short words (the lane chip,
 * the figure tag: "stale since HH:MM") are as they were.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { freshnessWords } from "../src/freshness.ts";

const TS = "2026-10-21T17:00:00Z";
const AT = Date.parse(TS);
const HOUR = 3_600_000;

/** A zone half an hour off UTC, so that no figure can come from UTC: 17:00:00Z is 22:30:00 there, and 01:30Z the next day is still the 21st's evening. */
function inKolkata(run: () => void): void {
  const was = process.env.TZ;
  process.env.TZ = "Asia/Kolkata";
  try {
    run();
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
}

test("W1 (clock): a fresh snapshot's Town line says the clock time of the stamp, seconds included; the date only when it is not today", () => {
  inKolkata(() => {
    const fresh = { teamTs: TS, ageSeconds: 30, stale: false };
    assert.equal(freshnessWords(fresh, AT + 30_000).sentence, "Team snapshot from 22:30:00, 30 s old.");
    assert.equal(freshnessWords(fresh, AT + HOUR).sentence, "Team snapshot from 22:30:00, 30 s old.", "an hour later, still the 21st there (23:30)");
    assert.equal(freshnessWords(fresh, AT + 2 * HOUR).sentence, "Team snapshot from 2026-10-21 22:30:00, 30 s old.", "two hours later it is the 22nd there (00:30): the date is said");
    assert.equal(freshnessWords({ teamTs: TS, ageSeconds: null, stale: false }, AT).sentence, "Team snapshot from 22:30:00, 0 s old.", "no age is said 0 s old, as before");
  });
});

test("W1 (clock): a stale snapshot's sentence and the director's clause say the clock time the same way; the short words keep hours and minutes", () => {
  inKolkata(() => {
    const stale = { teamTs: TS, ageSeconds: 3600, stale: true };
    assert.deepEqual(freshnessWords(stale, AT + HOUR), {
      short: "stale since 22:30",
      sentence: "The team snapshot is stale since 22:30:00: every agent's status shows as unknown.",
      whyUnknown: " The team snapshot is stale since 22:30:00, so a status shows as unknown until a fresh one.",
    });
    assert.deepEqual(freshnessWords(stale, AT + 30 * HOUR), {
      short: "stale since 22:30",
      sentence: "The team snapshot is stale since 2026-10-21 22:30:00: every agent's status shows as unknown.",
      whyUnknown: " The team snapshot is stale since 2026-10-21 22:30:00, so a status shows as unknown until a fresh one.",
    });
  });
});

test("W1 (clock): with no `now` the viewer's clock decides today; a missing or unreadable stamp reads as before", () => {
  const nowish = new Date().toISOString();
  assert.match(freshnessWords({ teamTs: nowish, ageSeconds: 1, stale: false }).sentence, /^Team snapshot from \d\d:\d\d:\d\d, 1 s old\.$/);
  assert.equal(freshnessWords({ teamTs: null, ageSeconds: null, stale: true }).sentence, "No team snapshot: no team probe has reported to this crewhub-loops, so every agent's status is unknown.");
  assert.equal(freshnessWords({ teamTs: "yesterday", ageSeconds: null, stale: true }).short, "status unknown");
  assert.equal(freshnessWords({ teamTs: "yesterday", ageSeconds: null, stale: true }).sentence, "The team snapshot is stale since yesterday: every agent's status shows as unknown.", "an unreadable stamp is said as it came");
});
