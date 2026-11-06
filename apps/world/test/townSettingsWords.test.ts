/**
 * Design choice W7 (`drop`): Settings › Town's style hint speaks to a visitor, not to tonight's build. The component
 * draws with React under Vite, so the hold reads the source, as tour.test.ts reads Tour.tsx.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "components", "TownSettings.tsx"), "utf8");

test("W7 (drop): the style hint says 'for now', not 'tonight'", () => {
  assert.match(source, /<p className="hint">The only style for now; buildings follow the town style unless their plot names another\.<\/p>/);
  const shown = source.replace(/^\s*(\/\*[\s\S]*?\*\/|\/\/.*)$/gm, "");
  assert.doesNotMatch(shown, /tonight/, "no visible 'tonight' is left in the sheet");
});
