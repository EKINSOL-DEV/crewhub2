/* Design choice E2 (`say`, round 72): the Settings card's Town line says, where it says the town is kept in this browser,
   that build mode is for one tab at a time: in the demo each tab keeps its own history and the later write wins, unsaid
   (townStore.ts). A host-kept town refuses a stale write (409), and a browser-kept town in live mode waits for the host,
   so those say nothing more. The words are world/zoneText.ts's `townTabsWords`, beside `townKeepingWords`. */
import assert from "node:assert/strict";
import test from "node:test";
import { townKeeping, townTabsWords } from "../src/world/zoneText.ts";

test("a browser-kept demo town says to build in one tab at a time", () => {
  assert.equal(townTabsWords("browser"), "Build in one tab at a time; another tab's edits are not seen here.");
  assert.equal(townTabsWords(townKeeping("indexeddb", "demo")), "Build in one tab at a time; another tab's edits are not seen here.");
});

test("a host-kept town, and a browser-kept town until the host is back, say nothing about tabs", () => {
  assert.equal(townTabsWords("host"), "");
  assert.equal(townTabsWords("offline"), "");
  assert.equal(townTabsWords(townKeeping("host", "live")), "");
  assert.equal(townTabsWords(townKeeping("indexeddb", "live")), "");
});
