import assert from "node:assert/strict";
import test from "node:test";
import { lotsShown } from "../src/world/townPlan.ts";

const lots = ["apps", "platform", "studio", "ops"].flatMap((district) => Array.from({ length: 14 }, (_, i) => ({ district, number: i + 1, next: i === 0 })));

test("w6-14: at the Region level only each district's next free plot is shown; inside a district every free plot, as before", () => {
  const region = lotsShown(lots, true);
  assert.deepEqual(region.map((l) => `${l.district} ${l.number}`), ["apps 1", "platform 1", "studio 1", "ops 1"]);
  assert.equal(lotsShown(lots, false).length, 56);
  assert.deepEqual(lotsShown([], true), []);
});
