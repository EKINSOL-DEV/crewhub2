/* Zones in the 2D interface: the "Zones" section of Settings (each zone's name, colour, emblem and look) and build
   mode's zone part (which zone a building belongs to, and that zone's look). Every write is a town document edit
   (`set-zone`, `remove-zone`, `assign`), so it is one undo step and travels with an export. A zone that comes from a
   crewhub-loops group keeps the group's name; its look, and a colour or emblem the group lacks, are kept here. */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DEFAULT_ZONE_ID, ZONE_COLORS, ZONE_EMBLEMS, zoneById, type Building, type TownZone, type WorldModel, type Zone, type ZoneLook } from "@crewhub/world-model";
import { useCast } from "../state/cast";
import { setStyleOption, useStyleOptions } from "../state/styleOptions";
import type { TownState } from "../state/town";
import { townRuntime } from "../state/town";
import { castRegistry } from "../world/cast";
import { resolveLook } from "../world/look";
import { styleRegistry } from "../world/style";
import { buildingLook, lookRegistries, zoneLook, type LookContext } from "../world/worldLook";
import { ZONE_COLOR_NAMES, ZONE_EMBLEM_NAMES, zoneLabel, zoneReason } from "../world/zoneText";
import { Button, Chip, Field } from "./primitives";

/** A style option as the settings show it; the style's manifest declares them (`options`), or none. */
interface ShownOption {
  id: string;
  name: string;
  default: string;
  values: readonly { id: string; name: string }[];
}
export const optionsOf = (styleId: string): readonly ShownOption[] => (styleRegistry.listStyles().find((m) => m.id === styleId) as { options?: readonly ShownOption[] } | undefined)?.options ?? [];

function useLookContext(model: WorldModel, town: TownState): LookContext {
  const cast = useCast();
  const styleOptions = useStyleOptions();
  return { doc: town.doc, zones: model.zones, buildings: model.buildings, viewer: { castId: cast, styleOptions } };
}

/** The document entry of a zone: the one it has, else a fresh one that leaves a group's own facts alone. */
function entryOf(zone: Zone, town: TownState): TownZone {
  const stored = town.doc.zones?.find((z) => z.id === zone.id);
  if (stored) return structuredClone(stored);
  if (zone.source === "town") return { id: zone.id, name: zone.name, order: zone.order, color: zone.color, emblem: zone.emblem, look: structuredClone(zone.look) };
  return { id: zone.id, look: {} };
}

/** A look without its empty parts, so "follow" leaves nothing behind in the document. */
function tidyLook(look: ZoneLook): ZoneLook {
  const out: ZoneLook = {};
  if (look.styleId) out.styleId = look.styleId;
  if (look.castId) out.castId = look.castId;
  const options = Object.fromEntries(Object.entries(look.styleOptions ?? {}).filter(([, value]) => value));
  if (Object.keys(options).length) out.styleOptions = options;
  return out;
}

function useZoneEdits(town: TownState) {
  const [error, setError] = useState<string | null>(null);
  const run = (edit: Parameters<ReturnType<typeof townRuntime>["edit"]>[0]) => {
    const result = townRuntime().edit(edit);
    setError(result.ok ? null : result.error);
    return result.ok;
  };
  return {
    error,
    change: (zone: Zone, patch: Partial<TownZone>) => run({ type: "set-zone", zone: { ...entryOf(zone, town), ...patch } }),
    look: (zone: Zone, patch: ZoneLook) => {
      const entry = entryOf(zone, town);
      return run({ type: "set-zone", zone: { ...entry, look: tidyLook({ ...entry.look, ...patch, styleOptions: { ...entry.look?.styleOptions, ...patch.styleOptions } }) } });
    },
    remove: (zone: Zone) => run({ type: "remove-zone", id: zone.id }),
    add: (zones: readonly Zone[]) => {
      const taken = new Set([...zones.map((z) => z.id), ...(town.doc.zones ?? []).map((z) => z.id)]);
      let n = 1;
      while (taken.has(`zone-${n}`)) n++;
      const order = Math.max(-1, ...zones.filter((z) => z.source !== "default").map((z) => z.order)) + 1;
      return run({ type: "set-zone", zone: { id: `zone-${n}`, name: `Zone ${n}`, order, color: null, emblem: null, look: {} } });
    },
    assign: (slug: string, zoneId: string | null) => run({ type: "assign", slug, zoneId }),
  };
}

