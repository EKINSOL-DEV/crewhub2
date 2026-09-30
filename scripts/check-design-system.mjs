import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Validate the actual exported tokens, including text on selected surfaces.
const css = await readFile(
  new URL("../apps/world/src/design-system/tokens.css", import.meta.url),
  "utf8",
);
const themes = Object.fromEntries(
  [...css.matchAll(/\[data-crew-theme="(light|dark)"\] \{([\s\S]*?)\n\}/g)].map(
    ([, theme, body]) => [
      theme,
      Object.fromEntries(
        [...body.matchAll(/--ch-([\w-]+):\s*([^;]+);/g)].map(
          ([, name, value]) => [name, value],
        ),
      ),
    ],
  ),
);
assert.deepEqual(Object.keys(themes).sort(), ["dark", "light"]);
assert.deepEqual(
  Object.keys(themes.light).sort(),
  Object.keys(themes.dark).sort(),
  "Themes must expose the same semantic tokens",
);

function luminance(hex) {
  assert.match(hex, /^#[a-f\d]{6}$/i, "Contrast pairs must use opaque colors");
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

const pairs = [];
for (const foreground of ["ink", "ink-secondary", "ink-muted"]) {
  for (const background of [
    "canvas",
    "surface",
    "surface-muted",
    "selection",
    "surface-hover",
  ])
    pairs.push([foreground, background, 4.5]);
}
for (const tone of ["working", "attention", "complete", "danger", "neutral"])
  pairs.push([tone, `${tone}-bg`, 4.5]);
for (const background of ["accent", "accent-hover"])
  pairs.push(["on-accent", background, 4.5]);
for (const foreground of ["border-control", "focus"]) {
  for (const background of ["canvas", "surface", "surface-muted"])
    pairs.push([foreground, background, 3]);
}
let minimumText = Infinity;
for (const [theme, values] of Object.entries(themes)) {
  for (const [foreground, background, minimum] of pairs) {
    const [low, high] = [
      luminance(values[foreground]),
      luminance(values[background]),
    ].sort((a, b) => a - b);
    const ratio = (high + 0.05) / (low + 0.05);
    assert.ok(
      ratio >= minimum,
      `${theme} ${foreground} on ${background}: ${ratio.toFixed(2)}:1, expected ${minimum}:1`,
    );
    if (minimum === 4.5) minimumText = Math.min(minimumText, ratio);
  }
}
console.log(
  `Design system: matching theme tokens and ${pairs.length * 2} contrast pairs pass. Lowest text contrast: ${minimumText.toFixed(2)}:1.`,
);
