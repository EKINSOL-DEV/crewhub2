/* The zone parts' line clears when what it describes no longer holds (s1's review of sugg/w6-6): after Add and Undo the
   sheet still said "Zone 1 added…" with Zone 1 gone, and a second Add wrote the same words, so the live region did not
   change and a screen reader heard nothing. As w6-3 does for the placed prop. And "Forget this zone's look" removes a
   look, not the zone: it says no "removed" (found on the way). The line is pinned to its edit's revision first
   (zoneSaidRevision.test.ts, round 67). */
import assert from "node:assert/strict";
import test from "node:test";
import { pinZoneSaid, zoneAddedSaid, zoneRemovedSaid, zoneSaidShown } from "../src/world/zoneText.ts";

const doc = (revision: number, ...ids: string[]) => ({ revision, zones: ids.map((id) => ({ id })) });
const said = pinZoneSaid(zoneAddedSaid("zone-1", "Zone 1"), doc(1, "zone-1"));

test("an added zone's line stands while the zone does, and is gone after an undo, here or in another browser", () => {
  assert.equal(zoneSaidShown(said, doc(1, "zone-1")), "Zone 1 added. Undo takes it away.");
  assert.equal(zoneSaidShown(said, doc(0)), "", "undone");
  assert.equal(zoneSaidShown(said, doc(1, "zone-2")), "");
});

test("Add, Undo, Add: the words leave the region and come back, so the region changes and is heard", () => {
  const again = pinZoneSaid(zoneAddedSaid("zone-1", "Zone 1"), doc(2, "zone-1"));
  const texts = [zoneSaidShown(said, doc(1, "zone-1")), zoneSaidShown(said, doc(0)), zoneSaidShown(again, doc(2, "zone-1"))];
  assert.deepEqual(texts, ["Zone 1 added. Undo takes it away.", "", "Zone 1 added. Undo takes it away."]);
});

test("a removed zone's line stands while the zone is gone, and goes when an undo brings it back", () => {
  const removed = pinZoneSaid(zoneRemovedSaid({ id: "zone-1", name: "Harbour", source: "town" }), doc(2));
  assert.equal(zoneSaidShown(removed, doc(2)), "Harbour removed.");
  assert.equal(zoneSaidShown(removed, doc(1, "zone-1")), "");
});

test("forgetting a group's look says no removed: the zone stays; nothing said is nothing shown", () => {
  assert.equal(zoneRemovedSaid({ id: "studio", name: "Studio", source: "group" }), null);
  assert.equal(zoneSaidShown(null, doc(1, "studio")), "");
});
