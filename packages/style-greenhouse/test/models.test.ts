import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PROP_MATERIALS, validatePropModel } from "@crewhub/world-engine";
import { CODE_KEYS } from "../src/keys.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as {
  coveredKeys: string[];
  palette: Record<string, string>;
  lighting: Record<string, unknown>;
};
const VARIANTS = ["archived", "dim", "urgent", "high", "star", "autumn"];
const files = readdirSync(path.join(ROOT, "models")).filter((f) => f.endsWith(".json"));

test("every model file is a valid crewhub-prop/1 model", () => {
  for (const file of files) {
    const result = validatePropModel(JSON.parse(readFileSync(path.join(ROOT, "models", file), "utf8")));
    assert.ok(result.ok, `${file}: ${result.ok ? "" : result.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
  }
});

test("coveredKeys is exactly what the style draws: its data models and its code keys", () => {
  const keys = new Set(files.map((f) => f.slice(0, -".json".length)));
  // `<key>.<variant>.json` is a variant of a covered key (the variant names of `ModelOptions.variant`).
  const variants = [...keys].filter((k) => VARIANTS.includes(k.slice(k.lastIndexOf(".") + 1)) && keys.has(k.slice(0, k.lastIndexOf("."))));
  const data = [...keys].filter((k) => !variants.includes(k));
  assert.deepEqual([...manifest.coveredKeys].sort(), [...new Set([...data, ...CODE_KEYS])].sort());
});

test("the manifest resolves every palette name and has a lighting preset per theme and per drift light", () => {
  assert.deepEqual(Object.keys(manifest.palette).sort(), [...PROP_MATERIALS].sort());
  assert.deepEqual(Object.keys(manifest.lighting).sort(), ["dawn", "day", "dusk", "lamplight", "night"]);
});
