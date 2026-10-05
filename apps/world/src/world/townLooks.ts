/* Which look each part of the town wears: the town's own picks for its style's options, and a district's where one
   stands. Pure (no Three.js, no DOM), so it runs under `node --test`. The values are a style's own ids; nothing here
   knows them, and the style ignores what it does not know (`resolveStyleOptions`).

   Who fills it: the zone resolver gives each district its resolved picks (building, then zone, then the viewer, then
   the town); the settlement gives each district its ground. Until a town has districts, `previewLooks` reads the
   same shape from the address bar, so a look can be seen and photographed on its own. */
import type { StyleOptionValues } from "@crewhub/world-style";
import type { Bounds } from "./townLayout.ts";

export interface DistrictLook {
  /** The district's ground: what stands on it is drawn in its look, and it gets the look's own turf. */
  bounds: Bounds;
  options: StyleOptionValues;
}

export interface TownLooks {
  /** The picks for everything outside a district, or null for the style as it stands. */
  town: StyleOptionValues | null;
  districts: readonly DistrictLook[];
}

/** The picks that apply at a spot: its district's (the first that holds it), else the town's. */
export function lookAt(looks: TownLooks | null | undefined, x: number, z: number): StyleOptionValues | null {
  if (!looks) return null;
  for (const d of looks.districts) if (x >= d.bounds.minX && x < d.bounds.maxX && z >= d.bounds.minZ && z < d.bounds.maxZ) return d.options;
  return looks.town;
}

/** A stable word for a set of looks, for change detection. */
export function looksSignature(looks: TownLooks | null | undefined): string {
  if (!looks) return "";
  const word = (o: StyleOptionValues | null) => (o ? Object.keys(o).sort().map((k) => `${k}:${o[k]}`).join(",") : "");
  return [word(looks.town), ...looks.districts.map((d) => `${d.bounds.minX},${d.bounds.maxX},${d.bounds.minZ},${d.bounds.maxZ}=${word(d.options)}`)].join("|");
}

/** `season:spring,planting:orchard` as picks. */
export function parseLook(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of text.split(",")) {
    const [id, value] = pair.split(":").map((s) => s.trim());
    if (id && value) out[id] = value;
  }
  return out;
}

/**
 * The preview hook: `?look=season:spring,planting:orchard` dresses the whole town, and
 * `?looks=season:spring|season:summer,planting:market` lays those looks side by side as bands from west to east (an
 * empty band keeps the town's look). Null when the address names neither.
 */
export function previewLooks(search: string, bounds: Bounds): TownLooks | null {
  const params = new URLSearchParams(search);
  const town = params.get("look");
  const bands = params.get("looks");
  if (town === null && bands === null) return null;
  const parts = bands === null ? [] : bands.split("|");
  const width = (bounds.maxX - bounds.minX) / Math.max(1, parts.length);
  return {
    town: town === null ? null : parseLook(town),
    districts: parts.flatMap((part, i) =>
      part.trim() ? [{ bounds: { minX: bounds.minX + i * width, maxX: bounds.minX + (i + 1) * width, minZ: bounds.minZ, maxZ: bounds.maxZ + 1e-3 }, options: parseLook(part) }] : [],
    ),
  };
}
