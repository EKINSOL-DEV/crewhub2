import { test } from "node:test";
import assert from "node:assert/strict";
import { MOTES, MOTE_DRIFT, MOTE_LIFT, MOTE_OUT, mote, moteCount } from "../src/world/dust.ts";

test("no motes under reduced motion, a few otherwise", () => {
  assert.equal(moteCount(true), 0);
  assert.equal(moteCount(false), MOTES);
  assert.ok(MOTES >= 3 && MOTES <= 8, "a few, not a cloud");
});

test("a mote hovers low before its package's front face and never stands still", () => {
  const out = { x: 0, y: 0, z: 0 };
  for (const size of [{ x: 0.3, y: 0.05, z: 0.22 }, { x: 0.26, y: 0.2, z: 0.2 }]) {
    for (const seed of [0, 1, 0xdeadbeef, 2166136261]) {
      let moved = 0;
      for (let i = 0; i < MOTES; i++) {
        let last: { x: number; z: number } | null = null;
        for (let t = 0; t < 30; t += 0.5) {
          mote(seed, i, t, size, out);
          assert.ok(Math.abs(out.x) <= size.x / 2 + 0.02 + 1e-9, `seed ${seed} mote ${i} at ${t}s is ${out.x} across`);
          assert.ok(out.z >= size.z / 2 + MOTE_OUT - 1e-9 && out.z <= size.z / 2 + MOTE_OUT + MOTE_DRIFT + 1e-9, `seed ${seed} mote ${i} at ${t}s is ${out.z} before the face`);
          assert.ok(out.y >= -size.y && out.y <= -size.y + MOTE_LIFT + 1e-9, `seed ${seed} mote ${i} at ${t}s is ${out.y} from the top`);
          if (last && (last.x !== out.x || last.z !== out.z)) moved++;
          last = { x: out.x, z: out.z };
        }
      }
      assert.ok(moved > MOTES * 50, `seed ${seed}: the motes moved ${moved} times`);
    }
  }
});

const SIZE = { x: 0.3, y: 0.05, z: 0.22 };

test("the same seed, mote and time give the same place; two packages differ", () => {
  const a = mote(42, 1, 3.5, SIZE, { x: 0, y: 0, z: 0 });
  const b = mote(42, 1, 3.5, SIZE, { x: 0, y: 0, z: 0 });
  assert.deepEqual(a, b);
  const c = mote(43, 1, 3.5, SIZE, { x: 0, y: 0, z: 0 });
  assert.notDeepEqual(a, c);
});
