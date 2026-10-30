/**
 * The prop catalogue (plan 6.2): one registry with namespaced ids. `builtin:<id>` are the engine definitions the
 * world ships (passed in by the app, today `apps/world/src/world/data.ts` `definitions`); `user:<slug>` are the
 * town document's user props, made locally or imported from a ticket, with their provenance. Pure.
 *
 * Semantics come from the engine record only: `definitionFor` returns the `PropDefinition` (via world-engine's
 * `toPropDefinition` for parts props), so placement blocks exactly the declared footprint and never the parts.
 */
import { PROP_CATEGORIES, WorldSimulation, toPropDefinition } from "@crewhub/world-engine";
import type {
  Cell,
  Definitions,
  GridSpec,
  PropCategory,
  PropDefinition,
  PropModel,
  PropProvenance,
  Rotation,
  WorldLayout,
} from "@crewhub/world-engine";
import type { PlacedProp, PlacementSite, TownDocument } from "./townDocument.ts";

export type CatalogueGroupId = "mine" | PropCategory;

export interface CatalogueEntry {
  /** Namespaced: `builtin:desk`, `user:reading-lamp`. */
  id: string;
  name: string;
  category: PropCategory;
  /** Search tags, without the category. */
  tags: string[];
  source: "builtin" | "user";
  /** Null for built-ins. */
  provenance: PropProvenance | null;
  /** The parts model for user props (the renderer draws it); null for built-ins (a renderer factory draws them). */
  model: PropModel | null;
  /** The engine record, with `id` equal to the catalogue id. */
  definition: PropDefinition;
}

export interface CatalogueGroup {
  id: CatalogueGroupId;
  label: string;
  entries: CatalogueEntry[];
}

export interface Catalogue {
  /** Built-ins first (in the order given), then user props (in document order). */
  readonly entries: readonly CatalogueEntry[];
  get(propId: string): CatalogueEntry | null;
  definitionFor(propId: string): PropDefinition | null;
  /** Every engine record by catalogue id, for world-engine `occupancy`, `validateLayout` and `WorldSimulation`. */
  readonly definitions: Definitions;
  /** "Mine" (user props) first, then one group per category that has entries. */
  groups(): CatalogueGroup[];
}

const GROUP_LABELS: Record<CatalogueGroupId, string> = {
  mine: "Mine",
  work: "Work",
  rest: "Rest",
  gather: "Gather",
  storage: "Storage",
  greenery: "Greenery",
  light: "Light",
  decoration: "Decoration",
};

/** The namespaced ids of the shipped props, for `TownContext.builtinIds`. */
export function builtinIds(builtins: Definitions): string[] {
  return Object.keys(builtins).map((id) => `builtin:${id}`);
}

/** A built-in's category is its first tag that is a category; anything else is decoration. */
function builtinEntry(key: string, def: PropDefinition): CatalogueEntry {
  const category = (def.tags.find((t) => PROP_CATEGORIES.includes(t as PropCategory)) as PropCategory | undefined) ?? "decoration";
  const id = `builtin:${key}`;
  return {
    id,
    name: def.label,
    category,
    tags: def.tags.filter((t) => t !== category),
    source: "builtin",
    provenance: null,
    model: null,
    definition: { ...def, id },
  };
}

function userEntry(model: PropModel): CatalogueEntry {
  return {
    id: model.id,
    name: model.name,
    category: model.category,
    tags: [...model.tags],
    source: "user",
    provenance: model.provenance ?? { kind: "local" },
    model,
    definition: toPropDefinition(model),
  };
}

export function createCatalogue(builtins: Definitions, doc: TownDocument): Catalogue {
  const entries = [
    ...Object.entries(builtins).map(([key, def]) => builtinEntry(key, def)),
    ...doc.userProps.map(userEntry),
  ];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const definitions: Definitions = Object.fromEntries(entries.map((entry) => [entry.id, entry.definition]));
  return {
    entries,
    definitions,
    get: (propId) => byId.get(propId) ?? null,
    definitionFor: (propId) => byId.get(propId)?.definition ?? null,
    groups() {
      const groups: CatalogueGroup[] = [];
      const push = (id: CatalogueGroupId, list: CatalogueEntry[]) => {
        if (list.length) groups.push({ id, label: GROUP_LABELS[id], entries: list });
      };
      push("mine", entries.filter((e) => e.source === "user"));
      for (const category of PROP_CATEGORIES) push(category, entries.filter((e) => e.category === category));
      return groups;
    },
  };
}

export const sameSite = (a: PlacementSite, b: PlacementSite): boolean =>
  "town" in a ? "town" in b : !("town" in b) && a.building === b.building && a.room === b.room;

/**
 * Props attached to a ticket or an agent ride on the work object or sit in a desk's decoration slot: they never take
 * a footprint (plan 6.3), so they are left out of the grid.
 */
export const takesFootprint = (p: PlacedProp): boolean =>
  p.attachment?.kind !== "ticket" && p.attachment?.kind !== "agent";

/**
 * The engine layout of one site: its footprint-taking placements on the grid the renderer uses for that room (or
 * the town), plus any fixed props the room template already has. Feed it to world-engine `validateLayout`,
 * `occupancy` or `WorldSimulation.placement` to check an edit before `applyEdit`. The catalogue's `definitions`
 * cover every placement's `definitionId`.
 */
export function siteLayout(
  doc: TownDocument,
  site: PlacementSite,
  grid: GridSpec,
  entrance: Cell,
  fixed: WorldLayout["props"] = [],
): WorldLayout {
  const placed = doc.placements
    .filter((p) => sameSite(p.at, site) && takesFootprint(p))
    .map((p) => ({ id: p.id, definitionId: p.propId, cell: { ...p.cell }, rotation: p.rotation }));
  return { version: 1, grid: { ...grid }, entrance: { ...entrance }, props: [...fixed, ...placed] };
}

/**
 * The first cell (row by row from the grid's origin) where the engine accepts `propId` with `rotation`: in bounds,
 * no overlap, the entrance and every approach cell still reachable. Null when the site is full or its layout is
 * already invalid. Used to drop an imported prop into a room's storage.
 */
export function findFreeCell(
  layout: WorldLayout,
  definitions: Definitions,
  propId: string,
  rotation: Rotation = 0,
): Cell | null {
  if (!definitions[propId]) return null;
  let simulation: WorldSimulation;
  try {
    simulation = new WorldSimulation(layout, definitions, []);
  } catch {
    return null;
  }
  for (let z = 0; z < layout.grid.depth; z++)
    for (let x = 0; x < layout.grid.width; x++) {
      const probe = { id: "free-cell-probe", definitionId: propId, cell: { x, z }, rotation };
      if (simulation.placement(probe).ok) return { x, z };
    }
  return null;
}
