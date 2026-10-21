import assert from "node:assert/strict";
import test from "node:test";
import { CLOSING_MS, archivedSince, archivedWords, closingOf } from "../src/archive.ts";

const NOW = Date.parse("2026-10-21T01:00:00Z");

test("archivedSince gives the archive date in words and the whole days since, in UTC", () => {
  assert.deepEqual(archivedSince("2026-10-09T15:30:00Z", NOW), { date: "9 Oct 2026", days: 11 });
  assert.deepEqual(archivedSince("2026-10-20T22:14:27.195Z", NOW), { date: "20 Oct 2026", days: 0 });
  assert.deepEqual(archivedSince("2025-12-31T23:59:59Z", NOW), { date: "31 Dec 2025", days: 293 });
});

test("archivedSince never goes negative and copes with a date it cannot read", () => {
  assert.deepEqual(archivedSince("2026-10-22T00:00:00Z", NOW), { date: "22 Oct 2026", days: 0 }, "a clock ahead of ours");
  assert.equal(archivedSince("not a date", NOW), null);
});

test("archivedWords says closed since when, with the days when there are any", () => {
  assert.equal(archivedWords("2026-10-09T15:30:00Z", NOW), "closed since 9 Oct 2026 (11 days)");
  assert.equal(archivedWords("2026-10-19T20:00:00Z", NOW), "closed since 19 Oct 2026 (1 day)");
  assert.equal(archivedWords("2026-10-20T22:14:27Z", NOW), "closed since 20 Oct 2026 (today)");
  assert.equal(archivedWords(null, NOW), "closed");
  assert.equal(archivedWords("nonsense", NOW), "closed");
});

test("closingOf is the window right after a project.archived or project.restored, and nothing after it", () => {
  const change = { kind: "closing" as const, ts: NOW - 1000, seq: 7 };
  assert.deepEqual(closingOf(change, NOW), { kind: "closing", at: NOW - 1000, until: NOW - 1000 + CLOSING_MS });
  assert.equal(closingOf(change, NOW - 1000 + CLOSING_MS), null, "over at the end of the window");
  assert.equal(closingOf(change, NOW - 5000), null, "a change in the future (a seek backwards) plays nothing");
  assert.equal(closingOf(undefined, NOW), null);
  assert.deepEqual(closingOf({ kind: "opening", ts: NOW, seq: 8 }, NOW)?.kind, "opening");
});
