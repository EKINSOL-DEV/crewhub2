/* A hand-made zone nobody named is removed by its label, "Unnamed zone", as Settings and the sheet call it (round 68, mx2:
   a mutant of zoneText.ts:33 that read the raw name instead of the label survived the zone said tests, which all name
   their zone). */
import assert from "node:assert/strict";
import test from "node:test";
import { zoneLabel, zoneRemovedSaid } from "../src/world/zoneText.ts";

test("w6-6 (round 68, mx2: zoneText.ts:33): a hand-made zone without a name is removed by its label, Unnamed zone", () => {
  const unnamed = { id: "zone-9", name: null, source: "town" as const };
  assert.equal(zoneRemovedSaid(unnamed)?.text, "Unnamed zone removed.");
  assert.equal(zoneRemovedSaid(unnamed)?.text, `${zoneLabel(unnamed)} removed.`, "the label, the same word everywhere");
  assert.equal(zoneRemovedSaid({ id: "zone-1", name: "Harbour", source: "town" })?.text, "Harbour removed.");
  assert.equal(zoneRemovedSaid({ id: "group-1", name: null, source: "group" }), null, "a group's zone is never removed, named or not");
});
