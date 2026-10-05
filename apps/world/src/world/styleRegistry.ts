/* The style registry: styles register by manifest, renderers get them by id, and a building resolves its style from
   its plot (the plot's style id, else the town default). Nothing here knows a particular style. A key a style does not
   cover draws a neutral placeholder (a plain mist crate, drawn by the style's own parts renderer) and warns once.
   Pure of three.js, so it runs under `node --test`. */
import type { PropModel } from "@crewhub/world-engine";
import type { ModelKey, ModelOptions, ResolvedStyle, StyleManifest, WorldStyle, WorldStyleFactory } from "@crewhub/world-style";

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

/** A plot as far as styles care: tonight no plot sets a style, so every one resolves to the town default. */
export interface StyledPlot {
  styleId?: string | null;
}

export interface StyleRegistry {
  readonly defaultId: string;
  registerStyle(factory: WorldStyleFactory): void;
  /** The style for an id; an unknown id resolves to the town default. One instance per id. */
  getStyle(id: string): ResolvedStyle;
  listStyles(): StyleManifest[];
  /** The id a plot resolves to: its own style id when registered, else the town default. */
  styleIdFor(plot: StyledPlot | null | undefined): string;
  styleFor(plot: StyledPlot | null | undefined): ResolvedStyle;
}

export function createStyleRegistry(defaultId: string, warn: (message: string) => void = (m) => console.warn(m)): StyleRegistry {
  const factories = new Map<string, WorldStyleFactory>();
  const instances = new Map<string, ResolvedStyle>();
  const resolve = (style: WorldStyle): ResolvedStyle => {
    const warned = new Set<string>();
    const resolved: ResolvedStyle = {
      manifest: style.manifest,
      model(key: ModelKey, options?: ModelOptions) {
        const object = style.model(key, options);
        if (object) return object;
        if (!warned.has(key)) {
          warned.add(key);
          warn(`World style "${style.manifest.id}" does not cover "${key}"; drawing the neutral placeholder.`);
        }
        return style.parts(PLACEHOLDER_MODEL);
      },
      robot: (options) => style.robot(options),
      ...(style.figureKit ? { figureKit: (cast: Parameters<NonNullable<WorldStyle["figureKit"]>>[0]) => style.figureKit!(cast) } : {}),
      parts: (prop) => style.parts(prop),
      color: (name, theme) => style.color(name, theme),
      setTheme: (theme) => style.setTheme(theme),
      environment: (scene, renderer, theme) => style.environment(scene, renderer, theme),
      materialise: (object, progress) => style.materialise(object, progress),
      dispose: () => style.dispose(),
    };
    return resolved;
  };
  const registry: StyleRegistry = {
    defaultId,
    registerStyle(factory) {
      factories.set(factory.manifest.id, factory);
    },
    getStyle(id) {
      const known = factories.has(id) ? id : defaultId;
      let style = instances.get(known);
      if (!style) {
        const factory = factories.get(known);
        if (!factory) throw new Error(`No world style is registered as "${known}".`);
        style = resolve(factory.create());
        instances.set(known, style);
      }
      return style;
    },
    listStyles: () => [...factories.values()].map((f) => f.manifest),
    styleIdFor(plot) {
      const id = plot?.styleId;
      return id && factories.has(id) ? id : defaultId;
    },
    styleFor(plot) {
      return registry.getStyle(registry.styleIdFor(plot));
    },
  };
  return registry;
}
