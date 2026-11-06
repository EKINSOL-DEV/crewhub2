/* Design choice E1 (`escape`, round 72): the zone name field's draft. Typing keeps a draft; Enter or leaving the field
   writes it (trimmed, empty is no name; unchanged writes nothing); Escape drops the draft and keeps the old name, and a
   blur after it writes nothing. The step is pure (state/zoneNameField.ts) so this test holds it; ZonePanel's ZoneName
   wires it to the field. */
import assert from "node:assert/strict";
import test from "node:test";
import { zoneNameStep } from "../src/state/zoneNameField.ts";

test("typing keeps a draft; Enter writes it trimmed, and leaving the field does the same", () => {
  assert.deepEqual(zoneNameStep(null, "Brand", { type: "type", value: "Brand " }), { draft: "Brand ", write: null });
  assert.deepEqual(zoneNameStep("Brand ", "Brand", { type: "type", value: "Brand x" }), { draft: "Brand x", write: null });
  assert.deepEqual(zoneNameStep("Brand x", "Brand", { type: "enter" }), { draft: null, write: { name: "Brand x" } });
  assert.deepEqual(zoneNameStep(" Lab ", "Brand", { type: "blur" }), { draft: null, write: { name: "Lab" } });
  assert.deepEqual(zoneNameStep("   ", "Brand", { type: "enter" }), { draft: null, write: { name: null } }, "an empty draft clears the name");
});

test("an unchanged draft, or no draft, writes nothing on Enter or blur", () => {
  assert.deepEqual(zoneNameStep("Brand", "Brand", { type: "enter" }), { draft: null, write: null });
  assert.deepEqual(zoneNameStep(null, "Brand", { type: "blur" }), { draft: null, write: null });
  assert.deepEqual(zoneNameStep("", null, { type: "blur" }), { draft: null, write: null }, "no name to no name is no write");
});

test("E1: Escape drops the draft and keeps the old name; the blur that follows writes nothing", () => {
  const dropped = zoneNameStep("Brand x", "Brand", { type: "escape" });
  assert.deepEqual(dropped, { draft: null, write: null });
  assert.deepEqual(zoneNameStep(dropped.draft, "Brand", { type: "blur" }), { draft: null, write: null });
  assert.deepEqual(zoneNameStep(null, "Brand", { type: "escape" }), { draft: null, write: null }, "Escape with no draft is nothing");
});
