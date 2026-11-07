import assert from "node:assert/strict";
import { test } from "node:test";
import { firstSnapshotWords } from "../src/state/firstSnapshot.ts";

/** The key and its variables, so the test reads the choice and not the English. */
const t = (key: string, vars?: Record<string, string | number>) => `${key.replace("world.firstSnapshot.", "")}${vars ? " " + JSON.stringify(vars) : ""}`;

test("the first-snapshot line follows the host's snapshot state, an older host included", () => {
  assert.equal(firstSnapshotWords(null, t), "connecting");
  assert.equal(firstSnapshotWords(undefined, t), "connecting");
  assert.equal(firstSnapshotWords({ state: "idle" }, t), "connecting");
  assert.equal(firstSnapshotWords({ state: "reading", reads: 0 }, t), "listing");
  assert.equal(firstSnapshotWords({ state: "reading", reads: 18, projects: 12 }, t), 'reading {"count":12,"projects":"projects","reads":18}');
  assert.equal(firstSnapshotWords({ state: "reading", reads: 3, projects: 1 }, t), 'reading {"count":1,"projects":"project","reads":3}');
  assert.equal(firstSnapshotWords({ state: "ready", projects: 5, reads: 31, ms: 118 }, t), 'ready {"count":5,"projects":"projects"}');
  assert.equal(firstSnapshotWords({ state: "failed", reason: "loops_down" }, t), 'failed {"reason":"loops_down"}');
});
