/* Look resolution: which style, style options and cast a building or a district wears. One order for all three, from
   the most specific to the most general: the building, its zone, the viewer's choice, the town, the style's default.
   Each thing falls through on its own: a zone that names only a cast leaves the season to the viewer or the town, and
   one option of a layer does not hide the layer below for the other options. Ids nobody registered fall through too.
   Pure: the registries are passed in, so this runs under `node --test`. */

export const LOOK_ORDER = ["building", "zone", "viewer", "town", "style"] as const;
export type LookSource = (typeof LOOK_ORDER)[number];

/** What one layer asks for; everything is optional. */
export interface LookLayer {
  styleId?: string | null | undefined;
  styleOptions?: Readonly<Record<string, string>> | null | undefined;
  castId?: string | null | undefined;
}

/** The layers a look resolves from. The style's own defaults come from its manifest, not from here. */
export type LookLayers = Partial<Record<Exclude<LookSource, "style">, LookLayer | null | undefined>>;

/** An option a style declares, as far as resolution cares (a subset of the style contract's `StyleOption`). */
export interface DeclaredOption {
  id: string;
  default: string;
  values: readonly { id: string }[];
}

/** What resolution needs from the style and cast registries. */
export interface LookRegistries {
  styles: {
    readonly defaultId: string;
    has(id: string): boolean;
    /** The manifest of a registered style: its default cast and the options it declares. */
    manifest(id: string): { defaultCast?: string; options?: readonly DeclaredOption[] };
  };
  casts: {
    readonly fallbackId: string;
    has(id: string): boolean;
  };
}

export interface ResolvedLook {
  styleId: string;
  /** Every option the style declares, filled; nothing the style does not declare. */
  styleOptions: Record<string, string>;
  castId: string;
  /** Where each answer came from; "style" is the style's own default. */
  from: { styleId: LookSource; castId: LookSource; styleOptions: Record<string, LookSource> };
  /** Cast and style ids that were asked for but are not registered. */
  unknown: { casts: string[]; styles: string[] };
}

const LAYERS = LOOK_ORDER.filter((source): source is Exclude<LookSource, "style"> => source !== "style");

export function resolveLook(layers: LookLayers, registries: LookRegistries): ResolvedLook {
  const { styles, casts } = registries;
  const unknown = { casts: [] as string[], styles: [] as string[] };
  const note = (list: string[], id: string) => void (list.includes(id) || list.push(id));

  let styleId = styles.defaultId;
  let styleFrom: LookSource = "style";
  for (const source of LAYERS) {
    const id = layers[source]?.styleId;
    if (!id) continue;
    if (styles.has(id)) {
      styleId = id;
      styleFrom = source;
      break;
    }
    note(unknown.styles, id);
  }
  const manifest = styles.manifest(styleId);

  const styleOptions: Record<string, string> = {};
  const optionsFrom: Record<string, LookSource> = {};
  for (const option of manifest.options ?? []) {
    styleOptions[option.id] = option.default;
    optionsFrom[option.id] = "style";
    for (const source of LAYERS) {
      const value = layers[source]?.styleOptions?.[option.id];
      if (value === undefined || !option.values.some((v) => v.id === value)) continue;
      styleOptions[option.id] = value;
      optionsFrom[option.id] = source;
      break;
    }
  }

  let castId = casts.fallbackId;
  let castFrom: LookSource = "style";
  for (const source of LOOK_ORDER) {
    const id = source === "style" ? manifest.defaultCast : layers[source]?.castId;
    if (!id) continue;
    if (casts.has(id)) {
      castId = id;
      castFrom = source;
      break;
    }
    note(unknown.casts, id);
  }

  return { styleId, styleOptions, castId, from: { styleId: styleFrom, castId: castFrom, styleOptions: optionsFrom }, unknown };
}

/** The style-option layers of a look, most specific first: what `resolveStyleOptions` of the style contract takes. */
export function optionLayers(layers: LookLayers): Record<string, string>[] {
  return LAYERS.flatMap((source) => {
    const values = layers[source]?.styleOptions;
    return values && Object.keys(values).length ? [{ ...values }] : [];
  });
}

/** A stable key for a resolved look: equal looks can share one dressed style and one batch. */
export function lookKey(look: Pick<ResolvedLook, "styleId" | "styleOptions" | "castId">): string {
  const options = Object.keys(look.styleOptions)
    .sort()
    .map((id) => `${id}=${look.styleOptions[id]}`)
    .join(",");
  return `${look.styleId}|${options}|${look.castId}`;
}
