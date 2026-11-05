/* Round 66 (w3-4): a chat mark beside a pin takes its own tap. On a touch screen the pin's `::after` is its tap area, and
   an absolute `::after` measures against the nearest positioned box: with a static pin in `.roof-row` that box was the
   row, so the pin's area lay over the whole row and a mark answered only once its fading opacity lifted it above. Read
   from world.css, as signHover.test.ts reads it; regress chat holds the same in a browser, this runs in npm test. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles/world.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

test("round 66 (w3-4): in a roof row the pin and the mark are positioned, so each tap area measures against its own button", () => {
  const rule = css.match(/\.roof-row > \.need-pin,\s*\.roof-row > \.chat-mark \{([^}]*)\}/);
  assert.ok(rule, "one rule for the pin and the mark in a row");
  assert.match(rule[1] ?? "", /position:\s*relative/);
});

test("round 66 (w3-4): on a coarse pointer the mark has a tap area of its own, as the pin has", () => {
  const coarse = css.indexOf("@media (pointer: coarse)", css.indexOf(".roof-row {"));
  assert.notEqual(coarse, -1, "the coarse block after the row's rules");
  const area = css.slice(coarse).match(/([^{}]*)\{\s*content: "";\s*position: absolute;/);
  assert.ok(area, "the tap area's rule");
  const selectors = (area[1] ?? "").split(",").map((s) => s.trim());
  assert.ok(selectors.includes(".need-pin::after"), selectors.join(" | "));
  assert.ok(selectors.includes(".chat-mark::after"), selectors.join(" | "));
});
