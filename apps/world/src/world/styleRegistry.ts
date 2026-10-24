/* The style registry: styles register by manifest, renderers get them by id, and a building resolves its style from
   its plot (the plot's style id, else the town default), dressed in the option values that apply to it. Nothing here knows a particular style. A key a style does not
   cover draws a neutral placeholder (a plain mist crate, drawn by the style's own parts renderer) and warns once.
   Pure of three.js, so it runs under `node --test`. */
import type { PropModel } from "@crewhub/world-engine";
import { resolveStyleOptions, styleOptionsKey, type ModelKey, type ModelOptions, type ResolvedStyle, type StyleManifest, type StyleOptionValues, type WorldStyle, type WorldStyleFactory } from "@crewhub/world-style";

/** The documented neutral placeholder for an uncovered key. */
export const PLACEHOLDER_MODEL: PropModel = {
  format: "crewhub-prop/1",
  id: "builtin:placeholder",
  name: "Placeholder",
  description: "Stands in for a model the style does not provide.",
  category: "decoration",
  tags: ["placeholder"],
  footprint: { width: 1, depth: 1 },
  blocksMovement: false,
  approaches: [],
  parts: [{ shape: "box", size: [0.3, 0.3, 0.3], position: [0, 0.15, 0], material: "mist", radius: 0.03 }],
};

/** A plot as far as styles care: its own style id and its own picks for that style's options, when it has them. */
export interface StyledPlot {
  styleId?: string | null;
  styleOptions?: StyleOptionValues | null;
}

export interface StyleRegistry {
  readonly defaultId: string;
  registerStyle(factory: WorldStyleFactory): void;
  /**
   * The style for an id, dressed in option values when given (resolved against its manifest: what the style does not
   * know is ignored); an unknown id resolves to the town default. One instance per id and set of values.
   */
  getStyle(id: string, options?: StyleOptionValues | null): ResolvedStyle;
  listStyles(): StyleManifest[];
  /** The id a plot resolves to: its own style id when registered, else the town default. */
  styleIdFor(plot: StyledPlot | null | undefined): string;
  /**
   * The style a plot is drawn with. `options` are the picks that apply to it, already put in order by the caller (a
   * building's, else its zone's, else the viewer's, else the town's); left out, the plot's own picks.
   */
  styleFor(plot: StyledPlot | null | undefined, options?: StyleOptionValues | null): ResolvedStyle;
}

export function createStyleRegistry(defaultId: string, warn: (message: string) => void = (m) => console.warn(m)): StyleRegistry {
  const factories = new Map<string, WorldStyleFactory>();
  const instances = new Map<string, ResolvedStyle>();
  /** `base` is the style itself; `style` is it in one set of option values (the same object for the default look). */
  const resolve = (base: WorldStyle, baseValues: Record<string, string>): ResolvedStyle => {
    const warned = new Set<string>();
    const looks = new Map<string, ResolvedStyle>();
    const look = (style: WorldStyle, options: Record<string, string>): ResolvedStyle => ({
      manifest: base.manifest,
      options,
      model(key: ModelKey, modelOptions?: ModelOptions) {
        const object = style.model(key, modelOptions);
        if (object) return object;
        if (!warned.has(key)) {
          warned.add(key);
          warn(`World style "${base.manifest.id}" does not cover "${key}"; drawing the neutral placeholder.`);
        }
        return style.parts(PLACEHOLDER_MODEL);
      },
      withOptions(values) {
        const next = resolveStyleOptions(base.manifest, values);
        const key = styleOptionsKey(next);
        let dressed = looks.get(key);
        if (!dressed) looks.set(key, (dressed = look(base.withOptions?.(next) ?? base, next)));
        return dressed;
      },
      ...(base.figureKit ? { figureKit: (cast: Parameters<NonNullable<WorldStyle["figureKit"]>>[0]) => base.figureKit!(cast) } : {}),
      parts: (prop) => style.parts(prop),
      color: (name, theme) => style.color(name, theme),
      setTheme: (theme) => base.setTheme(theme),
      environment: (scene, renderer, theme) => base.environment(scene, renderer, theme),
      materialise: (object, progress) => base.materialise(object, progress),
      dispose: () => base.dispose(),
    });
    // The default look is the style as it stands, so nothing changes for a town that never picks an option.
    const standing = look(base, baseValues);
    looks.set(styleOptionsKey(baseValues), standing);
    return standing;
  };
  const registry: StyleRegistry = {
    defaultId,
    registerStyle(factory) {
      factories.set(factory.manifest.id, factory);
    },
    getStyle(id, options) {
      const known = factories.has(id) ? id : defaultId;
      let style = instances.get(known);
      if (!style) {
        const factory = factories.get(known);
        if (!factory) throw new Error(`No world style is registered as "${known}".`);
        style = resolve(factory.create(), resolveStyleOptions(factory.manifest));
        instances.set(known, style);
      }
      return options ? style.withOptions(options) : style;
    },
    listStyles: () => [...factories.values()].map((f) => f.manifest),
    styleIdFor(plot) {
      const id = plot?.styleId;
      return id && factories.has(id) ? id : defaultId;
    },
    styleFor(plot, options) {
      return registry.getStyle(registry.styleIdFor(plot), options ?? plot?.styleOptions);
    },
  };
  return registry;
}
