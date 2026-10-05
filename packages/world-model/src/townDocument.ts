/**
 * The town document (`crewhub-town/1`): everything a person built locally, as one versioned JSON document. Plots,
 * placements of catalogue props, the user props themselves (with provenance) and the rule-prop toggles. It is the
 * unit of storage, undo, export and import. Pure: no DOM, no storage; `apps/world/src/state/townStore.ts` persists it.
 *
 * Every edit goes through `applyEdit`, which never mutates and returns a document with `revision + 1`. Grid rules
 * (overlap, reachability) are not checked here: the room grid belongs to the renderer, so build mode validates a
 * placement with the engine (`catalogue.ts` `roomLayout` + `WorldSimulation.placement`) before it applies the edit.
 * This module keeps the document itself consistent: known styles, known props, unique ids.
 */
import { PROP_ID_PATTERN, validatePropModel } from "@crewhub/world-engine";
import type { PropModel, PropValidation, Rotation } from "@crewhub/world-engine";
import type { ProjectColor, ProjectIcon, RoomKind } from "./model.ts";

export const TOWN_FORMAT = "crewhub-town/1";
export const DEFAULT_STYLE_ID = "greenhouse";
/** The zone of every project that no assignment and no group puts elsewhere. It is never stored in `zones`. */
export const DEFAULT_ZONE_ID = "default";

