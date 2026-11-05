/* Round 65 (w3-1, s1's review): the Chat chip's count (`.chat-open .chat-count`, App.tsx) reads at 4.5:1 or better on its
   own background in both themes. The resolver is ruleWordContrast.test.ts's, copied: tokens.css (light, and the explicit
   dark block), color-mix in oklab or sRGB, the WCAG 2 contrast ratio. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = strip(readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8"));
const world = strip(readFileSync(new URL("../src/styles/world.css", import.meta.url), "utf8"));

function body(source: string, header: RegExp): string {
  const open = source.indexOf("{", source.search(header));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`no block ${header}`);
}
const declarations = (text: string) => new Map([...text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
const light = declarations(body(tokens, /^:root\s*\{/m));
const THEMES = { light, dark: new Map([...light, ...declarations(body(tokens, /:root\[data-theme="dark"\]\s*\{/))]) };

type Rgb = [number, number, number];
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c: number) => Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
function toOklab([r, g, b]: Rgb): Rgb {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, A, B]: Rgb): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [delin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), delin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), delin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
function split(text: string): string[] {
  const out: string[] = [];
  let depth = 0,
    cur = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  return [...out, cur.trim()];
}
/** An opaque colour expression of the tokens (hex, var, color-mix of two opaque colours). */
function resolve(value: string, theme: Map<string, string>): Rgb {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as Rgb;
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolve(theme.get(ref[1]!) ?? assert.fail(`no ${ref[1]}`), theme);
  const mix = v.match(/^color-mix\(in (oklab|srgb),\s*([\s\S]*)\)$/);
  if (!mix) assert.fail(`cannot resolve ${v}`);
  const [p, q] = split(mix[2]!).map((part) => part.match(/^([\s\S]*?)(?:\s+([\d.]+)%)?$/)!);
  const w = p![2] !== undefined ? Number(p![2]) / 100 : q![2] !== undefined ? 1 - Number(q![2]) / 100 : 0.5;
  const [a, b] = [resolve(p![1]!, theme), resolve(q![1]!, theme)];
  if (mix[1] === "srgb") return a.map((x, i) => x * w + b[i]! * (1 - w)) as Rgb;
  const [oa, ob] = [toOklab(a), toOklab(b)];
  return fromOklab(oa.map((x, i) => x * w + ob[i]! * (1 - w)) as Rgb);
}
const luminance = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function ratio(fg: string, bg: string, theme: Map<string, string>): number {
  const [x, y] = [luminance(resolve(fg, theme)), luminance(resolve(bg, theme))].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

test("round 65 (w3-1): .chat-open .chat-count's text is 4.5:1 or better on its own background in both themes", () => {
  const rule = body(world, /(^|\})\s*\.chat-open \.chat-count\s*\{/);
  const color = rule.match(/(?:^|[;\s])color:\s*([^;]+);/)?.[1];
  const background = rule.match(/(?:^|[;\s])background:\s*([^;]+);/)?.[1];
  assert.ok(color && background, `.chat-open .chat-count sets a colour and a background: ${rule}`);
  for (const [name, theme] of Object.entries(THEMES)) {
    const r = ratio(color, background, theme);
    assert.ok(r >= 4.5, `${name}: ${color} on ${background} is ${r.toFixed(2)}:1`);
  }
});
