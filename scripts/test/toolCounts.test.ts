/* The tools that end with `<tool>: <passed>/<total>` (round 48, review F20): a step that throws is a failing check, never
   a check that drops out of the total, and no check is `ok(<name>, true)`, which cannot fail. Read from the source: the
   tools need a browser and a server, so this is the guard that keeps the pattern a11y.mjs has. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TOOLS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "tools");
const COUNTING = ["a11y.mjs", "connectshots.mjs"];

/** Each `catch (…) {` with the lines up to its closing brace at the same indentation. */
function catches(text: string): { line: number; body: string }[] {
  const lines = text.split("\n");
  const out: { line: number; body: string }[] = [];
  lines.forEach((l, i) => {
    const m = /^(\s*)\} catch \((\w+)\) \{\s*$/.exec(l);
    if (m === null) return;
    const end = lines.findIndex((x, j) => j > i && x.startsWith(`${m[1]}}`));
    out.push({ line: i + 1, body: lines.slice(i + 1, end).join("\n") });
  });
  return out;
}

for (const file of COUNTING) {
  test(`${file}: every caught step is a failing check, and no check is ok(<name>, true)`, () => {
    const text = readFileSync(path.join(TOOLS, file), "utf8");
    const silent = catches(text).filter((c) => !/\bok\([^;]*,\s*false\b/.test(c.body));
    assert.deepEqual(silent.map((c) => `${file}:${c.line}`), [], "a catch that only notes the error drops the step's checks from the total and still ends at full marks");
    const always = text.split("\n").flatMap((l, i) => (/\bok\((?:"[^"]*"|`[^`]*`),\s*true\)/.test(l) ? [`${file}:${i + 1}`] : []));
    assert.deepEqual(always, [], "ok(<name>, true) can never fail");
  });
}
