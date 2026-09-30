import assert from "node:assert/strict";
import test from "node:test";
import { civicCenter, laneWords, moveFocus, plotCenter, TOWN_CAPACITY, townBounds, usedBounds, mmss } from "../src/world/townLayout.ts";

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

test("the home frame grows with the rows in use", () => {
  assert.equal(usedBounds(0).maxZ, usedBounds(4).maxZ);
  assert.ok(usedBounds(5).maxZ > usedBounds(4).maxZ);
  assert.equal(usedBounds(12).maxZ, usedBounds(40).maxZ);
});

test("arrow keys walk the plots in grid order and stop at the edges", () => {
  assert.equal(moveFocus(0, "ArrowLeft", 4), 0);
  assert.equal(moveFocus(0, "ArrowRight", 4), 1);
  assert.equal(moveFocus(3, "ArrowRight", 4), 3);
  assert.equal(moveFocus(3, "ArrowRight", 6), 4, "right wraps to the next row");
  assert.equal(moveFocus(1, "ArrowDown", 6), 5);
  assert.equal(moveFocus(2, "ArrowDown", 6), 2, "no plot below: stay");
  assert.equal(moveFocus(5, "ArrowUp", 6), 1);
  assert.equal(moveFocus(9, "ArrowLeft", 4), 2, "an index past the end is clamped first");
  assert.equal(moveFocus(2, "End", 4), 3);
});

test("a stale snapshot overrides every lane status", () => {
  const fresh = { teamTs: "2026-10-01T09:00:00Z", ageSeconds: 30, stale: false };
  assert.equal(laneWords("working", fresh), "working");
  assert.equal(laneWords("unknown", fresh), "status unknown");
  assert.equal(laneWords("working", { teamTs: null, ageSeconds: null, stale: true }), "status unknown");
  assert.match(laneWords("working", { ...fresh, ageSeconds: 900, stale: true }), /^stale since \d\d:\d\d$/);
});

test("playback times read as mm:ss", () => {
  assert.equal(mmss(0), "00:00");
  assert.equal(mmss(61_900), "01:01");
  assert.equal(mmss(3_600_000), "60:00");
});
