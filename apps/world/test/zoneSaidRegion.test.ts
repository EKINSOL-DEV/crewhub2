/* w6-6's line stands in a live region that is there before the line is (s1's note on sugg/w6-6): some screen readers do
   not announce a region that arrives with its text, and "Add a zone" saying nothing was the finding. Read from the
   source, as the design guard reads the CSS: these tests have no browser; the walk rows read the page. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../src/components/ZonePanel.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/world.css", import.meta.url), "utf8");

test("both zone parts always render the region, and only its text comes and goes", () => {
  assert.equal(panel.match(/<p className="hint zone-said" role="status" aria-live="polite">/g)?.length, 2, "Settings' part and build mode's part");
  assert.doesNotMatch(panel, /\{edits\.said && \(/, "no region that arrives with its text");
});

test("an empty region takes no room in the sheet", () => {
  assert.match(css, /\.zone-said:empty \{\s*position: absolute;\s*\}/);
});
