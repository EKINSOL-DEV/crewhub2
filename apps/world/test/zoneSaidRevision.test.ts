/* The zone parts' line does not outlive the undo step it promises (round 67, v4-1 on sugg/w6-6): "Zone 1 added. Undo
   takes it away." stood after a later edit (a building moved, a Tidy), when Undo would do something else. The line
   belongs to the revision its edit made: it is pinned to that revision when the zone first holds, shown while the town
   is on it, cleared by any later edit (a new revision) and by an undo (the zone gone), and back after a redo (the same
   revision again). As a placement's message clears at the next edit (w6-3). */
import assert from "node:assert/strict";
import test from "node:test";
import { pinZoneSaid, zoneAddedSaid, zoneRemovedSaid, zoneSaidShown } from "../src/world/zoneText.ts";

const doc = (revision: number, ...ids: string[]) => ({ revision, zones: ids.map((id) => ({ id })) });
const words = "Zone 1 added. Undo takes it away.";

test("the line is pinned to the revision the add made, once the zone is there", () => {
  const fresh = zoneAddedSaid("zone-1", "Zone 1");
  assert.equal(fresh.revision, null, "nothing pinned before the edit landed");
  assert.equal(pinZoneSaid(fresh, doc(2)), fresh, "the zone not there yet (an async commit): not pinned, unchanged");
  const pinned = pinZoneSaid(fresh, doc(3, "zone-1"));
  assert.equal(pinned?.revision, 3);
  assert.equal(pinZoneSaid(pinned, doc(4, "zone-1")), pinned, "pinned once: a later revision does not move it");
  assert.equal(pinZoneSaid(null, doc(3)), null);
});

test("shown while the town is on that revision; a later edit clears it; the undo of that edit brings it back", () => {
  const said = pinZoneSaid(zoneAddedSaid("zone-1", "Zone 1"), doc(3, "zone-1"));
  assert.equal(zoneSaidShown(said, doc(3, "zone-1")), words);
  assert.equal(zoneSaidShown(said, doc(4, "zone-1")), "", "a building moved, a Tidy, a prop placed: Undo no longer takes the zone away");
  assert.equal(zoneSaidShown(said, doc(3, "zone-1")), words, "undone back to the add's revision: true again");
  assert.equal(zoneSaidShown(said, doc(2)), "", "the add undone: the zone gone");
  assert.equal(zoneSaidShown(zoneAddedSaid("zone-1", "Zone 1"), doc(3, "zone-1")), "", "not pinned yet: nothing shown until the revision is known");
});

test("a removed zone's line follows the same rule", () => {
  const removed = pinZoneSaid(zoneRemovedSaid({ id: "zone-1", name: "Harbour", source: "town" }), doc(5));
  assert.equal(removed?.revision, 5);
  assert.equal(zoneSaidShown(removed, doc(5)), "Harbour removed.");
  assert.equal(zoneSaidShown(removed, doc(6)), "", "a later edit");
  assert.equal(zoneSaidShown(removed, doc(4, "zone-1")), "", "undone: the zone back");
});
