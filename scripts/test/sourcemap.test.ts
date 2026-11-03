/* The source map reader behind tools/profile.mjs (tools/lib/sourcemap.mjs, round 51, review T5): a hand-made map with
   negative deltas, a continuation digit, names, a source root and a segment without a source. The expected positions
   are what source-map-js 1.2's consumer answers for the same map (checked once by hand, not a dependency of the test). */
import assert from "node:assert/strict";
import test from "node:test";
import { SourceMap } from "../../tools/lib/sourcemap.mjs";

const MAP = {
  version: 3,
  sources: ["a.ts", "b.ts", "c/d.ts"],
  names: ["start", "townDressed", "x"],
  mappings: "AASIA,iBCPJ,uBDDSC,gjBE8qCwBC;;KD/qChC,IDuCCF,qB",
  file: "index-a1b2.js",
  sourceRoot: "../src",
};
const at = (source: string, line: number, column: number, name: string | null) => ({ source: `../src/${source}`, line, column, name });

test("each generated position maps to the last mapping at or before it, as source-map-js answers", () => {
  const map = new SourceMap(MAP);
  const cases: [number, number, ReturnType<typeof at> | null][] = [
    [1, 0, at("a.ts", 10, 4, "start")],
    [1, 16, at("a.ts", 10, 4, "start")],
    [1, 17, at("b.ts", 3, 0, null)],
    [1, 45, at("a.ts", 2, 9, "townDressed")],
    [1, 600, at("c/d.ts", 1200, 33, "x")],
    [1, 5000, at("c/d.ts", 1200, 33, "x")],
    [2, 0, null],
    [3, 4, null],
    [3, 5, at("b.ts", 1, 1, null)],
    [3, 29, at("a.ts", 40, 2, "start")],
    [3, 30, null],
    [4, 0, null],
  ];
  for (const [line, column, expected] of cases) assert.deepEqual(map.originalPositionFor({ line, column }), expected, `${line}:${column}`);
});

test("a map it cannot read is refused, never misread", () => {
  assert.throws(() => new SourceMap({ version: 2, sources: [], mappings: "" }), /version 3/);
  assert.throws(() => new SourceMap({ version: 3, sources: [], mappings: "", sections: [] }), /sectioned/);
  assert.throws(() => new SourceMap({ version: 3, sources: ["a.ts"], mappings: "AA!A" }), /base64 VLQ/);
});
