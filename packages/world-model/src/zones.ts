/**
 * Zones: a level above projects, drawn as the districts of the town. The world owns them until crewhub-loops has
 * groups (proposal L22). Where a building's zone comes from is this one pure resolver, in order:
 *
 *   1. a manual assignment in the town document (build mode);
 *   2. the project's group from the source (`groupOf` in the loops client; none with a real crewhub-loops today);
 *   3. the one default zone.
 *
 * A group is a zone with the group's id. The town document may hold an entry with the same id: it gives that zone
 * its look, and a colour or emblem where the group has none. The group's name and order are facts and stay as sent.
 */
import { groupOf, sortProjectGroups } from "@crewhub/loops-client";
import type { ProjectGroup } from "@crewhub/loops-client";
import type { ProjectColor, ProjectIcon, Zone, ZoneLook } from "./model.ts";

/** The zone every building falls back to. Unnamed unless the town document names it. */
export const DEFAULT_ZONE_ID = "default";

/** A zone as the town document keeps it; the document's schema is a superset of this. */
export interface TownZone {
  id: string;
  name?: string | null;
  order?: number;
  color?: ProjectColor | null;
  emblem?: ProjectIcon | null;
  look?: ZoneLook;
}

/** The part of the town document the resolver reads. */
export interface TownZoning {
  zones?: readonly TownZone[];
  /** Project slug to zone id. */
  assignments?: Readonly<Record<string, string>>;
}

/** The part of a project the resolver reads. */
export interface ZoneProject {
  slug: string;
  groupId?: string | null;
}

/** Why a building is in its zone; build mode and the text view say it. */
export type ZoneReason = "assignment" | "group" | "default";

export interface ZoneResolution {
  /** In order; never empty. The default zone is listed when a building is in it, when the town document dresses it, or when it is the only one. */
  zones: Zone[];
  /** Project slug to zone id, for every project given. */
  zoneOf: Record<string, string>;
  reasonOf: Record<string, ZoneReason>;
}

function lookOf(look: ZoneLook | undefined): ZoneLook {
  const out: ZoneLook = {};
  if (look?.styleId) out.styleId = look.styleId;
  if (look?.castId) out.castId = look.castId;
  if (look?.styleOptions && Object.keys(look.styleOptions).length) out.styleOptions = { ...look.styleOptions };
  return out;
}

const nameOf = (name: string | null | undefined): string | null => (name && name.trim() ? name.trim() : null);

export function resolveZones(
  projects: readonly ZoneProject[],
  groups: readonly ProjectGroup[] = [],
  town: TownZoning = {},
): ZoneResolution {
  const local = new Map<string, TownZone>();
  for (const zone of town.zones ?? []) if (!local.has(zone.id)) local.set(zone.id, zone);

  const zones = new Map<string, Zone>();
  for (const group of sortProjectGroups(groups)) {
    if (zones.has(group.id) || group.id === DEFAULT_ZONE_ID) continue;
    const mine = local.get(group.id);
    zones.set(group.id, {
      id: group.id,
      name: nameOf(group.name),
      order: group.order,
      color: group.color ?? mine?.color ?? null,
      emblem: group.icon ?? mine?.emblem ?? null,
      look: lookOf(mine?.look),
      source: "group",
    });
  }
  let next = Math.max(-1, ...[...zones.values()].map((z) => z.order), ...[...local.values()].map((z) => z.order ?? -1)) + 1;
  for (const zone of local.values()) {
    if (zones.has(zone.id) || zone.id === DEFAULT_ZONE_ID) continue;
    zones.set(zone.id, {
      id: zone.id,
      name: nameOf(zone.name),
      order: zone.order ?? next++,
      color: zone.color ?? null,
      emblem: zone.emblem ?? null,
      look: lookOf(zone.look),
      source: "town",
    });
  }

  const zoneOf: Record<string, string> = {};
  const reasonOf: Record<string, ZoneReason> = {};
  let defaultUsed = false;
  for (const project of projects) {
    const assigned = town.assignments?.[project.slug];
    const group = groupOf(project, groups);
    if (assigned !== undefined && (zones.has(assigned) || assigned === DEFAULT_ZONE_ID)) {
      zoneOf[project.slug] = assigned;
      reasonOf[project.slug] = "assignment";
    } else if (group && zones.has(group.id)) {
      zoneOf[project.slug] = group.id;
      reasonOf[project.slug] = "group";
    } else {
      zoneOf[project.slug] = DEFAULT_ZONE_ID;
      reasonOf[project.slug] = "default";
    }
    if (zoneOf[project.slug] === DEFAULT_ZONE_ID) defaultUsed = true;
  }

  const list = [...zones.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const dressed = local.get(DEFAULT_ZONE_ID);
  if (defaultUsed || dressed || list.length === 0) {
    // The default zone comes last unless the town document gives it a place of its own.
    const zone: Zone = {
      id: DEFAULT_ZONE_ID,
      name: nameOf(dressed?.name),
      order: dressed?.order ?? (list.length ? list[list.length - 1]!.order + 1 : 0),
      color: dressed?.color ?? null,
      emblem: dressed?.emblem ?? null,
      look: lookOf(dressed?.look),
      source: "default",
    };
    const at = dressed?.order === undefined ? -1 : list.findIndex((z) => z.order > zone.order);
    if (at === -1) list.push(zone);
    else list.splice(at, 0, zone);
  }
  return { zones: list, zoneOf, reasonOf };
}

/** The zone of a building in a resolved list; the default zone (always resolvable) when the id is not listed. */
export function zoneById(zones: readonly Zone[], id: string): Zone {
  return (
    zones.find((zone) => zone.id === id) ??
    zones.find((zone) => zone.id === DEFAULT_ZONE_ID) ?? {
      id: DEFAULT_ZONE_ID,
      name: null,
      order: 0,
      color: null,
      emblem: null,
      look: {},
      source: "default",
    }
  );
}

/**
 * The zoning of a town document: its zones and manual assignments, and nothing else. Read by key, so a document
 * written before zones existed (it has neither) gives an empty zoning.
 */
export function zoningOf(doc: object | null | undefined): TownZoning {
  const { zones, assignments } = (doc ?? {}) as TownZoning;
  return { ...(Array.isArray(zones) ? { zones } : {}), ...(assignments && typeof assignments === "object" ? { assignments } : {}) };
}
