import assert from "node:assert/strict";
import test from "node:test";
import { civicCenter, plotCenter, TOWN_CAPACITY, townBounds, mmss } from "../src/world/townLayout.ts";

test("plots never overlap and the civic row stays behind the buildings", () => {
  const seen = new Set<string>();
  for (let i = 0; i < TOWN_CAPACITY; i++) {
    const p = plotCenter(i);
    const key = `${p.x},${p.z}`;
    assert.ok(!seen.has(key), `plot ${i} reuses ${key}`);
    seen.add(key);
    assert.ok(p.z > civicCenter("town-hall").z);
  }
  const all = townBounds();
  for (let i = 0; i < TOWN_CAPACITY; i++) {
    const p = plotCenter(i);
    assert.ok(p.x > all.minX && p.x < all.maxX && p.z > all.minZ && p.z < all.maxZ);
  }
});

test("playback times read as mm:ss", () => {
  assert.equal(mmss(0), "00:00");
  assert.equal(mmss(61_900), "01:01");
  assert.equal(mmss(3_600_000), "60:00");
});
