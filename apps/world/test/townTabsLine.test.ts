/* Design choice E2 (round 72, `say`): Settings > Town's line says, after the keeping sentence, to build in one tab at a
   time, for a browser-kept (IndexedDB) demo town only: a town kept by the host refuses a stale write, a browser-kept
   town in live mode waits for the host, and a memory-kept town is lost on reload and meets no other tab. The line with
   its leading space is world/zoneText.ts `townTabsLine`; components/TownSettings.tsx renders it after the keeping words.
   The before/after pair is docs/images/design-choices/E2-*. */
import assert from "node:assert/strict";
import test from "node:test";
import { townTabsLine, townTabsWords } from "../src/world/zoneText.ts";

test("E2: the tab words follow the keeping sentence for a browser-kept demo town, with their leading space", () => {
  assert.equal(townTabsLine("indexeddb", "demo"), ` ${townTabsWords("browser")}`);
  assert.equal(townTabsLine("indexeddb", "demo"), " Build in one tab at a time; another tab's edits are not seen here.");
});

test("E2: nothing for a browser-kept town in live mode, a host-kept town, or a memory-kept town", () => {
  assert.equal(townTabsLine("indexeddb", "live"), "", "waits for the host");
  assert.equal(townTabsLine("host", "live"), "", "the host refuses a stale write");
  assert.equal(townTabsLine("host", "demo"), "");
  assert.equal(townTabsLine("memory", "demo"), "", "lost on reload: no other tab to meet (not townKeeping's 'browser')");
  assert.equal(townTabsLine("memory", "live"), "");
});