/** A zone's look: its cast and one select per option of its style. "Follow" names what it would wear without a choice. */
function ZoneLookFields({ zone, context, edits }: { zone: Zone; context: LookContext; edits: ReturnType<typeof useZoneEdits> }) {
  const worn = zoneLook(context, zone.id);
  // What the district wears when the zone asks for nothing: the viewer's choice, the town's, the style's default.
  const followed = resolveLook({ viewer: context.viewer, town: { styleId: context.doc?.styleId, castId: context.doc?.castId, styleOptions: context.doc?.styleOptions } }, lookRegistries);
  const casts = castRegistry.listCasts();
  const styles = styleRegistry.listStyles();
  const castName = (id: string) => casts.find((m) => m.id === id)?.name ?? id;
  return (
    <div className="zone-look">
      {styles.length > 1 && (
        <Field control="select" size="sm" label="Style" value={zone.look.styleId ?? ""} onChange={(e) => edits.look(zone, { styleId: e.currentTarget.value })}>
          <option value="">Follow the town ({styles.find((m) => m.id === followed.styleId)?.name ?? followed.styleId})</option>
          {styles.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Field>
      )}
      {optionsOf(worn.styleId).map((option) => {
        const name = (id: string) => option.values.find((v) => v.id === id)?.name ?? id;
        return (
          <Field key={option.id} control="select" size="sm" label={option.name} value={zone.look.styleOptions?.[option.id] ?? ""} onChange={(e) => edits.look(zone, { styleOptions: { [option.id]: e.currentTarget.value } })}>
            <option value="">Follow the town ({name(followed.styleOptions[option.id] ?? option.default)})</option>
            {option.values.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
              </option>
            ))}
          </Field>
        );
      })}
      <Field
        control="select"
        size="sm"
        label="Cast"
        value={zone.look.castId && castRegistry.has(zone.look.castId) ? zone.look.castId : ""}
        onChange={(e) => edits.look(zone, { castId: e.currentTarget.value })}
        {...(zone.look.castId && !castRegistry.has(zone.look.castId) ? { hint: `The cast "${zone.look.castId}" is not installed; ${castName(worn.castId)} stand in.` } : {})}
      >
        <option value="">Follow the town ({castName(followed.castId)})</option>
        {casts.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Field>
    </div>
  );
}

