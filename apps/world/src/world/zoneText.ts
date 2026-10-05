/* Zones in words: a zone's label, why a building is in its zone, and the text view's lines about zones. Pure. */
import type { TextLine, Zone } from "@crewhub/world-model";

export const ZONE_COLOR_NAMES: Record<string, string> = { coral: "Coral", tangerine: "Tangerine", circle: "Red", mist: "Mist", ink: "Ink" };
export const ZONE_EMBLEM_NAMES: Record<string, string> = { home: "House", inbox: "Tray", bot: "Robot", spark: "Spark", users: "People", star: "Star", folder: "Folder" };

/** How a zone is called where a name is needed: its own name, else what it is. */
export function zoneLabel(zone: Pick<Zone, "name" | "source">): string {
  return zone.name ?? (zone.source === "default" ? "No zone" : "Unnamed zone");
}

export type ZoneReasonWord = "by hand" | "from its group in crewhub-loops" | "no zone";

/** Why a building is in its zone, from the document's manual assignments and the zone's source. */
export function zoneReason(slug: string, zone: Pick<Zone, "id" | "source">, assignments: Readonly<Record<string, string>> | undefined): ZoneReasonWord {
  if (assignments?.[slug] === zone.id) return "by hand";
  return zone.source === "group" ? "from its group in crewhub-loops" : zone.source === "default" ? "no zone" : "by hand";
}

export interface ZoneFacts {
  zones: readonly Zone[];
  buildings: readonly { slug: string; name: string; zoneId: string }[];
  /** The town document's plots (the district a building stands in) and manual assignments. */
  plots: readonly { slug: string; zoneId?: string }[];
  assignments: Readonly<Record<string, string>> | undefined;
  /** A zone's look in words (season, planting, cast), or "" when it sets none. */
  lookOf: (zone: Zone) => string;
}

/**
 * The text view's lines about zones: nothing while there is only the unnamed default zone, else one line per zone
 * (its buildings, its mark and look, where it comes from) and one per building that stands in another district than
 * the zone it belongs to.
 */
export function describeZones(facts: ZoneFacts): TextLine[] {
  const { zones, buildings } = facts;
  if (zones.length === 1 && zones[0]!.source === "default" && zones[0]!.name === null) return [];
  const lines: TextLine[] = [];
  for (const zone of zones) {
    const inside = buildings.filter((b) => b.zoneId === zone.id);
    const mark = [zone.color && `colour ${ZONE_COLOR_NAMES[zone.color]?.toLowerCase() ?? zone.color}`, zone.emblem && `emblem ${ZONE_EMBLEM_NAMES[zone.emblem]?.toLowerCase() ?? zone.emblem}`].filter(Boolean).join(", ");
    const look = facts.lookOf(zone);
    const from = zone.source === "group" ? "a group in crewhub-loops" : zone.source === "town" ? "made in this town" : "buildings without a zone";
    lines.push({
      section: "Zones",
      text: `${zoneLabel(zone)} (${from}): ${inside.length ? inside.map((b) => b.name).join(", ") : "no buildings"}.${mark ? ` Mark: ${mark}.` : ""}${look ? ` Look: ${look}.` : ""}`,
      kind: zone.source === "group" ? "fact" : "cosmetic",
    });
  }
  for (const building of buildings) {
    const stands = facts.plots.find((p) => p.slug === building.slug);
    if (!stands) continue;
    const district = stands.zoneId ?? "default";
    if (district === building.zoneId) continue;
    const home = zones.find((z) => z.id === building.zoneId),
      here = zones.find((z) => z.id === district);
    if (!home) continue;
    lines.push({
      section: "Zones",
      text: `${building.name} belongs to ${zoneLabel(home)} but stands in ${here ? `the district of ${zoneLabel(here)}` : "another district"}; "Tidy the town" or a move in build mode rehouses it.`,
      kind: "cosmetic",
    });
  }
  return lines;
}
