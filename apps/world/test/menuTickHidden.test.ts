/* A checked menu row's tick is drawn, not read (round 65, walk finding w5-16, the tick's half): the scenario picker read
   "Small team 4 projects ✓", the glyph being the kit's generated content, while the row is already [checked]. The
   world's own stylesheet gives the glyph empty alternative text (`content: "✓" / ""`), which the accessibility tree
   drops; kit.css stays the verbatim copy. Read from the source, as the design guard reads the CSS. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles/world.css", import.meta.url), "utf8");
const kit = readFileSync(new URL("../src/styles/kit.css", import.meta.url), "utf8");

/** The body of the first rule whose selector list is exactly `selector`. */
const rule = (text: string, selector: string): string | null => {
  const at = text.indexOf(`\n${selector} {`);
  return at < 0 ? null : text.slice(at, text.indexOf("}", at));
};

test("the kit draws a checked row's tick as generated content, and the world's sheet gives it empty alternative text", () => {
  const checked = '.menu-item[aria-checked="true"]::after';
  assert.match(kit, /\.menu-item\[aria-checked="true"\]::after \{ content: "✓";/, "the kit's tick (a copy; unchanged)");
  const own = rule(css, checked);
  assert.ok(own, `world.css has its own rule for ${checked}`);
  assert.match(own, /content: "✓" \/ "";/, "the tick is drawn with empty alternative text");
  const combobox = rule(css, ".menu-combobox .menu-item[data-checked]::after");
  assert.ok(combobox && /content: "✓" \/ "";/.test(combobox), "the combobox's chosen row too (aria-selected says it)");
});
