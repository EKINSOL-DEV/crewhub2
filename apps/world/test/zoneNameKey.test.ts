/* Design choice E1 (round 72, `escape`): in a zone's name field Enter writes the draft and Escape drops it, keeping
   the old name; every other key is the field's own. The key names are state/zoneNameField.ts `zoneNameKey`, the step
   they lead to `zoneNameStep` (held by zoneNameField.test.ts); components/ZonePanel.tsx's `ZoneName` keeps the draft
   in its state and the handlers. The before/after pair is docs/images/design-choices/E1-*. */
import assert from "node:assert/strict";
import test from "node:test";
import { zoneNameKey } from "../src/state/zoneNameField.ts";

test("E1: Enter is the enter event, Escape the escape event, any other key none", () => {
  assert.deepEqual(zoneNameKey("Enter"), { type: "enter" });
  assert.deepEqual(zoneNameKey("Escape"), { type: "escape" });
  assert.equal(zoneNameKey("Tab"), null, "leaving the field is the blur's business");
  assert.equal(zoneNameKey("a"), null);
  assert.equal(zoneNameKey("Esc"), null, "the key's name as KeyboardEvent.key gives it, not an old alias");
  assert.equal(zoneNameKey(" "), null);
});
