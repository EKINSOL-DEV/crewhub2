/**
 * Design choice W8 (`none`): no road of the world calls a model (the scripted director calls none), so Settings'
 * read-only "Director model" field says so in place of naming one. The sheet draws with React under Vite; the hold
 * reads the source, as tour.test.ts reads Tour.tsx.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "components", "PresenceSettings.tsx"), "utf8");

test("W8 (none): the Director model field says none and why; its hint keeps only 'Read-only.'; the sheet names no model", () => {
  assert.match(source, /<Field label="Director model" size="sm" readOnly value="none; the scripted director calls no model" hint="Read-only\." \/>/);
  assert.doesNotMatch(source, /DIRECTOR_MODEL|claude-|Cheap models/, "the sheet names no model and no rule for one");
});
