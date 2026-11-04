/* Round 61 (W6): the contract's budget (apps/world/test/castContract.test.ts) measures every cast with the reference
   kit, and that has leverage only while the reference kit draws what the style's kit draws. Every registered cast,
   every role and the person, every state, near and far: the same measure under both kits. A fifth cast is covered the
   moment it is registered. The style's index needs Vite, so the Greenhouse kit is built from style.json, as
   crowdBounded.test.ts does. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BufferGeometry } from "three";
import { PROP_LIMITS } from "@crewhub/world-engine";
import { CAST_ROLES, everyState, measureFigure, referenceKit, type Cast, type CastManifest, type FigureHandle, type FigurePart } from "@crewhub/world-cast";
import { castRegistry } from "../../../apps/world/src/world/cast.ts";
import { figureKit } from "../src/figureKit.ts";
import { Kit, type GreenhouseManifestData } from "../src/kit.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as GreenhouseManifestData & { id: string; lighting: ConstructorParameters<typeof Kit>[1] };

const greenhouse = { manifest: { id: manifest.id }, figureKit: (cast: Pick<CastManifest, "id" | "colors">) => figureKit(new Kit(manifest, manifest.lighting), cast) };
/** No `figureKit`: the registry falls back to the reference kit, as the contract test measures. */
const reference = { manifest: { id: "reference" } };

/** The figures of a cast, the same keys under either kit: every role, and the person. */
function figuresOf(cast: Cast): { at: string; handle: FigureHandle }[] {
  const figures: { at: string; handle: FigureHandle }[] = CAST_ROLES.map((role) => ({ at: role, handle: cast.figure({ key: `parity:${role}`, role, accent: role === "unknown" ? null : "coral" }) }));
  if (cast.hasPerson) figures.push({ at: "person", handle: cast.person({ key: "parity:person" }) });
  return figures;
}

for (const { id } of castRegistry.listCasts())
  test(`${id}: every role and the person measure the same under the reference kit and the style's kit, every state, near and far`, () => {
    const under = figuresOf(castRegistry.castFor(reference, id));
    const style = figuresOf(castRegistry.castFor(greenhouse, id));
    assert.deepEqual(style.map((f) => f.at), under.map((f) => f.at));
    let drawn = 0;
    for (let i = 0; i < under.length; i++) {
      const a = under[i]!.handle;
      const b = style[i]!.handle;
      for (const state of everyState())
        for (const detail of ["near", "far"] as const) {
          for (const handle of [a, b]) {
            handle.setState(state);
            handle.setDetail(detail);
            handle.update(0.3);
          }
          const measured = measureFigure(a);
          drawn += measured.triangles;
          assert.deepEqual(measureFigure(b), measured, `${id} ${under[i]!.at} ${detail} ${JSON.stringify(state)}`);
        }
      a.dispose();
      b.dispose();
    }
    assert.ok(drawn > 0, `${id} draws something to compare`);
  });

const triangles = (geometry: BufferGeometry) => (geometry.index ? geometry.index.count : geometry.getAttribute("position")!.count) / 3;
const part = (shape: FigurePart["shape"], size: FigurePart["size"], radius?: number): FigurePart => ({ shape, size, position: [0, 0, 0], ...(radius === undefined ? {} : { radius }) });
const JUST_PAST = 0.001;

test("the kits agree part by part: a box with no radius, and each small-part size at its limit and just past it", () => {
  const { plainBevel, smallSphere, smallCylinder } = PROP_LIMITS;
  const rows: [string, FigurePart, number][] = [
    ["a box with no radius", part("box", [0.3, 0.3, 0.3]), 300],
    ["a bevel at the limit", part("box", [0.3, 0.3, 0.3], plainBevel), 12],
    ["a bevel past it", part("box", [0.3, 0.3, 0.3], plainBevel + JUST_PAST), 108],
    ["a sphere at the limit", part("sphere", [smallSphere, smallSphere, smallSphere]), 80],
    ["a sphere past it", part("sphere", [smallSphere + JUST_PAST, smallSphere, smallSphere]), 216],
    ["a cylinder at the limit", part("cylinder", [smallCylinder, 0.2, smallCylinder]), 40],
    ["a cylinder past it", part("cylinder", [smallCylinder + JUST_PAST, 0.2, smallCylinder]), 80],
  ];
  const plain = referenceKit({});
  const styled = figureKit(new Kit(manifest, manifest.lighting), { id: "parity", colors: {} });
  for (const [at, shape, expected] of rows) {
    assert.equal(triangles(plain.part(shape, "cream").geometry), expected, `the reference kit: ${at}`);
    assert.equal(triangles(styled.part(shape, "cream").geometry), expected, `the style's kit: ${at}`);
  }
});
