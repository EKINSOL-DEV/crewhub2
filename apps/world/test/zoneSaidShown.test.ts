/* The zone parts' line clears when what it describes no longer holds (s1's review of sugg/w6-6): after Add and Undo the
   sheet still said "Zone 1 added…" with Zone 1 gone, and a second Add wrote the same words, so the live region did not
   change and a screen reader heard nothing. As w6-3 does for the placed prop. And "Forget this zone's look" removes a
   look, not the zone: it says no "removed" (found on the way). */
import assert from "node:assert/strict";
import test from "node:test";
import { zoneAddedSaid, zoneRemovedSaid, zoneSaidShown } from "../src/world/zoneText.ts";

const said = zoneAddedSaid("zone-1", "Zone 1");

test("an added zone's line stands while the zone does, and is gone after an undo, here or in another browser", () => {
  assert.equal(zoneSaidShown(said, ["zone-1"]), "Zone 1 added. Undo takes it away.");
  assert.equal(zoneSaidShown(said, []), "", "undone");
  assert.equal(zoneSaidShown(said, ["zone-2"]), "");
});

test("Add, Undo, Add: the words leave the region and come back, so the region changes and is heard", () => {
  const texts = [zoneSaidShown(said, ["zone-1"]), zoneSaidShown(said, []), zoneSaidShown(zoneAddedSaid("zone-1", "Zone 1"), ["zone-1"])];
  assert.deepEqual(texts, ["Zone 1 added. Undo takes it away.", "", "Zone 1 added. Undo takes it away."]);
});

test("a removed zone's line stands while the zone is gone, and goes when an undo brings it back", () => {
  const removed = zoneRemovedSaid({ id: "zone-1", name: "Harbour", source: "town" });
  assert.equal(zoneSaidShown(removed, []), "Harbour removed.");
  assert.equal(zoneSaidShown(removed, ["zone-1"]), "");
});

test("forgetting a group's look says no removed: the zone stays; nothing said is nothing shown", () => {
  assert.equal(zoneRemovedSaid({ id: "studio", name: "Studio", source: "group" }), null);
  assert.equal(zoneSaidShown(null, ["studio"]), "");
});
