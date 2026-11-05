import assert from "node:assert/strict";
import test from "node:test";
import { zoneAddedWords, zoneRemovedWords } from "../src/world/zoneText.ts";

test("w6-6: adding and removing a zone say what they did, as the layout's moves do", () => {
  assert.equal(zoneAddedWords("Zone 1"), "Zone 1 added. Undo takes it away.");
  assert.equal(zoneRemovedWords("Zone 1"), "Zone 1 removed.");
  assert.equal(zoneRemovedWords("Harbour"), "Harbour removed.");
});
