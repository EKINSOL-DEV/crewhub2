/* The text view's lines about casts: the town's cast named once, zones and buildings that wear another, and one note
   for cast ids nobody registered. The order is that of every look (`look.ts`): the building, its zone, the viewer's
   choice, the town, the style's default. Pure; the registry is passed in. */
import type { TextLine } from "@crewhub/world-model";
import type { CastRegistry } from "./castRegistry.ts";

export interface CastFacts {
  /** The viewer's choice in Settings. */
  viewer: string | null;
  /** The town document's cast and its plots' own casts. */
  town: string | null | undefined;
  plots: readonly { slug: string; castId?: string }[];
  /** The style's default cast. */
  style: string | null | undefined;
  /** The zones with their looks, and which zone each building is in; absent means no zone sets a cast. */
  zones?: readonly { id: string; name: string | null; look: { castId?: string } }[];
  buildings?: readonly { slug: string; zoneId: string }[];
}

export function describeCasts(registry: Pick<CastRegistry, "resolve" | "listCasts">, facts: CastFacts): TextLine[] {
  const name = (id: string) => registry.listCasts().find((m) => m.id === id)?.name ?? id;
  const town = registry.resolve({ viewer: facts.viewer, town: facts.town, style: facts.style });
  const unknown = [...town.unknown];
  const note = (ids: string[]) => ids.forEach((id) => void (unknown.includes(id) || unknown.push(id)));
  const lines: TextLine[] = [{ section: "Town", text: `Cast: ${name(town.id)}.`, kind: "cosmetic" }];
  // What each zone's buildings wear unless they name a cast of their own.
  const ofZone = new Map<string, string>();
  for (const zone of facts.zones ?? []) {
    if (!zone.look.castId) continue;
    const own = registry.resolve({ zone: zone.look.castId, viewer: facts.viewer, town: facts.town, style: facts.style });
    note(own.unknown);
    ofZone.set(zone.id, own.id);
    if (own.id !== town.id) lines.push({ section: "Town", text: `Cast of ${zone.name ? `the ${zone.name} zone` : "the unnamed zone"}: ${name(own.id)}.`, kind: "cosmetic" });
  }
  for (const plot of facts.plots) {
    if (!plot.castId) continue;
    const zoneId = facts.buildings?.find((b) => b.slug === plot.slug)?.zoneId;
    const zone = zoneId === undefined ? undefined : facts.zones?.find((z) => z.id === zoneId)?.look.castId;
    const own = registry.resolve({ building: plot.castId, zone, viewer: facts.viewer, town: facts.town, style: facts.style });
    note(own.unknown);
    if (own.id !== ((zoneId !== undefined && ofZone.get(zoneId)) || town.id)) lines.push({ section: "Town", text: `Cast of ${plot.slug}: ${name(own.id)}.`, kind: "cosmetic" });
  }
  if (unknown.length)
    lines.push({
      section: "Town",
      text: `No cast named ${unknown.map((id) => `"${id}"`).join(" or ")} is installed; ${name(town.id)} stand${/s$/.test(name(town.id)) ? "" : "s"} in.`,
      kind: "cosmetic",
    });
  return lines;
}