/** Rule props: attachments made from facts (plan 6.3), each switchable in the rules table. */
export const RULE_IDS = ["milestone-banner", "release-crate", "deploy-sticker", "bug-jar", "release-trophy"] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const ROOM_KINDS: readonly RoomKind[] = [
  "lobby",
  "lead-office",
  "workers",
  "analyst",
  "design",
  "storage",
  "planning",
  "review",
  "dispatch",
  "meeting",
];
export const ATTACHMENT_KINDS = ["room", "agent", "ticket", "project"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Cells are room-grid (or town-grid) coordinates; the engine caps a grid at 128. */
export const TOWN_LIMITS = { cellMax: 127, plotsMax: 256, placementsMax: 2000, userPropsMax: 200, zonesMax: 32, districtsMax: 64, slotMax: 8 } as const;
export const ZONE_COLORS: readonly ProjectColor[] = ["coral", "tangerine", "circle", "mist", "ink"];
export const ZONE_EMBLEMS: readonly ProjectIcon[] = ["home", "inbox", "bot", "spark", "users", "star", "folder"];

export interface GridCell {
  x: number;
  z: number;
}
export interface Plot {
  /** The loops project slug the plot holds. */
  slug: string;
  /** The lot the building stands on: a coordinate on the town's lot lattice, the centre lot at `{ x: 64, z: 64 }`. */
  cell: GridCell;
  /** The zone whose district the lot was allocated in; absent means the default zone. */
  zoneId?: string;
  /** Per-plot style; absent means the town default. No UI yet. */
  styleId?: string;
  /** Per-plot cast (the figures that stand for this building's agents); absent means the town's. No UI yet. */
  castId?: string;
}
export type PlacementSite = { building: string; room: RoomKind } | { town: true };
export interface Attachment {
  kind: AttachmentKind;
  /** A loops id: room id (`slug:kind`), agent key, ticket key or project slug. */
  ref: string;
}
export interface PlacedProp {
  /** Stable instance id (a UUID), never `(propId, x, z)`. */
  id: string;
  /** Catalogue id: `builtin:desk` or `user:<slug>`. */
  propId: string;
  at: PlacementSite;
  /** The footprint's first cell on the site's grid. */
  cell: GridCell;
  rotation: Rotation;
  attachment?: Attachment;
}
/** A zone's look, most specific first in the resolution: building, zone, viewer, town, style. All optional. */
export interface TownZoneLook {
  styleId?: string;
  /** Style options by name (season, planting, ...); a style ignores the ones it does not know. */
  styleOptions?: Record<string, string>;
  castId?: string;
}
/** A zone the town defines itself (build mode), or the town's overrides for a zone that comes from a group. */
export interface TownZone {
  id: string;
  name: string | null;
  order: number;
  color: ProjectColor | null;
  emblem: ProjectIcon | null;
  look: TownZoneLook;
}
/** A district's place on the coarse lattice of district cells; `{ x: 0, z: 0 }` is the central district. */
export interface DistrictSlot {
  x: number;
  z: number;
}
/** A slot a zone's district stands on. A zone that outgrows its slot gets a further entry; the order is the growth order. */
export interface District {
  zoneId: string;
  slot: DistrictSlot;
}
/** A plot as the layout edits write it: where a project stands and in whose district. */
export interface PlotLot {
  slug: string;
  cell: GridCell;
  zoneId?: string;
}
export interface TownDocument {
  format: typeof TOWN_FORMAT;
  revision: number;
  styleId: string;
  /**
   * The town's cast; absent means the viewer's choice, else the style's default. An id is not checked against the
   * casts this viewer has: an unknown one falls back, with a note in the text view.
   */
  castId?: string;
  plots: Plot[];
  /** The zones the town defines or overrides, in no particular order (`order` sorts them). Absent means none. */
  zones?: TownZone[];
  /** Manual zone assignments, project slug to zone id; they win over a group from the source. Absent means none. */
  assignments?: Record<string, string>;
  /** Where each zone's district stands, in the order the slots were given out. Absent means none yet. */
  districts?: District[];
  placements: PlacedProp[];
  /** Always with provenance: `{kind: "ticket", ticketKey}` or `{kind: "local"}`. */
  userProps: PropModel[];
  rules: Record<RuleId, boolean>;
}

export interface TownIssue {
  path: string;
  message: string;
}
export type TownValidation = { ok: true; value: TownDocument } | { ok: false; errors: TownIssue[] };

/** What the document is checked against: the registered styles and the props the app ships. */
export interface TownContext {
  knownStyles: readonly string[];
  /** Namespaced ids of the shipped props (`builtin:desk`, ...), from `catalogue.ts` `builtinIds`. */
  builtinIds: readonly string[];
  /** Defaults to world-engine's `validatePropModel`, the same code as the prop:validate CLI. */
  validateProp?: (value: unknown) => PropValidation;
}

export type TownEdit =
  | { type: "place"; placement: PlacedProp }
  | { type: "move"; id: string; at?: PlacementSite; cell: GridCell }
  | { type: "rotate"; id: string; rotation: Rotation }
  | { type: "attach"; id: string; attachment: Attachment | null }
  | { type: "delete"; id: string }
  /** Adds a user prop, or replaces the one with the same id (placements keep pointing at it). */
  | { type: "add-user-prop"; prop: PropModel }
  /** Removes a user prop and every placement of it. */
  | { type: "remove-user-prop"; propId: string }
  | { type: "set-rule"; rule: RuleId; on: boolean }
  /** Adds or moves a plot; `cell: null` removes it. */
  | { type: "set-plot"; slug: string; cell: GridCell | null; styleId?: string; castId?: string }
  /** The town's cast; null goes back to the viewer's choice and the style's default. */
  | { type: "set-cast"; castId: string | null }
  /**
   * Gives projects that have no plot yet their lot, and zones that have no district yet their slot. The lots come from
   * the layout (`apps/world/src/world/settlement.ts` `allocationEdit`); a project that already has a plot is an error.
   */
  | { type: "allocate"; plots: PlotLot[]; districts?: District[] }
  /**
   * "Tidy the town": every plot and district re-laid by the current rules, as one revision (one undo step). Plots
   * keep their style and cast; a plot that is not listed is dropped.
   */
  | { type: "tidy"; plots: PlotLot[]; districts: District[] }
  /**
   * Moves a building by hand to a free lot. With `zoneId` it also joins that zone: the plot's district and the manual
   * assignment both change. `districts` are slots the move had to open (a zone's first building).
   */
  | { type: "move-plot"; slug: string; cell: GridCell; zoneId?: string; districts?: District[] }
  /** A manual zone assignment; null removes it, so the group or the default zone decides again. The plot stays put. */
  | { type: "assign"; slug: string; zoneId: string | null }
  /** Adds a zone, or replaces the one with the same id. */
  | { type: "set-zone"; zone: TownZone }
  /** Removes a zone and the manual assignments to it. Buildings and districts stay where they stand. */
  | { type: "remove-zone"; id: string };

export type EditResult = { ok: true; doc: TownDocument } | { ok: false; error: string };
export type ImportResult = { ok: true; doc: TownDocument } | { ok: false; error: string; doc: TownDocument };

export function emptyTownDocument(styleId: string = DEFAULT_STYLE_ID): TownDocument {
  return {
    format: TOWN_FORMAT,
    revision: 0,
    styleId,
    plots: [],
    placements: [],
    userProps: [],
    rules: Object.fromEntries(RULE_IDS.map((rule) => [rule, true])) as Record<RuleId, boolean>,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REF_MAX = 128;
/** Zone ids are the town's own slugs or a source's group ids, so they are looser than a slug. */
const ZONE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;
const OPTION_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DOC_KEYS = ["format", "revision", "styleId", "plots", "placements", "userProps", "rules"] as const;
/** Additive keys of `crewhub-town/1`: a document without them is as valid as before. */
const OPTIONAL_DOC_KEYS = ["castId", "zones", "assignments", "districts"] as const;
const PLOT_KEYS = ["slug", "cell", "zoneId", "styleId", "castId"] as const;
const ZONE_KEYS = ["id", "name", "order", "color", "emblem", "look"] as const;
const PLACEMENT_KEYS = ["id", "propId", "at", "cell", "rotation", "attachment"] as const;

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const at = (base: string, key: string | number) => (typeof key === "number" ? `${base}[${key}]` : `${base}.${key}`);

/** One readable line per issue, as `placements[2].propId: unknown prop "user:lamp"`. */
export function formatTownIssue(issue: TownIssue): string {
  return `${issue.path}: ${issue.message}`;
}

/**
 * Strict validation of a town document from storage or an import. Unknown keys are errors, every user prop goes
 * through the prop validator (its paths prefixed, as `userProps[0].parts[1].size[0]`), and every reference must
 * resolve: styles, props, unique ids.
 */
export function validateTownDocument(value: unknown, context: TownContext): TownValidation {
  const errors: TownIssue[] = [];
  const error = (path: string, message: string) => errors.push({ path: path || "(root)", message });
  const validateProp = context.validateProp ?? validatePropModel;
  const unknownKeys = (obj: Obj, allowed: readonly string[], path: string) => {
    for (const key of Object.keys(obj))
      if (!allowed.includes(key)) error(path ? at(path, key) : key, `unknown key (allowed: ${allowed.join(", ")})`);
  };
  const cell = (v: unknown, path: string) => {
    if (!isObject(v)) return error(path, "must be an object { x, z }");
    unknownKeys(v, ["x", "z"], path);
    for (const axis of ["x", "z"] as const) {
      const n = v[axis];
      if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > TOWN_LIMITS.cellMax)
        error(at(path, axis), `must be an integer from 0 to ${TOWN_LIMITS.cellMax}`);
    }
  };
  const style = (v: unknown, path: string) => {
    if (typeof v !== "string" || !context.knownStyles.includes(v))
      error(path, `unknown style ${JSON.stringify(v)} (known: ${context.knownStyles.join(", ")})`);
  };
  // A cast id only has to be well-formed: which casts exist is the viewer's registry's to say.
  const cast = (v: unknown, path: string) => {
    if (typeof v !== "string" || v.length > REF_MAX || !SLUG_PATTERN.test(v)) error(path, "must be a cast id (lowercase letters, digits and dashes)");
  };
  const array = (v: unknown, path: string, max: number): v is unknown[] => {
    if (!Array.isArray(v)) {
      error(path, "must be an array");
      return false;
    }
    if (v.length > max) error(path, `must have at most ${max} entries`);
    return true;
  };

  if (!isObject(value)) return { ok: false, errors: [{ path: "(root)", message: "a town document must be a JSON object" }] };
  unknownKeys(value, [...DOC_KEYS, ...OPTIONAL_DOC_KEYS], "");
  const zoneId = (v: unknown, path: string) => {
    if (typeof v !== "string" || !ZONE_ID_PATTERN.test(v)) error(path, "must be a zone id (letters, digits, and : . _ -)");
  };
  for (const key of DOC_KEYS) if (!(key in value)) error(key, "is required");
  if ("format" in value && value.format !== TOWN_FORMAT) error("format", `must be "${TOWN_FORMAT}"`);
  if ("revision" in value && (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0))
    error("revision", "must be a whole number of at least 0");
  if ("styleId" in value) style(value.styleId, "styleId");
  if ("castId" in value) cast(value.castId, "castId");

  if ("plots" in value && array(value.plots, "plots", TOWN_LIMITS.plotsMax)) {
    const slugs = new Set<string>(),
      cells = new Set<string>();
    value.plots.forEach((plot, i) => {
      const path = at("plots", i);
      if (!isObject(plot)) return error(path, "must be an object");
      unknownKeys(plot, PLOT_KEYS, path);
      if (typeof plot.slug !== "string" || !SLUG_PATTERN.test(plot.slug)) error(at(path, "slug"), "must be a project slug");
      else if (slugs.has(plot.slug)) error(at(path, "slug"), `duplicate plot "${plot.slug}"`);
      else slugs.add(plot.slug);
      if (!("cell" in plot)) error(at(path, "cell"), "is required");
      else {
        const before = errors.length;
        cell(plot.cell, at(path, "cell"));
        const c = plot.cell as GridCell;
        if (errors.length === before) {
          if (cells.has(`${c.x},${c.z}`)) error(at(path, "cell"), `another plot already stands on ${c.x},${c.z}`);
          cells.add(`${c.x},${c.z}`);
        }
      }
      if ("zoneId" in plot) zoneId(plot.zoneId, at(path, "zoneId"));
      if ("styleId" in plot) style(plot.styleId, at(path, "styleId"));
      if ("castId" in plot) cast(plot.castId, at(path, "castId"));
    });
  }

  if ("zones" in value && array(value.zones, "zones", TOWN_LIMITS.zonesMax)) {
    const ids = new Set<string>();
    value.zones.forEach((zone, i) => {
      const path = at("zones", i);
      if (!isObject(zone)) return error(path, "must be an object");
      unknownKeys(zone, ZONE_KEYS, path);
      for (const key of ZONE_KEYS) if (!(key in zone)) error(at(path, key), "is required");
      if ("id" in zone) {
        zoneId(zone.id, at(path, "id"));
        if (ids.has(zone.id as string)) error(at(path, "id"), `duplicate zone "${String(zone.id)}"`);
        ids.add(zone.id as string);
      }
      if ("name" in zone && zone.name !== null && (typeof zone.name !== "string" || zone.name.trim() === "" || zone.name.length > REF_MAX))
        error(at(path, "name"), `must be null or a name of at most ${REF_MAX} characters`);
      if ("order" in zone && !Number.isFinite(zone.order)) error(at(path, "order"), "must be a number");
      if ("color" in zone && zone.color !== null && !ZONE_COLORS.includes(zone.color as ProjectColor))
        error(at(path, "color"), `must be null or one of ${ZONE_COLORS.join(", ")}`);
      if ("emblem" in zone && zone.emblem !== null && !ZONE_EMBLEMS.includes(zone.emblem as ProjectIcon))
        error(at(path, "emblem"), `must be null or one of ${ZONE_EMBLEMS.join(", ")}`);
      if ("look" in zone) {
        const look = zone.look,
          lookPath = at(path, "look");
        if (!isObject(look)) return error(lookPath, "must be an object { styleId?, styleOptions?, castId? }");
        unknownKeys(look, ["styleId", "styleOptions", "castId"], lookPath);
        if ("styleId" in look) style(look.styleId, at(lookPath, "styleId"));
        if ("castId" in look) cast(look.castId, at(lookPath, "castId"));
        if ("styleOptions" in look) {
          const options = look.styleOptions,
            optionsPath = at(lookPath, "styleOptions");
          if (!isObject(options)) return error(optionsPath, "must be an object of option names and values");
          // Which options a style has is the style's to say (it ignores the rest); here they only have to be well-formed.
          for (const [name, option] of Object.entries(options))
            if (!OPTION_PATTERN.test(name) || name.length > REF_MAX || typeof option !== "string" || !OPTION_PATTERN.test(option) || option.length > REF_MAX)
              error(at(optionsPath, name), "an option's name and value must be lowercase letters, digits and dashes");
        }
      }
    });
  }

  if ("assignments" in value) {
    const assignments = value.assignments;
    if (!isObject(assignments)) error("assignments", "must be an object of project slugs and zone ids");
    else {
      if (Object.keys(assignments).length > TOWN_LIMITS.plotsMax) error("assignments", `must have at most ${TOWN_LIMITS.plotsMax} entries`);
      for (const [slug, zone] of Object.entries(assignments)) {
        if (!SLUG_PATTERN.test(slug)) error(at("assignments", slug), "the key must be a project slug");
        else zoneId(zone, at("assignments", slug));
      }
    }
  }

  if ("districts" in value && array(value.districts, "districts", TOWN_LIMITS.districtsMax)) {
    const slots = new Set<string>();
    value.districts.forEach((district, i) => {
      const path = at("districts", i);
      if (!isObject(district)) return error(path, "must be an object { zoneId, slot }");
      unknownKeys(district, ["zoneId", "slot"], path);
      zoneId(district.zoneId, at(path, "zoneId"));
      const slot = district.slot;
      if (!isObject(slot)) return error(at(path, "slot"), "must be an object { x, z }");
      unknownKeys(slot, ["x", "z"], at(path, "slot"));
      const before = errors.length;
      for (const axis of ["x", "z"] as const)
        if (!Number.isInteger(slot[axis]) || Math.abs(slot[axis] as number) > TOWN_LIMITS.slotMax)
          error(at(at(path, "slot"), axis), `must be an integer from ${-TOWN_LIMITS.slotMax} to ${TOWN_LIMITS.slotMax}`);
      if (errors.length !== before) return;
      const key = `${slot.x},${slot.z}`;
      if (slots.has(key)) error(at(path, "slot"), `another district already stands on slot ${key}`);
      slots.add(key);
    });
  }

  const userIds = new Set<string>();
  if ("userProps" in value && array(value.userProps, "userProps", TOWN_LIMITS.userPropsMax)) {
    value.userProps.forEach((prop, i) => {
      const path = at("userProps", i);
      const result = validateProp(prop);
      if (!result.ok) {
        for (const issue of result.errors) error(issue.path === "(root)" ? path : `${path}.${issue.path}`, issue.message);
        return;
      }
      const model = result.value;
      if (!model.id.startsWith("user:")) error(at(path, "id"), 'a user prop id must start with "user:"');
      else if (userIds.has(model.id)) error(at(path, "id"), `duplicate user prop "${model.id}"`);
      else userIds.add(model.id);
      if (!model.provenance) error(at(path, "provenance"), 'is required in the town ({ "kind": "local" } or a ticket key)');
    });
  }

  if ("placements" in value && array(value.placements, "placements", TOWN_LIMITS.placementsMax)) {
    const ids = new Set<string>();
    value.placements.forEach((placement, i) => {
      const path = at("placements", i);
      if (!isObject(placement)) return error(path, "must be an object");
      unknownKeys(placement, PLACEMENT_KEYS, path);
      for (const key of ["id", "propId", "at", "cell", "rotation"]) if (!(key in placement)) error(at(path, key), "is required");
      if ("id" in placement) {
        if (typeof placement.id !== "string" || !UUID_PATTERN.test(placement.id)) error(at(path, "id"), "must be a UUID");
        else if (ids.has(placement.id.toLowerCase())) error(at(path, "id"), `duplicate placement id "${placement.id}"`);
        else ids.add(placement.id.toLowerCase());
      }
      if ("propId" in placement) {
        const known = propKnown(placement.propId, context, userIds);
        if (known !== true) error(at(path, "propId"), known);
      }
      if ("at" in placement) site(placement.at, at(path, "at"));
      if ("cell" in placement) cell(placement.cell, at(path, "cell"));
      if ("rotation" in placement && ![0, 1, 2, 3].includes(placement.rotation as number))
        error(at(path, "rotation"), "must be 0, 1, 2 or 3 (quarter turns)");
      if ("attachment" in placement) attachment(placement.attachment, at(path, "attachment"));
    });
  }

  function site(v: unknown, path: string) {
    if (!isObject(v)) return error(path, 'must be { "building", "room" } or { "town": true }');
    if ("town" in v) {
      unknownKeys(v, ["town"], path);
      if (v.town !== true) error(at(path, "town"), "must be true");
      return;
    }
    unknownKeys(v, ["building", "room"], path);
    if (typeof v.building !== "string" || !SLUG_PATTERN.test(v.building)) error(at(path, "building"), "must be a project slug");
    if (!ROOM_KINDS.includes(v.room as RoomKind)) error(at(path, "room"), `must be one of ${ROOM_KINDS.join(", ")}`);
  }
  function attachment(v: unknown, path: string) {
    if (!isObject(v)) return error(path, "must be an object { kind, ref }");
    unknownKeys(v, ["kind", "ref"], path);
    if (!ATTACHMENT_KINDS.includes(v.kind as AttachmentKind)) error(at(path, "kind"), `must be one of ${ATTACHMENT_KINDS.join(", ")}`);
    if (typeof v.ref !== "string" || v.ref.trim() === "" || v.ref.length > REF_MAX)
      error(at(path, "ref"), `must be a non-empty id of at most ${REF_MAX} characters`);
  }

  if ("rules" in value) {
    const rules = value.rules;
    if (!isObject(rules)) error("rules", "must be an object of rule switches");
    else {
      unknownKeys(rules, RULE_IDS, "rules");
      for (const rule of RULE_IDS) {
        if (!(rule in rules)) error(at("rules", rule), "is required");
        else if (typeof rules[rule] !== "boolean") error(at("rules", rule), "must be true or false");
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: structuredClone(value) as unknown as TownDocument };
}

function propKnown(propId: unknown, context: TownContext, userIds: ReadonlySet<string>): true | string {
  if (typeof propId !== "string" || !PROP_ID_PATTERN.test(propId)) return 'must be "builtin:<slug>" or "user:<slug>"';
  if (propId.startsWith("builtin:") ? context.builtinIds.includes(propId) : userIds.has(propId)) return true;
  return `unknown prop "${propId}"`;
}

const next = (doc: TownDocument, patch: Partial<TownDocument>): EditResult => ({
  ok: true,
  doc: { ...doc, ...patch, revision: doc.revision + 1 },
});

/**
 * Applies one build-mode edit. Never mutates `doc`; the result has `revision + 1`. A rejected edit explains why in
 * one sentence the UI can show.
 */
export function applyEdit(doc: TownDocument, edit: TownEdit, context: TownContext): EditResult {
  const find = (id: string) => doc.placements.find((p) => p.id === id);
  /** Checks a placement against the document by validating a one-placement document. */
  const checkPlacement = (placement: PlacedProp): string | null => {
    const probe = validateTownDocument({ ...doc, placements: [placement] }, context);
    if (probe.ok) return null;
    const issue = probe.errors.find((e) => e.path.startsWith("placements")) ?? probe.errors[0]!;
    return `This placement is invalid: ${formatTownIssue(issue).replace("placements[0].", "")}.`;
  };

  switch (edit.type) {
    case "place": {
      if (find(edit.placement.id)) return { ok: false, error: `A placed prop with id ${edit.placement.id} already exists.` };
      const problem = checkPlacement(edit.placement);
      if (problem) return { ok: false, error: problem };
      return next(doc, { placements: [...doc.placements, structuredClone(edit.placement)] });
    }
    case "move":
    case "rotate":
    case "attach": {
      const current = find(edit.id);
      if (!current) return { ok: false, error: `No placed prop with id ${edit.id}.` };
      const changed: PlacedProp = structuredClone(current);
      if (edit.type === "move") {
        changed.cell = { ...edit.cell };
        if (edit.at) changed.at = structuredClone(edit.at);
      } else if (edit.type === "rotate") changed.rotation = edit.rotation;
      else if (edit.attachment) changed.attachment = { ...edit.attachment };
      else delete changed.attachment;
      const problem = checkPlacement(changed);
      if (problem) return { ok: false, error: problem };
      return next(doc, { placements: doc.placements.map((p) => (p === current ? changed : p)) });
    }
    case "delete":
      if (!find(edit.id)) return { ok: false, error: `No placed prop with id ${edit.id}.` };
      return next(doc, { placements: doc.placements.filter((p) => p.id !== edit.id) });
    case "add-user-prop": {
      const others = doc.userProps.filter((p) => p.id !== edit.prop.id);
      const probe = validateTownDocument({ ...doc, placements: [], userProps: [...others, edit.prop] }, context);
      if (!probe.ok) {
        const issue = probe.errors[0]!;
        const path = issue.path.replace(/^userProps\[\d+\]\.?/, "");
        return { ok: false, error: `This prop cannot be added: ${path ? `${path}: ` : ""}${issue.message}.` };
      }
      const prop = probe.value.userProps.at(-1)!;
      const exists = doc.userProps.some((p) => p.id === prop.id);
      return next(doc, {
        userProps: exists ? doc.userProps.map((p) => (p.id === prop.id ? prop : p)) : [...doc.userProps, prop],
      });
    }
    case "remove-user-prop":
      if (!doc.userProps.some((p) => p.id === edit.propId)) return { ok: false, error: `No user prop ${edit.propId}.` };
      return next(doc, {
        userProps: doc.userProps.filter((p) => p.id !== edit.propId),
        placements: doc.placements.filter((p) => p.propId !== edit.propId),
      });
    case "set-cast": {
      const { castId: _, ...rest } = doc;
      if (edit.castId === null) return next(rest, {});
      if (!SLUG_PATTERN.test(edit.castId) || edit.castId.length > REF_MAX) return { ok: false, error: `${JSON.stringify(edit.castId)} is not a cast id.` };
      return next(doc, { castId: edit.castId });
    }
    case "set-rule":
      if (!RULE_IDS.includes(edit.rule)) return { ok: false, error: `Unknown rule ${edit.rule}.` };
      return next(doc, { rules: { ...doc.rules, [edit.rule]: edit.on } });
    case "set-plot": {
      const others = doc.plots.filter((p) => p.slug !== edit.slug);
      if (edit.cell === null) {
        if (others.length === doc.plots.length) return { ok: false, error: `No plot for ${edit.slug}.` };
        return next(doc, { plots: others });
      }
      const plot: Plot = { slug: edit.slug, cell: { ...edit.cell } };
      const styleId = edit.styleId ?? doc.plots.find((p) => p.slug === edit.slug)?.styleId;
      if (styleId !== undefined) plot.styleId = styleId;
      const castId = edit.castId ?? doc.plots.find((p) => p.slug === edit.slug)?.castId;
      if (castId !== undefined) plot.castId = castId;
      const zone = doc.plots.find((p) => p.slug === edit.slug)?.zoneId;
      if (zone !== undefined) plot.zoneId = zone;
      const plots = doc.plots.some((p) => p.slug === edit.slug)
        ? doc.plots.map((p) => (p.slug === edit.slug ? plot : p))
        : [...doc.plots, plot];
      const probe = validateTownDocument({ ...doc, plots, placements: [] }, context);
      if (!probe.ok) return { ok: false, error: `This plot is invalid: ${formatTownIssue(probe.errors[0]!)}.` };
      return next(doc, { plots });
    }
    case "allocate": {
      const taken = edit.plots.find((lot) => doc.plots.some((p) => p.slug === lot.slug));
      if (taken) return { ok: false, error: `${taken.slug} already has a plot.` };
      return layout({ plots: [...doc.plots, ...edit.plots.map((lot) => plotOf(lot))], districts: [...(doc.districts ?? []), ...(edit.districts ?? [])] });
    }
    case "tidy":
      return layout({ plots: edit.plots.map((lot) => plotOf(lot, doc.plots.find((p) => p.slug === lot.slug))), districts: edit.districts });
    case "move-plot": {
      const current = doc.plots.find((p) => p.slug === edit.slug);
      if (!current) return { ok: false, error: `No plot for ${edit.slug}.` };
      const other = doc.plots.find((p) => p.slug !== edit.slug && p.cell.x === edit.cell.x && p.cell.z === edit.cell.z);
      if (other) return { ok: false, error: `${other.slug} already stands on that plot.` };
      const zone = edit.zoneId ?? current.zoneId;
      const moved = plotOf(zone === undefined ? { slug: edit.slug, cell: edit.cell } : { slug: edit.slug, cell: edit.cell, zoneId: zone }, current);
      const patch: Partial<TownDocument> = {
        plots: doc.plots.map((p) => (p === current ? moved : p)),
        districts: [...(doc.districts ?? []), ...(edit.districts ?? [])],
      };
      if (edit.zoneId !== undefined) patch.assignments = { ...doc.assignments, [edit.slug]: edit.zoneId };
      return layout(patch);
    }
    case "assign": {
      const { [edit.slug]: had, ...others } = doc.assignments ?? {};
      if (edit.zoneId === null) return had === undefined ? { ok: false, error: `${edit.slug} has no manual zone.` } : layout({ assignments: others });
      return layout({ assignments: { ...others, [edit.slug]: edit.zoneId } });
    }
    case "set-zone": {
      const zone = structuredClone(edit.zone);
      const zones = doc.zones ?? [];
      return layout({ zones: zones.some((z) => z.id === zone.id) ? zones.map((z) => (z.id === zone.id ? zone : z)) : [...zones, zone] });
    }
    case "remove-zone": {
      if (!doc.zones?.some((z) => z.id === edit.id)) return { ok: false, error: `No zone ${edit.id}.` };
      return layout({
        zones: doc.zones.filter((z) => z.id !== edit.id),
        assignments: Object.fromEntries(Object.entries(doc.assignments ?? {}).filter(([, zone]) => zone !== edit.id)),
      });
    }
  }

  /** A layout patch (plots, zones, assignments, districts), validated as a whole; empty optional parts are left out. */
  function layout(patch: Partial<TownDocument>): EditResult {
    const merged: TownDocument = { ...doc, ...patch };
    if (merged.zones && !merged.zones.length) delete merged.zones;
    if (merged.districts && !merged.districts.length) delete merged.districts;
    if (merged.assignments && !Object.keys(merged.assignments).length) delete merged.assignments;
    const probe = validateTownDocument({ ...merged, placements: [], userProps: [] }, context);
    if (!probe.ok) return { ok: false, error: `This layout is invalid: ${formatTownIssue(probe.errors[0]!)}.` };
    return { ok: true, doc: { ...merged, revision: doc.revision + 1 } };
  }
}

/** A plot on its lot, keeping the style and cast of the plot it replaces. The default zone is not written down. */
function plotOf(lot: PlotLot, previous?: Plot): Plot {
  const plot: Plot = { slug: lot.slug, cell: { x: lot.cell.x, z: lot.cell.z } };
  if (lot.zoneId !== undefined && lot.zoneId !== DEFAULT_ZONE_ID) plot.zoneId = lot.zoneId;
  if (previous?.styleId !== undefined) plot.styleId = previous.styleId;
  if (previous?.castId !== undefined) plot.castId = previous.castId;
  return plot;
}

/** The export file: the document as pretty JSON, ready to save. */
export function exportTownDocument(doc: TownDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * Imports an exported document. On success the imported town replaces the current one as the next revision
 * (`current.revision + 1`), so history and storage stay monotonic. On failure `doc` is `current`, untouched, and
 * `error` names the first problem (and how many more there are).
 */
export function importTownDocument(json: string, current: TownDocument, context: TownContext): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `The file is not JSON: ${e instanceof Error ? e.message : String(e)}`, doc: current };
  }
  const result = validateTownDocument(parsed, context);
  if (!result.ok) {
    const more = result.errors.length - 1;
    return {
      ok: false,
      error: `The town file is invalid: ${formatTownIssue(result.errors[0]!)}${more ? ` (and ${more} more)` : ""}`,
      doc: current,
    };
  }
  return { ok: true, doc: { ...result.value, revision: current.revision + 1 } };
}

