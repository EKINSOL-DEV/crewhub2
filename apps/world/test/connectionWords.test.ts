/* Design choice L1 (`own-words`, round 72): the connection chip's words as the chip, the panel and App's announcement
   compute them (components/connectionWords.ts, Vite-free; ConnectionChip.tsx keeps the markup and re-exports them):
   the state's word, its hint with the host's own reason or the "gave no reason" fallback, the text view's line, and
   the chip's tone (stalled, attention or plain), where host-tabs and host-failed join the attention states. The
   strings themselves are pinned in connectionWordsL1.test.ts; the browser has no row for the two states' chips. */
import assert from "node:assert/strict";
import test from "node:test";
import type { ConnectionState } from "@crewhub/loops-client";
import { chipTone, connectionHint, connectionLine, connectionWord } from "../src/components/connectionWords.ts";

test("L1: the host-failed hint carries the host's reason, or the fallback when it gave none", () => {
  assert.equal(connectionHint("host-failed", "a read the allow-list refused"), "The world's host could not read crewhub-loops: a read the allow-list refused");
  assert.equal(connectionHint("host-failed", null), "The world's host could not read crewhub-loops: it gave no reason; its log says more.");
  assert.equal(connectionHint("host-failed"), connectionHint("host-failed", null), "no reason given: the fallback");
  assert.equal(connectionHint("host-failed", ""), "The world's host could not read crewhub-loops: ", "an empty reason is the host's own (empty) words, not the fallback");
});

test("L1: a state without a {reason} in its hint ignores the reason", () => {
  assert.equal(connectionHint("host-tabs", "whatever"), "This host has too many tabs open; close one. crewhub-loops is fine; the page keeps asking.");
  assert.equal(connectionHint("live", "whatever"), connectionHint("live"));
  assert.doesNotMatch(connectionHint("live"), /\{reason\}|gave no reason/);
});

test("L1: the word and the text view's line", () => {
  assert.equal(connectionWord("host-tabs"), "Too many tabs");
  assert.equal(connectionWord("host-failed"), "Host could not read loops");
  assert.equal(connectionWord("live"), "Live");
  assert.equal(connectionLine("host-tabs"), "Live data from crewhub-loops through the world's host: Too many tabs.");
});

test("L1: the chip's tone: stale and stream-busy stalled; loops-down, unauthorized, unpaired, host-tabs and host-failed attention; the rest plain", () => {
  const tones: Record<ConnectionState, ReturnType<typeof chipTone>> = {
    connecting: "plain",
    live: "plain",
    "catching-up": "plain",
    stale: "stalled",
    "stream-busy": "stalled",
    "loops-down": "attention",
    unauthorized: "attention",
    unpaired: "attention",
    "host-tabs": "attention",
    "host-failed": "attention",
  };
  for (const [state, tone] of Object.entries(tones)) assert.equal(chipTone(state as ConnectionState), tone, state);
});
