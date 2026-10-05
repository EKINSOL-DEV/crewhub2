/* The text view's lines about casts: the active cast named once, buildings that wear another, and one note for cast
   ids nobody registered. Pure; the registry is passed in. */
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
}

export function describeCasts(registry: Pick<CastRegistry, "resolve" | "listCasts">, facts: CastFacts): TextLine[] {
  const name = (id: string) => registry.listCasts().find((m) => m.id === id)?.name ?? id;
  const town = registry.resolve({ viewer: facts.viewer, town: facts.town, style: facts.style });
  const unknown = [...town.unknown];
  const lines: TextLine[] = [{ section: "Town", text: `Cast: ${name(town.id)}.`, kind: "cosmetic" }];
  for (const plot of facts.plots) {
    if (!plot.castId) continue;
    const own = registry.resolve({ building: plot.castId, viewer: facts.viewer, town: facts.town, style: facts.style });
    for (const id of own.unknown) if (!unknown.includes(id)) unknown.push(id);
    if (own.id !== town.id) lines.push({ section: "Town", text: `Cast of ${plot.slug}: ${name(own.id)}.`, kind: "cosmetic" });
  }
  if (unknown.length)
    lines.push({
      section: "Town",
      text: `No cast named ${unknown.map((id) => `"${id}"`).join(" or ")} is installed; ${name(town.id)} stand${/s$/.test(name(town.id)) ? "" : "s"} in.`,
      kind: "cosmetic",
    });
  return lines;
}
