/* Greenhouse's looks: what each value of a style option (`style.json` "options") changes, read from `style.json`
   "looks". A value is data only: swatches it recolours (per theme), models it puts in another model's place, and
   materials it swaps on listed models. Nothing here is written per season or per flavour. Pure: no three.js, so tests
   read it. */
import type { StyleOption, StyleOptionValues } from "@crewhub/world-style";

/**
 * What stands in a model's place: another key (`"town.oak"`, or `"town.flower-bed:bulbs"` for a variant), null for
 * nothing at all, or a model with its materials swapped and a size. A list is a choice, made by the piece's seed.
 */
export type Substitute = string | null | { model: string; variant?: string; materials?: Record<string, string>; scale?: number };

export interface LookValue {
  /** Swatch or palette names recoloured in this look: a colour, or the name of another swatch. */
  swatches?: Record<string, string>;
  /** The same under lamplight; a name left out here keeps the style's own lamplight colour. */
  lamplightSwatches?: Record<string, string>;
  /** By model key, or `key:variant`. */
  models?: Record<string, Substitute | Substitute[]>;
  /**
   * Materials swapped on the listed models only (the accent on awnings and gates, not on every coral thing): the swaps,
   * or the name of a set of them in `style.json` "materialSets".
   */
  materials?: MaterialSwap[] | string;
}

export interface MaterialSwap {
  keys: string[];
  map: Record<string, string>;
}

/** By option id, then value id. The options apply in this object's order: a later one dresses what an earlier one chose. */
export type LooksData = Record<string, Record<string, LookValue>>;

/** A model as a look draws it. */
export interface Dressed {
  key: string;
  variant?: string;
  /** Part materials to swap, or null. */
  materials: Record<string, string> | null;
  scale: number;
}

export interface Look {
  /** Stable for the same values. */
  readonly id: string;
  readonly values: StyleOptionValues;
  readonly swatches: Record<string, string>;
  readonly lamplightSwatches: Record<string, string>;
  /** What stands where `key` was asked for; null when the look leaves the spot empty. */
  dress(key: string, variant: string | undefined, seed: number): Dressed | null;
}

/** A small stable hash of a seed, so neighbouring seeds do not pick in step. */
function pick<T>(list: readonly T[], seed: number): T {
  let h = Math.imul(Math.floor(Math.abs(seed)) + 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  return list[(h >>> 0) % list.length]!;
}

function compose(first: Record<string, string> | null, then: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...then };
  for (const [from, to] of Object.entries(first ?? {})) out[from] = then[to] ?? to;
  return out;
}

/** The look of a set of option values. Options and values the data does not describe change nothing. */
export function compileLook(options: readonly StyleOption[], data: LooksData, values: StyleOptionValues, sets: Record<string, MaterialSwap[]> = {}): Look {
  const declared = new Set(options.map((o) => o.id));
  const chosen: LookValue[] = [];
  for (const [option, byValue] of Object.entries(data)) {
    const value = declared.has(option) ? values[option] : undefined;
    const entry = value === undefined ? undefined : byValue[value];
    if (entry) chosen.push(entry);
  }
  const swatches: Record<string, string> = {};
  const lamplightSwatches: Record<string, string> = {};
  for (const entry of chosen) {
    Object.assign(swatches, entry.swatches);
    Object.assign(lamplightSwatches, entry.lamplightSwatches);
  }
  return {
    id: Object.keys(values)
      .sort()
      .map((k) => `${k}=${values[k]}`)
      .join(";"),
    values,
    swatches,
    lamplightSwatches,
    dress(key, variant, seed) {
      const out: Dressed = { key, materials: null, scale: 1, ...(variant ? { variant } : {}) };
      for (const entry of chosen) {
        const found = entry.models && ((out.variant !== undefined ? entry.models[`${out.key}:${out.variant}`] : undefined) ?? entry.models[out.key]);
        if (found !== undefined) {
          const sub = Array.isArray(found) ? pick(found, seed) : found;
          if (sub === null) return null;
          if (typeof sub === "string") {
            const [model, v] = sub.split(":");
            out.key = model!;
            if (v) out.variant = v;
          } else {
            out.key = sub.model;
            if (sub.variant) out.variant = sub.variant;
            if (sub.materials) out.materials = compose(out.materials, sub.materials);
            out.scale *= sub.scale ?? 1;
          }
        }
        for (const swap of (typeof entry.materials === "string" ? sets[entry.materials] : entry.materials) ?? [])
          if (swap.keys.includes(out.key)) out.materials = compose(out.materials, swap.map);
      }
      return out;
    },
  };
}
