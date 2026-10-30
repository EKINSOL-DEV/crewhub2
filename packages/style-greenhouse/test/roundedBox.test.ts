/* The kit's fast rounded box must be the addon's RoundedBoxGeometry, corner for corner: same positions, normals and UVs
   (the glass etch and the floor patterns read the UVs). */
import assert from "node:assert/strict";
import test from "node:test";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { roundedBoxGeometry } from "../src/roundedBox.ts";

test("roundedBoxGeometry matches three.js's RoundedBoxGeometry exactly, as an indexed geometry", () => {
  const cases: [number, number, number, number, number][] = [
    [1, 1, 1, 2, 0.1],
    [2.4, 0.08, 0.42, 2, 0.03],
    [0.026, 1.6, 0.3, 1, 0.008],
    [5, 0.08, 4, 2, 0.026],
    [0.3, 0.3, 0.3, 2, 0.5],
  ];
  for (const [w, h, d, segments, radius] of cases) {
    const theirs = new RoundedBoxGeometry(w, h, d, segments, radius);
    const ours = roundedBoxGeometry(w, h, d, segments, radius);
    assert.ok(ours.index, "indexed");
    const flat = ours.toNonIndexed();
    for (const name of ["position", "normal", "uv"]) {
      const a = flat.attributes[name]!.array,
        b = theirs.attributes[name]!.array;
      assert.equal(a.length, b.length, `${name} length for ${[w, h, d, segments, radius]}`);
      for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i]! - b[i]!) < 1e-5, `${name}[${i}] ${a[i]} vs ${b[i]} for ${[w, h, d, segments, radius]}`);
    }
    // Indexing shares each face's grid vertex, so far fewer vertices go through the rounding.
    assert.ok(ours.attributes.position!.count * 3 < theirs.attributes.position!.count);
  }
});
