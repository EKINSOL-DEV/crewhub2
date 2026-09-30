import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const STYLE_DIR = "packages/style-greenhouse/";
const REGISTRATION = "apps/world/src/world/style.ts";
/** This test names the package in its own examples. */
const SELF = "apps/world/test/styleBoundary.test.ts";

/** Module specifiers a source file imports or re-exports (static and dynamic). */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) found.push(match[1]!);
  return found;
}

/** Why a file breaks the style boundary, or null. `file` is repo-relative with forward slashes. */
export function styleBoundaryViolation(file: string, source: string): string | null {
  if (file.startsWith(STYLE_DIR)) return null;
  for (const spec of specifiers(source)) {
    if (spec === "@crewhub/style-greenhouse" || spec.startsWith("@crewhub/style-greenhouse/")) {
      if (file !== REGISTRATION) return `${file} imports ${spec}; only ${REGISTRATION} registers styles`;
    } else if (spec.startsWith(".")) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      if (target.startsWith(STYLE_DIR)) return `${file} reaches into the style package through ${spec}`;
    }
  }
  return null;
}

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* sources(rel);
    else if (/\.tsx?$/.test(entry.name)) yield rel;
  }
}

test("the scanner flags style imports outside the registration module", () => {
  assert.equal(styleBoundaryViolation(REGISTRATION, 'import { greenhouseStyle } from "@crewhub/style-greenhouse";'), null);
  assert.match(styleBoundaryViolation("apps/world/src/world/TownScene.ts", 'import { x } from "@crewhub/style-greenhouse";') ?? "", /only/);
  assert.match(styleBoundaryViolation("apps/world/src/App.tsx", 'const m = import("@crewhub/style-greenhouse/src/kit.ts");') ?? "", /only/);
  assert.match(styleBoundaryViolation("apps/world/src/world/a.ts", 'import { Kit } from "../../../../packages/style-greenhouse/src/kit.ts";') ?? "", /reaches into/);
  assert.equal(styleBoundaryViolation("packages/style-greenhouse/src/index.ts", 'import { Kit } from "./kit.ts";'), null);
  assert.equal(styleBoundaryViolation("apps/world/src/world/a.ts", 'import type { WorldStyle } from "@crewhub/world-style";'), null);
});

test("no module outside the style package imports it, except the registration", () => {
  const violations: string[] = [];
  for (const dir of ["apps", "packages"])
    for (const file of sources(dir)) {
      if (file === SELF) continue;
      const problem = styleBoundaryViolation(file, readFileSync(path.join(ROOT, file), "utf8"));
      if (problem) violations.push(problem);
    }
  assert.deepEqual(violations, []);
});
