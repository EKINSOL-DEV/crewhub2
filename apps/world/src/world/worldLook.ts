/* The looks of this world: `look.ts` bound to the registries and the town document. A building's look is its plot's,
   then its zone's, then the viewer's choice, then the town document's, then the style's default; a district's is the
   same without the building; the town's own (the civic buildings, the postman) starts at the viewer. Renderers and
   the settings ask here, so the order lives in one place. */
import type { TownDocument, Zone } from "@crewhub/world-model";
import { zoneById } from "@crewhub/world-model";
import { castRegistry } from "./cast";
import { resolveLook, type LookLayer, type LookLayers, type LookRegistries, type ResolvedLook } from "./look";
import { styleRegistry } from "./style";

const manifests = () => styleRegistry.listStyles();
export const lookRegistries: LookRegistries = {
  styles: {
    defaultId: styleRegistry.defaultId,
    has: (id) => manifests().some((m) => m.id === id),
    manifest: (id) => manifests().find((m) => m.id === id) ?? {},
  },
  casts: castRegistry,
};

/** Everything a look resolves from, as the scene and the settings have it. */
export interface LookContext {
  doc: TownDocument | null | undefined;
  zones: readonly Zone[];
  buildings: readonly { slug: string; zoneId: string }[];
  /** The viewer's choices in Settings (kept in this browser). */
  viewer: LookLayer;
}

/** The town document's own layer. A document may carry town-wide style options once its schema has them. */
function townLayer(doc: TownDocument | null | undefined): LookLayer {
  return { styleId: doc?.styleId, castId: doc?.castId, styleOptions: (doc as { styleOptions?: Record<string, string> } | null | undefined)?.styleOptions };
}

function layers(context: LookContext, zoneId: string | null, slug: string | null): LookLayers {
  const plot = slug === null ? undefined : (context.doc?.plots.find((p) => p.slug === slug) as (LookLayer & { slug: string }) | undefined);
  return {
    building: plot ? { styleId: plot.styleId, castId: plot.castId, styleOptions: plot.styleOptions } : null,
    zone: zoneId === null ? null : zoneById(context.zones, zoneId).look,
    viewer: context.viewer,
    town: townLayer(context.doc),
  };
}

/** What a building wears. */
export function buildingLook(context: LookContext, slug: string): ResolvedLook {
  const zoneId = context.buildings.find((b) => b.slug === slug)?.zoneId ?? null;
  return resolveLook(layers(context, zoneId, slug), lookRegistries);
}

/** What a district wears: its ground, planting, lanterns and gate. */
export function zoneLook(context: LookContext, zoneId: string): ResolvedLook {
  return resolveLook(layers(context, zoneId, null), lookRegistries);
}

/** What the town itself wears: the civic buildings, the postman, the town hall's agents. */
export function townLook(context: LookContext): ResolvedLook {
  return resolveLook(layers(context, null, null), lookRegistries);
}
