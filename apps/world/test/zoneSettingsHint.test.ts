import assert from "node:assert/strict";
import test from "node:test";
import { zoneSettingsHint } from "../src/world/zoneText.ts";

test("round 64 (w6-9): Settings > Zones says where the zones are kept, as the Town card does: the host's in live mode", () => {
  // The demo's sentence stays as it was.
  assert.equal(
    zoneSettingsHint("browser"),
    "A zone is a district of the town: a group of buildings with a name, a mark and a look of its own. Zones are kept in this browser's town document, so another person sees their own, until crewhub-loops has project groups. Assign buildings in build mode.",
  );
  // A live town the host keeps: never "this browser".
  const host = zoneSettingsHint("host");
  assert.match(host, /kept by the world's host for this crewhub-loops and shared by every paired browser/);
  assert.doesNotMatch(host, /this browser/);
  assert.match(host, /until crewhub-loops has project groups/);
  assert.match(host, /Assign buildings in build mode\.$/);
  // A live town the browser holds until the host is back.
  const offline = zoneSettingsHint("offline");
  assert.match(offline, /kept in this browser until the host is back/);
  assert.match(offline, /Assign buildings in build mode\.$/);
});