/** A zone's name: typed freely, written to the town document when the field is left or Enter is pressed (one undo step). */
function ZoneName({ zone, onCommit }: { zone: Zone; onCommit: (name: string | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const group = zone.source === "group";
  const commit = () => {
    if (draft === null) return;
    const name = draft.trim() || null;
    if (name !== zone.name) onCommit(name);
    setDraft(null);
  };
  return (
    <Field
      size="sm"
      label="Name"
      value={draft ?? zone.name ?? ""}
      maxLength={60}
      placeholder={zone.source === "default" ? "No zone" : "Unnamed zone"}
      disabled={group}
      {...(group ? { hint: "The name of the group in crewhub-loops." } : {})}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

/** A zone's mark in the 2D interface: a dot in its colour (named for those who cannot tell it) and its emblem's name. */
function ZoneChip({ zone }: { zone: Zone }) {
  return (
    <Chip className="zone-chip">
      {zone.color && <span className={`zone-dot zone-dot-${zone.color}`} aria-hidden="true" />}
      {zoneLabel(zone)}
    </Chip>
  );
}

/** Settings: every zone with its name, colour, emblem and look, and a button for a new one. */
export function ZoneSettings({ model, town }: { model: WorldModel; town: TownState }) {
  const context = useLookContext(model, town);
  const edits = useZoneEdits(town);
  return (
    <fieldset className="zone-settings">
      <legend className="label">Zones</legend>
      <p className="hint">
        A zone is a district of the town: a group of buildings with a name, a mark and a look of its own. Zones are kept in this browser's town document, so another person sees their own, until crewhub-loops has project groups. Assign buildings in build mode.
      </p>
      <ul className="zone-list">
        {model.zones.map((zone) => {
          const inside = model.buildings.filter((b) => b.zoneId === zone.id);
          const stored = town.doc.zones?.some((z) => z.id === zone.id) ?? false;
          const group = zone.source === "group";
          return (
            <li key={zone.id} className="zone-item" data-zone-id={zone.id}>
              <div className="zone-head">
                <ZoneChip zone={zone} />
                <span className="sign-muted">
                  {inside.length === 0 ? "no buildings" : inside.length === 1 ? inside[0]!.name : `${inside.length} buildings`}
                  {group ? " · from crewhub-loops" : zone.source === "default" ? " · buildings without a zone" : ""}
                </span>
              </div>
              <div className="zone-fields">
                <ZoneName zone={zone} onCommit={(name) => edits.change(zone, { name })} />
                <Field control="select" size="sm" label="Colour" value={zone.color ?? ""} onChange={(e) => edits.change(zone, { color: (e.currentTarget.value || null) as Zone["color"] })}>
                  <option value="">None</option>
                  {ZONE_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {ZONE_COLOR_NAMES[color]}
                    </option>
                  ))}
                </Field>
                <Field control="select" size="sm" label="Emblem" value={zone.emblem ?? ""} onChange={(e) => edits.change(zone, { emblem: (e.currentTarget.value || null) as Zone["emblem"] })}>
                  <option value="">None</option>
                  {ZONE_EMBLEMS.map((emblem) => (
                    <option key={emblem} value={emblem}>
                      {ZONE_EMBLEM_NAMES[emblem]}
                    </option>
                  ))}
                </Field>
              </div>
              <ZoneLookFields zone={zone} context={context} edits={edits} />
              {stored && (
                <Button size="sm" variant="ghost" icon={<Trash2 className="icon" aria-hidden="true" />} onClick={() => edits.remove(zone)}>
                  {zone.source === "town" ? "Remove this zone" : "Forget this zone's look"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <div>
        <Button size="sm" icon={<Plus className="icon" aria-hidden="true" />} onClick={() => edits.add(model.zones)}>
          Add a zone
        </Button>
      </div>
      {edits.error && (
        <p className="hint zone-error" role="alert">
          {edits.error}
        </p>
      )}
    </fieldset>
  );
}

/** Build mode: the zone of each building (the entered one alone when inside), and the look of that zone. */
export function BuildZones({ model, town, inside }: { model: WorldModel; town: TownState; inside: Building | null }) {
  const context = useLookContext(model, town);
  const edits = useZoneEdits(town);
  const buildings = inside ? [inside] : model.buildings;
  // Zones a building can be put in by hand: every one that exists, and "no zone".
  const choices = model.zones.some((z) => z.id === DEFAULT_ZONE_ID) ? model.zones : [...model.zones, zoneById([], DEFAULT_ZONE_ID)];
  const zone = inside ? zoneById(model.zones, inside.zoneId) : null;
  return (
    <section className="build-zones" aria-labelledby="build-zones-title">
      <h3 className="label" id="build-zones-title">
        Zones
      </h3>
      <ul className="zone-assign">
        {buildings.map((building) => {
          const current = zoneById(model.zones, building.zoneId);
          const manual = town.doc.assignments?.[building.slug];
          const stands = town.doc.plots.find((p) => p.slug === building.slug);
          const elsewhere = stands !== undefined && (stands.zoneId ?? DEFAULT_ZONE_ID) !== building.zoneId;
          const look = buildingLook(context, building.slug);
          return (
            <li key={building.slug} data-building={building.slug}>
              <Field
                control="select"
                size="sm"
                label={`Zone of ${building.name}`}
                value={manual !== undefined && manual === building.zoneId ? manual : ""}
                onChange={(e) => edits.assign(building.slug, e.currentTarget.value || null)}
                hint={
                  <>
                    {current.source === "default" && manual !== current.id ? "In no zone" : `${zoneLabel(current)}, ${zoneReason(building.slug, current, town.doc.assignments)}`}. Wears {castRegistry.listCasts().find((m) => m.id === look.castId)?.name ?? look.castId}.
                    {manual === undefined && " Automatic follows its group in crewhub-loops; without one it is in no zone."}
                    {elsewhere && ` It still stands in another district: "Tidy the town" or a move rehouses it.`}
                  </>
                }
              >
                <option value="">Automatic</option>
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {zoneLabel(choice)}
                  </option>
                ))}
              </Field>
            </li>
          );
        })}
      </ul>
      {zone && (
        <div className="build-zone-look">
          <p className="hint">
            The look of <ZoneChip zone={zone} />, for every building in it:
          </p>
          <ZoneLookFields zone={zone} context={context} edits={edits} />
        </div>
      )}
      <div className="build-actions">
        <Button size="sm" icon={<Plus className="icon" aria-hidden="true" />} onClick={() => edits.add(model.zones)}>
          Add a zone
        </Button>
      </div>
      <p className="hint">Names, colours and emblems of zones are in Settings.</p>
      {edits.error && (
        <p className="hint zone-error" role="alert">
          {edits.error}
        </p>
      )}
    </section>
  );
}

/**
 * Settings, the town's part: one row per option of the town's style. "For me" is the viewer's choice in this browser;
 * "The town" is the town document's, which every zone and viewer follows unless they choose. Nothing is drawn for a
 * style without options.
 */
export function StyleOptionSettings({ town }: { town: TownState }) {
  const viewer = useStyleOptions();
  const [error, setError] = useState<string | null>(null);
  const options = optionsOf(styleRegistry.styleIdFor({ styleId: town.doc.styleId }));
  if (!options.length) return null;
  const setTown = (id: string, value: string) => {
    const next = { ...town.doc.styleOptions };
    if (value) next[id] = value;
    else delete next[id];
    const result = townRuntime().edit({ type: "set-style-options", options: Object.keys(next).length ? next : null });
    setError(result.ok ? null : result.error);
  };
  return (
    <div className="style-options">
      {options.map((option) => {
        const name = (id: string | undefined) => option.values.find((v) => v.id === id)?.name ?? option.values.find((v) => v.id === option.default)?.name ?? option.default;
        const choices = option.values.map((value) => (
          <option key={value.id} value={value.id}>
            {value.name}
          </option>
        ));
        return (
          <div key={option.id} className="zone-fields" data-style-option={option.id}>
            <Field control="select" size="sm" label={`${option.name}, for me`} value={viewer[option.id] ?? ""} onChange={(e) => setStyleOption(option.id, e.currentTarget.value || null)}>
              <option value="">Follow the town ({name(town.doc.styleOptions?.[option.id])})</option>
              {choices}
            </Field>
            <Field control="select" size="sm" label={`${option.name}, the town`} value={town.doc.styleOptions?.[option.id] ?? ""} onChange={(e) => setTown(option.id, e.currentTarget.value)}>
              <option value="">The style's own ({name(option.default)})</option>
              {choices}
            </Field>
          </div>
        );
      })}
      <p className="hint">"For me" is kept in this browser, "the town" in the town document. A zone or a building with a choice of its own keeps it.</p>
      {error && (
        <p className="hint zone-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
