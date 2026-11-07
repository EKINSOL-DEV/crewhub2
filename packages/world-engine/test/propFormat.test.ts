/* Drift test: the skill's prop-format.md must describe exactly what props.ts validates, and every example must pass. */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROP_CATEGORIES,
  PROP_FORMAT,
  PROP_LIMITS,
  PROP_MATERIALS,
  PROP_SHAPES,
  validatePropModel,
} from "../src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const skill = path.join(root, "skills/prop-builder");
const doc = readFileSync(path.join(skill, "references/prop-format.md"), "utf8");

/** The table rows of a `## heading` section: [first cell without backticks, second cell]. */
function tableRows(heading: string): [string, string][] {
  const start = doc.indexOf(`\n## ${heading}\n`);
  assert.ok(start >= 0, `prop-format.md has no "## ${heading}" section`);
  const end = doc.indexOf("\n## ", start + 1);
  return doc
    .slice(start, end < 0 ? undefined : end)
    .split("\n")
    .filter((line) => /^\|\s*`/.test(line))
    .map((line) => {
      const cells = line.split("|").map((c) => c.trim());
      return [cells[1]!.replace(/`/g, ""), cells[2]!];
    });
}

test("prop-format.md lists exactly the shapes, materials and categories of props.ts, in order", () => {
  assert.deepEqual(tableRows("Shapes").map(([name]) => name), [...PROP_SHAPES]);
  assert.deepEqual(tableRows("Materials").map(([name]) => name), [...PROP_MATERIALS]);
  assert.deepEqual(tableRows("Categories").map(([name]) => name), [...PROP_CATEGORIES]);
  assert.ok(doc.includes(`"${PROP_FORMAT}"`));
});

test("prop-format.md states every numeric limit of PROP_LIMITS with its value", () => {
  const documented = Object.fromEntries(tableRows("Limits").map(([key, value]) => [key, Number(value)]));
  assert.deepEqual(documented, { ...PROP_LIMITS });
});

test("the skill's own examples are valid, warning-free, named after their id, and each has its request", () => {
  const dir = path.join(skill, "references/examples");
  const files = readdirSync(dir);
  const props = files.filter((f) => f.endsWith(".json"));
  assert.ok(props.length >= 6 && props.length <= 8, `expected 6 to 8 examples, found ${props.length}`);
  for (const file of props) {
    const slug = file.replace(/\.json$/, "");
    const result = validatePropModel(JSON.parse(readFileSync(path.join(dir, file), "utf8")));
    assert.ok(result.ok, `${file}: ${result.ok ? "" : JSON.stringify(result.errors)}`);
    assert.deepEqual(result.warnings, [], file);
    assert.equal(result.value.id, `user:${slug}`, file);
    assert.ok(files.includes(`${slug}.request.md`), `${file} has no ${slug}.request.md`);
    assert.match(readFileSync(path.join(dir, `${slug}.request.md`), "utf8"), /^# Prop: /, `${slug}.request.md`);
  }
});

test("the complete example in prop-format.md is valid and matches the example file", () => {
  const block = doc.match(/## A complete example\n+```json\n([\s\S]*?)\n```/);
  assert.ok(block, "prop-format.md has no complete json example");
  const inDoc = JSON.parse(block[1]!);
  assert.ok(validatePropModel(inDoc).ok);
  const file = JSON.parse(readFileSync(path.join(skill, "references/examples/floor-lamp.json"), "utf8"));
  assert.deepEqual(inDoc, file);
});
