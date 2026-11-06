/**
 * Design choice S3 (`idle`): Nicky's restart request to g-man at 12:56 in the small team. cr-dev-2's lane says done
 * at 4:30 and idle from 6:00, so a visitor who opens its card sees idle; the request says the same.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_SEED, SMALL_TEAM_STORY, buildStory } from "../src/script.ts";
import { at } from "../src/time.ts";

test("S3: Nicky's restart request says cr-dev-2 has sat idle since the merge", () => {
  const entries = buildStory(SMALL_TEAM_STORY, DEMO_SEED);
  const dms = entries.filter((e) => e.action.type === "dm" && e.action.agent === "g-man" && Math.abs(e.at - at("12:56")) < 2000);
  assert.equal(dms.length, 1, "one dm from Nicky to g-man at 12:56");
  const dm = dms[0]!.action;
  if (dm.type !== "dm") throw new Error("not a dm");
  assert.equal(dm.from, "nicky");
  assert.equal(dm.text, "Please restart cr-dev-2; it has sat idle since the merge.");
});
