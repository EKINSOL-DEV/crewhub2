/* The page's one polite region (App.tsx; round 50, r50-a11y N3): a sentence said again is heard again. A region speaks
   when its text changes, so the same sentence twice changed nothing and was heard once ("Stopped following." after a
   second follow, "The town." after a second Escape). Pure. */
import assert from "node:assert/strict";
import test from "node:test";
import { nextAnnouncement } from "../src/state/announce.ts";

test("nextAnnouncement: a new sentence as it is; the same one again changes the region's text, and spoken alike", () => {
  assert.equal(nextAnnouncement("", "The town."), "The town.");
  const again = nextAnnouncement("The town.", "The town.");
  assert.notEqual(again, "The town.", "the region's text changes, so it speaks again");
  assert.equal(again.trim(), "The town.", "only a trailing space a screen reader does not say");
  assert.equal(nextAnnouncement(again, "The town."), "The town.", "a third time changes it back");
  assert.equal(nextAnnouncement("Walking stopped.", "The town."), "The town.");
  assert.equal(nextAnnouncement("The town.", ""), "", "an empty region stays empty");
});
