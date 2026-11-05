/* The key hints are not read as part of a control's name (round 65, walk finding w5-15): "Town Esc" (the breadcrumb's
   back button), "Follow ⇧F" (the card), "Request a propDemo" (the build panel's field label with its Demo chip),
   "Workstation3×2" (the palette). The kbd and chip spans are aria-hidden (the keys are in the stage's guide); the
   palette's footprint and provenance stay said, as the button's description. Read from the source, as the design guard
   reads the CSS: these tests have no browser, and Node strips no JSX. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(new URL(`../src/components/${file}`, import.meta.url), "utf8");

test("the Button's key hint span is hidden from the accessibility tree", () => {
  const button = source("primitives/Button.tsx");
  const kbd = /<span className="btn-kbd"[^>]*>/.exec(button);
  assert.ok(kbd, "the Button renders its kbd hint in a .btn-kbd span");
  assert.match(kbd[0], /aria-hidden="true"/, `the hint is aria-hidden: ${kbd[0]}`);
});

test("the build panel's Demo chip in the 'Request a prop' label is hidden; the palette's meta is hidden and describes the button", () => {
  const panel = source("BuildPanel.tsx");
  const label = panel.slice(panel.indexOf('className="build-request-label"'), panel.indexOf("</span>", panel.indexOf('className="build-request-label"')));
  assert.match(label, /<Chip[^>]*aria-hidden="true"/, "the Demo chip beside 'Request a prop' is aria-hidden");
  const meta = /<span className="palette-meta"[^>]*>/.exec(panel);
  assert.ok(meta, "the palette's meta span");
  assert.match(meta[0], /aria-hidden="true"/, "the footprint and provenance are not part of the name");
  assert.match(meta[0], /id=\{/, "the meta span has an id");
  const item = panel.slice(panel.indexOf('className="palette-item"'), panel.indexOf("</Button>", panel.indexOf('className="palette-item"')));
  assert.match(item, /aria-describedby=\{/, "the palette button is described by its meta");
});
