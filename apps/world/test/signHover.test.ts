/* Round 65 (w1-15): a building's sign reacts under the pointer as it does on focus: a hover rule lifts it (a transform
   off its resting place) and deepens its shadow. Before, `.town-sign` had a focus-visible rule only, and the pointer's
   shape was all that said the sign takes a click. Read from world.css, as ruleWordContrast.test.ts reads it. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles/world.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `a rule for ${selector}`);
  return css.slice(at, css.indexOf("}", at));
}

test("round 65 (w1-15): .town-sign:hover lifts the sign and deepens its shadow, as :focus-visible marks it", () => {
  const rest = block(".town-sign");
  const hover = block(".town-sign:hover");
  const transform = (text: string) => (text.match(/transform:\s*([^;]+);/) ?? [])[1]?.trim();
  assert.ok(transform(rest), "the sign has a resting transform");
  assert.ok(transform(hover), "the hover rule moves the sign");
  assert.notEqual(transform(hover), transform(rest), "the lift is a different place from rest");
  assert.match(hover, /box-shadow:\s*var\(--shadow-md\)/, "a deeper shadow on hover");
  assert.match(block(".town-sign:focus-visible"), /box-shadow/, "the focus rule still marks the sign");
});
