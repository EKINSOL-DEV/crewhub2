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

/** Where hand-made zones live, said once and the same everywhere (the text view, the Connection panel, build mode). */
export const ZONES_BY_HAND = "made by hand in this browser; crewhub-loops has no project groups; not shared with other browsers";

/**
 * The Connection panel's "Zones" line of a live town (and build mode's hint): how many zones a person made by hand
 * and how many buildings they put in one, and where that lives. With none, a plain "none yet" that still says what
 * is true: every building stands in the one district until someone makes a zone in build mode.
 */
export function zonesOriginWords(facts: { zones: readonly Pick<Zone, "source">[]; assignments: Readonly<Record<string, string>> | undefined; kept?: TownKeeping }): string {
  const made = facts.zones.filter((z) => z.source === "town").length;
  const assigned = Object.keys(facts.assignments ?? {}).length;
  const kept = facts.kept ?? "browser";
  const where = kept === "host" ? "kept by the world's host for this crewhub-loops and shared by every paired browser" : kept === "offline" ? "kept in this browser until the host is back" : "kept in this browser, not shared with other browsers";
  if (made === 0 && assigned === 0) {
    return `none yet: every building stands in the one district. crewhub-loops has no project groups; districts are made by hand in build mode and ${where}.`;
  }
  const zones = made === 1 ? "1 zone" : `${made} zones`;
  const buildings = assigned === 1 ? "1 building assigned" : `${assigned} buildings assigned`;
  if (kept === "browser") return `${zones} ${ZONES_BY_HAND} (${buildings}).`;
  return `${zones} made by hand, ${where}; crewhub-loops has no project groups (${buildings}).`;
}

/** Where a live town is kept right now: by the host (round 20), in this browser until the host is back, or in this browser only. */
export type TownKeeping = "host" | "offline" | "browser";

/** The keeping words of a live town, from the store's storage: the Settings card, the Connection panel and the text view say the same. */
export function townKeepingWords(kept: TownKeeping): string {
  return kept === "host" ? "Kept by the world's host for this crewhub-loops, shared by every paired browser." : kept === "offline" ? "Kept in this browser until the host is back." : "Kept in this browser (IndexedDB).";
}

/** The text view's zone line of a live town's hand-made zone: `ZONES_BY_HAND` while the browser keeps it, the host's words once the host does. */
export function zonesByHandWords(kept: TownKeeping): string {
  return kept === "host" ? "made by hand, kept by the world's host for this crewhub-loops and shared by every paired browser; crewhub-loops has no project groups" : ZONES_BY_HAND;
}

export interface ZoneFacts {
  /** The source behind the town: a live town's hand-made zones are said with the whole truth (`ZONES_BY_HAND`). */
  mode?: "demo" | "live";
  /** Where a live town is kept (round 20): the host's words when the host keeps it. */
  kept?: TownKeeping;
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
    const from = zone.source === "group" ? "a group in crewhub-loops" : zone.source === "town" ? (facts.mode === "live" ? zonesByHandWords(facts.kept ?? "browser") : "made in this town") : "buildings without a zone";
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

/** The keeping of a town from its store's storage and the source: a demo town is the browser's; a live one is the host's while the host keeps it. */
export function townKeeping(storage: "host" | "indexeddb" | "memory", mode: "demo" | "live"): TownKeeping {
  if (mode !== "live") return "browser";
  return storage === "host" ? "host" : "offline";
}
