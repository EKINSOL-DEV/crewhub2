/**
 * A ticket status in words and as drawn (round 61, W9): `statusWords` says a status the way the world does ("in
 * progress"), a new one as loops sent it; `drawn` is the pair every ticket carries, the status drawn and counted and
 * the word kept for a status newer than this build. The sites that said these themselves (objects.ts, agentCard.ts,
 * describe.ts) read them from here; their tests pin the sentences.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TICKET_STATUSES } from "@crewhub/loops-client";
import { drawn, drawnStatus, statusWords } from "../src/status.ts";

test("statusWords: the five known statuses in the world's words, a new one as loops sent it", () => {
  assert.deepEqual(TICKET_STATUSES.map(statusWords), ["backlog", "planned", "in progress", "review", "done"]);
  assert.equal(statusWords("needs_review"), "needs_review", "a status newer than this build keeps loops' word, underscore and all");
  assert.equal(statusWords(""), "");
});

test("drawn: a known status is drawn as itself with no new word; a new one is drawn as the backlog and keeps its word", () => {
  for (const status of TICKET_STATUSES) assert.deepEqual(drawn(status), { status, newStatus: null });
  assert.deepEqual(drawn("triage"), { status: "backlog", newStatus: "triage" });
  // `drawnStatus` is the same judgement for the sites that need the status alone (rooms, counts, flights).
  assert.equal(drawnStatus("triage"), "backlog");
  assert.equal(drawnStatus("review"), "review");
});
