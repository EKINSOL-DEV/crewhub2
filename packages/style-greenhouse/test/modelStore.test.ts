/* The data models are validated on first use (src/models.ts), not at import: an invalid file must still be caught and
   reported, once, the first time it is asked for, and a valid one must come through unchanged. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ModelStore } from "../src/models.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const valid = JSON.parse(readFileSync(path.join(ROOT, "models", "banner.json"), "utf8")) as Record<string, unknown>;

test("a model is validated the first time it is asked for; a valid one comes through, nothing is validated at construction", () => {
  let validated = 0;
  const raw = new Map<string, unknown>([["bench", valid], ["broken", { ...valid, parts: "not a list" }], ["odd", { ...valid, unknownKey: 1 }]]);
  const warned: string[] = [];
  const store = new ModelStore(raw, (name) => (warned.push(name), validated++));
  assert.deepEqual(store.names().sort(), ["bench", "broken", "odd"]);
  assert.equal(warned.length, 0, "nothing reported before a model is asked for");
  const bench = store.get("bench");
  assert.ok(bench && Array.isArray(bench.parts) && bench.parts.length > 0, "the valid model comes through");
  assert.equal(store.get("bench"), bench, "the same object again (validated once)");
  assert.equal(store.get("nothing-of-that-name"), undefined, "an unknown name is undefined");
  assert.equal(warned.length, 0);
});

test("an invalid model is reported once, the first time, and is undefined from then on", () => {
  const warned: { name: string; errors: unknown }[] = [];
  const store = new ModelStore(new Map<string, unknown>([["broken", { ...valid, parts: "not a list" }], ["odd", { ...valid, unknownKey: 1 }]]), (name, errors) => warned.push({ name, errors }));
  assert.equal(store.get("broken"), undefined);
  assert.equal(store.get("broken"), undefined);
  assert.equal(store.get("odd"), undefined, "an unknown key is an error too (a prop file is an import format)");
  assert.deepEqual(warned.map((w) => w.name), ["broken", "odd"], "each invalid model reported once");
  assert.ok(Array.isArray(warned[0]!.errors) && (warned[0]!.errors as unknown[]).length > 0, "with its errors");
});
