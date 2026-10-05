import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveStyleOptions, type StyleOption } from "@crewhub/world-style";
import { CODE_KEYS } from "../src/keys.ts";
import { compileLook, type LooksData, type MaterialSwap, type Substitute } from "../src/looks.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as {
  options: StyleOption[];
  looks: LooksData;
  materialSets: Record<string, MaterialSwap[]>;
  beds: Record<string, unknown>;
  palette: Record<string, string>;
  swatches: Record<string, string>;
  lamplightSwatches: Record<string, string>;
};
const models = new Set([...readdirSync(path.join(ROOT, "models")).map((f) => f.slice(0, -".json".length)), ...CODE_KEYS]);
const colours = new Set([...Object.keys(manifest.palette), ...Object.keys(manifest.swatches)]);
const look = (values: Record<string, string>) => compileLook(manifest.options, manifest.looks, resolveStyleOptions(manifest, values), manifest.materialSets);

test("every option has its default among its values, and the looks data names only declared options and values", () => {
  for (const option of manifest.options) assert.ok(option.values.some((v) => v.id === option.default), `${option.id}: default ${option.default}`);
  for (const [option, values] of Object.entries(manifest.looks)) {
    const declared = manifest.options.find((o) => o.id === option);
    assert.ok(declared, `looks.${option} is not an option`);
    for (const value of Object.keys(values)) assert.ok(declared.values.some((v) => v.id === value), `looks.${option}.${value} is not a value`);
  }
});

test("a look puts only models the style draws in place, and recolours with swatches it has", () => {
  const colour = (c: string, at: string) => assert.ok(c.startsWith("#") || colours.has(c), `${at}: unknown colour ${c}`);
  const swaps = (map: Record<string, string>, at: string) => Object.values(map).forEach((to) => colour(to, at));
  for (const [option, values] of Object.entries(manifest.looks))
    for (const [value, entry] of Object.entries(values)) {
      const at = `looks.${option}.${value}`;
      for (const [name, c] of Object.entries({ ...entry.swatches, ...entry.lamplightSwatches })) {
        assert.ok(colours.has(name), `${at}: recolours unknown swatch ${name}`);
        colour(c, at);
      }
      // A recoloured swatch that has a lamplight colour of its own needs one in the look too, or night keeps October's.
      for (const name of Object.keys(entry.swatches ?? {}))
        if (name in manifest.lamplightSwatches) assert.ok(name in (entry.lamplightSwatches ?? {}), `${at}: ${name} has no lamplight colour`);
      for (const [from, sub] of Object.entries(entry.models ?? {})) {
        assert.ok(models.has(from.split(":")[0]!), `${at}: replaces unknown model ${from}`);
        for (const s of (Array.isArray(sub) ? sub : [sub]) as Substitute[]) {
          if (s === null) continue;
          const key = typeof s === "string" ? s.split(":")[0]! : s.model;
          assert.ok(models.has(key), `${at}: ${from} -> unknown model ${key}`);
          if (typeof s !== "string" && s.materials) swaps(s.materials, at);
          const variant = typeof s === "string" ? s.split(":")[1] : s.variant;
          if (key === "town.flower-bed" && variant) assert.ok(variant in manifest.beds, `${at}: no bed "${variant}"`);
        }
      }
      const sets = typeof entry.materials === "string" ? manifest.materialSets[entry.materials] : entry.materials;
      if (typeof entry.materials === "string") assert.ok(sets, `${at}: no material set ${entry.materials}`);
      for (const set of sets ?? []) {
        for (const key of set.keys) assert.ok(models.has(key), `${at}: swaps materials on unknown model ${key}`);
        swaps(set.map, at);
      }
    }
});

test("the default look changes nothing", () => {
  const plain = look({});
  assert.deepEqual(plain.swatches, {});
  for (const key of models) assert.deepEqual(plain.dress(key, undefined, 3), { key, materials: null, scale: 1 });
});

test("options apply in turn: the planting chooses the tree and the season dresses it", () => {
  const spring = look({ planting: "orchard", season: "spring" });
  const tree = spring.dress("town.pine", undefined, 0)!;
  assert.equal(tree.key, "town.fruit-tree");
  assert.equal(tree.materials?.leaf, "blossom-white");
  // October keeps the fruit; summer turns the autumn trees green again.
  assert.equal(look({ planting: "orchard" }).dress("town.pine", undefined, 0)!.materials, null);
  assert.equal(look({ season: "summer" }).dress("town.oak-autumn", undefined, 0)!.key, "town.oak");
  assert.deepEqual(look({ lantern: "paper" }).dress("town.lantern", undefined, 0), { key: "town.lantern", variant: "paper", materials: null, scale: 1 });
  assert.equal(look({ planting: "meadow" }).dress("town.hedge", undefined, 0)!.key, "town.fence");
});

test("a choice is made by the seed and is stable; an accent swaps coral on the listed models only", () => {
  const market = look({ planting: "market", accent: "sky" });
  const picks = new Set(Array.from({ length: 40 }, (_, seed) => market.dress("town.feature", undefined, seed)!.key));
  assert.ok(picks.has("town.market-stall") && picks.has("town.barrow"));
  assert.deepEqual(market.dress("town.feature", undefined, 7), market.dress("town.feature", undefined, 7));
  assert.equal(market.dress("town.market-stall", undefined, 0)!.materials?.tangerine, "accent");
  assert.equal(market.dress("town.gate", undefined, 0)!.materials?.coral, "accent");
  assert.equal(market.dress("town.fruit-tree", undefined, 0)!.materials, null);
  assert.equal(market.swatches.accent, "flower-blue");
});

test("unknown options and values are ignored", () => {
  const values = resolveStyleOptions(manifest, { season: "monsoon", weather: "rain", planting: "meadow" }, { season: "summer" });
  assert.deepEqual(values, { season: "summer", planting: "meadow", accent: "coral", lantern: "iron" });
  assert.deepEqual(resolveStyleOptions({}, { season: "spring" }), {});
});
