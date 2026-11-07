/* Round 50 (r50-a11y A3): in forced colours (Windows contrast themes) the browser drops every box-shadow, and with it
   the focus ring that kit.css and world.css draw after `outline: 0`. world.css gives `:focus-visible` a real outline
   there, and only there: the rule sits inside `@media (forced-colors: active)` and nowhere else, so the normal themes
   keep their rings. Read from the CSS, as scripts/check-design-system.mjs reads tokens.css. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(new URL(`../src/styles/${file}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const world = read("world.css");

/** The body of the first block whose header matches, by counting braces. */
function blockBody(source: string, header: RegExp): { body: string; start: number; end: number } | null {
  const start = source.search(header);
  if (start < 0) return null;
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}" && --depth === 0) return { body: source.slice(open + 1, i), start, end: i };
  }
  return null;
}

test("forced colours: every focus indicator gets a real outline, important over the kit's `outline: 0`", () => {
  const forced = blockBody(world, /@media\s*\(\s*forced-colors:\s*active\s*\)/);
  assert.ok(forced, "world.css has a @media (forced-colors: active) block");
  const rule = blockBody(forced.body, /(^|[\s,}]):focus-visible\s*\{/);
  assert.ok(rule, "it styles :focus-visible itself, so every element's focus is covered");
  assert.match(rule.body, /outline:\s*[1-9]\d*px\s+solid\s*!important/, "a visible outline that wins over `.btn:focus-visible { outline: 0 }`");
  assert.doesNotMatch(rule.body, /#[0-9a-f]{3,8}|rgb|hsl|var\(/i, "no colour named: currentColor, which forced colours map to a system colour");
});

test("forced colours: the outline rule exists only inside that media block (the normal themes do not change)", () => {
  const forced = blockBody(world, /@media\s*\(\s*forced-colors:\s*active\s*\)/)!;
  const outside = world.slice(0, forced.start) + world.slice(forced.end + 1);
  assert.doesNotMatch(outside, /forced-colors/, "one forced-colours block");
  assert.doesNotMatch(outside, /outline:\s*[1-9]\d*px\s+solid\s*!important/, "no important outline outside it");
  // The kit removes the outline on these and draws a box-shadow ring; the universal rule above covers each of them.
  const kit = read("kit.css");
  const removed = [...kit.matchAll(/([^{}]*:focus-visible[^{}]*)\{[^}]*outline:\s*(0|none)/g)].map((m) => m[1]!.trim());
  assert.ok(removed.length >= 8, `the kit's outline-free focus rules: ${removed.join(" | ")}`);
});
