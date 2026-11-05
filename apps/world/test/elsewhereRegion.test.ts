/* w6-12's line stands in a live region that is there before the line is (s1's note on sugg/w6-12): some screen readers do
   not announce a region that arrives with its text, and another browser's move saying nothing was the finding. Read
   from the source, as the design guard reads the CSS: these tests have no browser. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../src/components/BuildPanel.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/world.css", import.meta.url), "utf8");

test("the build sheet always renders the region, and only its text comes and goes", () => {
  assert.match(panel, /<p className="hint build-elsewhere" role="status" aria-live="polite">/);
  assert.doesNotMatch(panel, /\{elsewhere && \(/, "no region that arrives with its text");
});

test("an empty region takes no room in the sheet", () => {
  assert.match(css, /\.build-elsewhere:empty \{\s*position: absolute;\s*\}/);
});
