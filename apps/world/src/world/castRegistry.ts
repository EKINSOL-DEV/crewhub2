/* The cast registry: casts register by manifest, like styles, and a building resolves its cast from its plot, the
   viewer's choice, the town and the style's default. A cast that `extends` another is resolved here (its figure is the
   base's with its patch applied); no cast imports another. Nothing here knows a particular cast or style. */
import {
  applyFigurePatch,
  createCast,
  referenceKit,
  validateCastManifest,
  validateFigure,
  validateFigurePatch,
  type Cast,
  type CastFactory,
  type CastManifest,
  type FigureExtension,
  type FigureKit,
  type FigureSpec,
} from "@crewhub/world-cast";

/** A style as far as casts care: its default cast and the kit it draws figures with. */
export interface CastStyle {
  manifest: { id: string; defaultCast?: string };
  figureKit?(cast: Pick<CastManifest, "id" | "colors">): FigureKit;
}

/** Who asked for which cast; the first registered one wins, in this order. */
export interface CastChoice {
  /** The building's own cast (the town document's plot). */
  building?: string | null | undefined;
  /** The viewer's choice in Settings. */
  viewer?: string | null | undefined;
  /** The town document's cast. */
  town?: string | null | undefined;
  /** The style's default cast. */
  style?: string | null | undefined;
}

export interface CastRegistry {
  readonly fallbackId: string;
  /** Registers a cast; one whose data does not validate is refused with a warning. */
  registerCast(factory: CastFactory): boolean;
  listCasts(): CastManifest[];
  has(id: string): boolean;
  /** The figure of a cast with its `extends` chain resolved, or null (unknown, code-only or a broken chain). */
  figureOf(id: string): FigureSpec | null;
  /** The cast id a choice resolves to, and the ids that were asked for but are not registered. */
  resolve(choice: CastChoice): { id: string; unknown: string[] };
  /** The cast as drawn in a style; one instance per style and cast. An unknown id draws the fallback. */
  castFor(style: CastStyle, id: string): Cast;
}

export function createCastRegistry(fallbackId: string, warn: (message: string) => void = (m) => console.warn(m)): CastRegistry {
  const factories = new Map<string, CastFactory>();
  const instances = new WeakMap<CastStyle, Map<string, Cast>>();
  const warned = new Set<string>();
  const once = (message: string) => {
    if (warned.has(message)) return;
    warned.add(message);
    warn(message);
  };

  /** The factories from a cast down to the one it is built on, the cast itself first; null for a loop or a gap. */
  const chain = (id: string): CastFactory[] | null => {
    const found: CastFactory[] = [];
    for (let next: string | undefined = id; next !== undefined; ) {
      const factory = factories.get(next);
      if (!factory || found.includes(factory)) return null;
      found.push(factory);
      next = factory.manifest.extends;
    }
    return found;
  };

  const registry: CastRegistry = {
    fallbackId,
    registerCast(factory) {
      const manifest = validateCastManifest(factory.manifest);
      const errors = manifest.ok ? [] : manifest.errors;
      if (factory.figure) {
        const figure = factory.figure.format === "crewhub-figure-patch/1" ? validateFigurePatch(factory.figure) : validateFigure(factory.figure);
        if (!figure.ok) errors.push(...figure.errors);
        if (manifest.ok && (factory.figure.format === "crewhub-figure-patch/1") !== (factory.manifest.extends !== undefined))
          errors.push("cast: a cast that extends another ships a crewhub-figure-patch/1, any other a crewhub-figure/1");
      } else if (!factory.create) errors.push("cast: needs a figure (data) or create (code)");
      if (errors.length) {
        warn(`Cast "${String(factory.manifest?.id)}" is not registered:\n  ${errors.join("\n  ")}`);
        return false;
      }
      factories.set(factory.manifest.id, factory);
      return true;
    },
    listCasts: () => [...factories.values()].map((f) => f.manifest),
    has: (id) => factories.has(id),
    figureOf(id) {
      const links = chain(id);
      const base = links?.at(-1)?.figure;
      if (!links || !base || base.format !== "crewhub-figure/1") return null;
      let spec: FigureSpec = base;
      for (let i = links.length - 2; i >= 0; i--) {
        const patch = links[i]!.figure;
        if (!patch || patch.format !== "crewhub-figure-patch/1") return null;
        spec = applyFigurePatch(spec, patch);
      }
      // A patch names joints and parts of its base: the patched figure is checked as a whole.
      if (links.length > 1) {
        const checked = validateFigure(spec);
        if (!checked.ok) {
          once(`Cast "${id}" does not fit the cast it extends:\n  ${checked.errors.join("\n  ")}`);
          return null;
        }
      }
      return spec;
    },
    resolve(choice) {
      const unknown: string[] = [];
      for (const id of [choice.building, choice.viewer, choice.town, choice.style]) {
        if (!id) continue;
        if (factories.has(id)) return { id, unknown };
        if (!unknown.includes(id)) unknown.push(id);
      }
      return { id: fallbackId, unknown };
    },
    castFor(style, id) {
      let known = factories.has(id) ? id : fallbackId;
      if (known !== id) once(`No cast is registered as "${id}"; drawing "${fallbackId}".`);
      if (known !== fallbackId && !factories.get(known)!.create && !registry.figureOf(known)) {
        once(`Cast "${known}" cannot be built; drawing "${fallbackId}".`);
        known = fallbackId;
      }
      let casts = instances.get(style);
      if (!casts) instances.set(style, (casts = new Map()));
      let cast = casts.get(known);
      if (cast) return cast;
      const links = chain(known);
      const factory = factories.get(known);
      if (!factory || !links) throw new Error(`No cast is registered as "${known}".`);
      // A re-dress draws with its base's colours too, its own over them.
      const colors = Object.assign({}, ...links.map((f) => f.manifest.colors).reverse()) as CastManifest["colors"];
      const kit = style.figureKit?.({ id: known, colors }) ?? referenceKit(colors);
      if (factory.create) cast = factory.create(kit);
      else {
        const spec = registry.figureOf(known);
        if (!spec) throw new Error(`Cast "${known}" has no figure.`);
        const hooks = links.flatMap((f) => (f.extend ? [f.extend] : [])).reverse();
        const extend: FigureExtension | undefined = !hooks.length
          ? undefined
          : hooks.length === 1
            ? hooks[0]
            : (figure) => {
                const parts = hooks.flatMap((hook) => hook(figure) ?? []);
                return {
                  update: (seconds) => parts.forEach((p) => p.update?.(seconds)),
                  setState: (state) => parts.forEach((p) => p.setState?.(state)),
                  dispose: () => parts.forEach((p) => p.dispose?.()),
                };
              };
        cast = createCast(factory.manifest, spec, kit, extend);
      }
      casts.set(known, cast);
      return cast;
    },
  };
  return registry;
}
