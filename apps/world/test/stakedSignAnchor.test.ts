import assert from "node:assert/strict";
import test from "node:test";
import { fixturePlan } from "../src/world/planFixture.ts";
import { lotCentre } from "../src/world/settlement.ts";
import { stakedSignAnchor } from "../src/world/settlementDressing.ts";
import { PLOT_SIZE } from "../src/world/townLayout.ts";

test("w1-19: a clearing's staked plot has its sign in front of the lot, half a plot towards the camera from its centre, at a sign's height", () => {
  const { plan } = fixturePlan(0);
  assert.ok(plan.staked, "a clearing stakes a plot");
  const centre = lotCentre(plan.staked);
  assert.deepEqual(stakedSignAnchor(plan), { x: centre.x, y: 0.2, z: centre.z + PLOT_SIZE / 2 });
  assert.equal(PLOT_SIZE / 2, 12, "the sign stands twelve units in front of the lot's centre");
});

test("w1-19: a settlement with a project has no staked plot and no sign anchor", () => {
  for (const count of [1, 3, 12]) {
    const { plan } = fixturePlan(count);
    assert.equal(plan.staked, null);
    assert.equal(stakedSignAnchor(plan), null);
  }
});
