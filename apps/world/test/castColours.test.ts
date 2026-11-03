/* Every colour name a registered cast draws in is one the style's kit knows (round 51, r50-packages C4). The kit never
   throws on an unknown name: it draws the neutral `no-project` swatch, so a misspelt "terracota" would validate, build,
   pass the contract and draw grey. The cast validator cannot know the style's names; this test reads them from every
   style package's `style.json`, as castContract.test.ts reads the work surfaces. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { castRegistry } from "../src/world/cast.ts";

const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages");
interface StyleNames {
  id: string;
  palette: Record<string, string>;
  swatches: Record<string, string>;
  lamplightSwatches?: Record<string, string>;
}
const styles = readdirSync(PACKAGES)
  .filter((name) => name.startsWith("style-"))
  .map((name) => JSON.parse(readFileSync(path.join(PACKAGES, name, "style.json"), "utf8")) as StyleNames);

/** Resolved in every kit unless the cast gives its own colour of that name (`FigureKit` in world-cast). */
const RESERVED = ["alert", "stale"];
/** The project colour, plain or soft (`figureColor` in world-cast). */
const ACCENTS = ["accent", "soft:accent"];

/** Every colour name in a figure's data with its path: parts, looks, perch steps, the halo and the colourways. */
function colourNames(value: unknown, at: string, out: [string, string][]): [string, string][] {
  if (Array.isArray(value)) value.forEach((v, i) => colourNames(v, `${at}[${i}]`, out));
  else if (typeof value === "object" && value !== null)
    for (const [key, v] of Object.entries(value)) {
      const here = `${at}.${key}`;
      if (["color", "glow", "halo", "lead"].includes(key) && typeof v === "string") out.push([here, v]);
      else if (at.includes(".colorways.") && key === "others" && Array.isArray(v)) v.forEach((c, i) => out.push([`${here}[${i}]`, c as string]));
      else if (at.includes(".colorways.") && key === "roles" && typeof v === "object" && v !== null)
        for (const [role, c] of Object.entries(v)) out.push([`${here}.${role}`, c as string]);
      else colourNames(v, here, out);
    }
  return out;
}

/** The cast colours a cast draws with: its own and those of every cast down its `extends` chain. */
function castColours(id: string): Set<string> {
  const names = new Set<string>();
  const manifests = new Map(castRegistry.listCasts().map((m) => [m.id, m]));
  for (let m = manifests.get(id); m; m = m.extends ? manifests.get(m.extends) : undefined) for (const name of Object.keys(m.colors)) names.add(name);
  return names;
}

test("every colour name a registered cast's figure and person draw in is a cast colour, a reserved name or known to every style", () => {
  assert.ok(styles.length > 0);
  let checked = 0;
  const unknown: string[] = [];
  for (const { id } of castRegistry.listCasts()) {
    const own = castColours(id);
    for (const [which, spec] of [
      ["figure", castRegistry.figureOf(id)],
      ["person", castRegistry.personOf(id)],
    ] as const) {
      if (!spec) continue;
      const slots = new Set(Object.keys(spec.colorways ?? {}));
      for (const [at, name] of colourNames(spec, `${id}.${which}`, [])) {
        checked++;
        if (ACCENTS.includes(name)) continue;
        if (name.startsWith("slot:")) {
          if (!slots.has(name.slice("slot:".length))) unknown.push(`${at}: "${name}" is no colourway of the ${which}`);
          continue;
        }
        const plain = name.replace(/^(soft|wash):/, "");
        if (own.has(plain) || RESERVED.includes(plain)) continue;
        for (const style of styles)
          if (!(plain in style.palette || plain in style.swatches || plain in (style.lamplightSwatches ?? {})))
            unknown.push(`${at}: "${name}" is no cast colour of ${id} and no colour of the ${style.id} style (it would draw the neutral swatch)`);
      }
    }
  }
  assert.ok(checked > 0, "the walk found colour names");
  assert.deepEqual(unknown, []);
});
