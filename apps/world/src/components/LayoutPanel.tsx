/* Build mode's layout part: "Tidy the town" and moving a building by hand to another plot or zone. Nothing in the
   town moves by itself (a building keeps its plot when projects come, go or change zone), so these two are the only
   ways a plot changes; each is one edit of the town document, so one undo step. Kit Buttons and Fields only. */
import { useEffect, useMemo, useState } from "react";
import { MapPin, Sparkles } from "lucide-react";
import { DEFAULT_ZONE_ID, zoneById, type Building, type WorldModel, type Zone } from "@crewhub/world-model";
import { setMovingBuilding, useMovingBuilding } from "../state/layoutMove";
import { townRuntime, type TownState } from "../state/town";
import { lotKey, moveEdit, tidyEdit } from "../world/settlement";
import { freeLots, type FreeLot, type TownPlan } from "../world/townPlan";
import { zoneLabel } from "../world/zoneText";
import { Button, Field } from "./primitives";

/** "Plot 7 of Studio", or "Plot 7" in a town with one unnamed district. */
export function plotLabel(lot: Pick<FreeLot, "number" | "zoneId">, zones: readonly Zone[]): string {
  const zone = zoneById(zones, lot.zoneId);
  return zone.name ? `Plot ${lot.number} of ${zone.name}` : `Plot ${lot.number}`;
}

/** Moves a building to a free plot, as one edit; the words say what happened. */
export function moveBuilding(town: TownState, building: Pick<Building, "slug" | "name">, lot: FreeLot, zones: readonly Zone[]): string {
  const edit = moveEdit(town.doc, building.slug, { cell: lot.cell });
  if (!edit) return `${building.name} cannot stand there.`;
  const result = townRuntime().edit(edit);
  return result.ok ? `${building.name} moved to ${plotLabel(lot, zones)}. Undo puts it back.` : result.error;
}

export function BuildLayout({ model, town, plan, inside }: { model: WorldModel; town: TownState; plan: TownPlan; inside: Building | null }) {
  const moving = useMovingBuilding();
  const [picked, setPicked] = useState<string>(inside?.slug ?? model.buildings[0]?.slug ?? "");
  const [said, setSaid] = useState("");
  useEffect(() => {
    if (inside) setPicked(inside.slug);
  }, [inside]);
  // Leaving build mode puts a picked-up building down.
  useEffect(() => () => setMovingBuilding(null), []);
  const building = model.buildings.find((b) => b.slug === picked) ?? model.buildings[0] ?? null;
  const free = useMemo(() => freeLots(plan, town.doc.plots), [plan, town.doc.plots]);
  const plot = building ? town.doc.plots.find((p) => p.slug === building.slug) : undefined;

  const settlers = model.buildings.map((b) => ({ slug: b.slug, zoneId: b.zoneId }));
  const tidy = useMemo(
    () => tidyEdit(town.doc, settlers, model.zones.map((z) => z.id)),
    // The buildings' slugs and zones decide the tidy, not the model object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [town.doc.plots, town.doc.districts, settlers.map((s) => `${s.slug}:${s.zoneId}`).join("|"), model.zones.map((z) => z.id).join("|")],
  );
  const moves = tidy.type === "tidy" ? tidy.plots.filter((lot) => lotKey(lot.cell) !== lotKey(town.doc.plots.find((p) => p.slug === lot.slug)?.cell ?? { x: -1, z: -1 })).length : 0;
  const tidyUp = () => {
    const result = townRuntime().edit(tidy);
    setSaid(result.ok ? `The town is tidied: ${moves} building${moves === 1 ? "" : "s"} moved. Undo puts ${moves === 1 ? "it" : "them"} back.` : result.error);
    setMovingBuilding(null);
  };
  const toZone = (zoneId: string) => {
    if (!building) return;
    const edit = moveEdit(town.doc, building.slug, { zoneId });
    const result = edit ? townRuntime().edit(edit) : { ok: false as const, error: "There is no free plot left." };
    const zone = zoneById(model.zones, zoneId);
    setSaid(result.ok ? `${building.name} moved to ${zone.id === DEFAULT_ZONE_ID && !zone.name ? "the town's own district" : zoneLabel(zone)} and belongs there now. Undo puts it back.` : result.error);
    setMovingBuilding(null);
  };
  const toPlot = (key: string) => {
    const lot = free.find((l) => lotKey(l.cell) === key);
    if (!building || !lot) return;
    setSaid(moveBuilding(town, building, lot, model.zones));
    setMovingBuilding(null);
  };
  // Zones a building can move to: every one that exists, and the town's own district.
  const zones = model.zones.some((z) => z.id === DEFAULT_ZONE_ID) ? model.zones : [...model.zones, zoneById([], DEFAULT_ZONE_ID)];
  const districts = plan.districts.map((d) => ({ district: d, lots: free.filter((l) => l.slot.x === d.slot.x && l.slot.z === d.slot.z) })).filter((d) => d.lots.length);

  return (
    <section className="build-zones build-layout" aria-labelledby="build-layout-title">
      <h3 className="label" id="build-layout-title">
        Layout
      </h3>
      <p className="hint">A building keeps its plot, whatever joins, leaves or changes zone. Only you move one.</p>
      {building && (
        <>
          <Field control="select" size="sm" label="Building" value={building.slug} onChange={(e) => { setPicked(e.currentTarget.value); setMovingBuilding(null); }}>
            {model.buildings.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
                {b.archived ? " (archived)" : ""}
              </option>
            ))}
          </Field>
          <Field
            control="select"
            size="sm"
            label="Move to a plot"
            value=""
            disabled={!plot || !free.length}
            onChange={(e) => toPlot(e.currentTarget.value)}
            hint={plot ? "Free plots of the districts in use; the building's zone stays as it is." : "This building gets its plot in a moment."}
          >
            <option value="">Choose a free plot…</option>
            {districts.map(({ district, lots }) => (
              <optgroup key={`${district.slot.x},${district.slot.z}`} label={districtLabel(zoneById(model.zones, district.zoneId), district.central)}>
                {lots.map((lot) => (
                  <option key={lotKey(lot.cell)} value={lotKey(lot.cell)}>
                    Plot {lot.number}
                    {lot.next ? " (next free)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </Field>
          <Field control="select" size="sm" label="Move to a zone" value="" disabled={!plot} onChange={(e) => e.currentTarget.value && toZone(e.currentTarget.value)} hint="Takes the zone's next free plot, and the building belongs to that zone from then on.">
            <option value="">Choose a zone…</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.id === DEFAULT_ZONE_ID && !zone.name ? "No zone (the town's own district)" : zoneLabel(zone)}
              </option>
            ))}
          </Field>
          <div className="build-actions">
            <Button
              size="sm"
              icon={<MapPin className="icon" aria-hidden="true" />}
              pressed={moving === building.slug}
              disabled={!plot || !free.length || !!inside}
              title={inside ? "Leave the building to see the town's plots" : undefined}
              onClick={() => setMovingBuilding(moving === building.slug ? null : building.slug)}
            >
              {moving === building.slug ? "Stop showing plots" : "Show free plots in the town"}
            </Button>
          </div>
        </>
      )}
      <div className="build-actions">
        <Button size="sm" icon={<Sparkles className="icon" aria-hidden="true" />} disabled={!moves} onClick={tidyUp}>
          Tidy the town
        </Button>
      </div>
      <p className="hint">
        {moves
          ? `Tidying re-lays every building by today's rules, each zone's buildings together in order: ${moves} would move. One undo step.`
          : "The town is tidy: every building stands where the rules would put it today."}
      </p>
      {said && (
        <p className="hint" role="status" aria-live="polite">
          {said}
        </p>
      )}
    </section>
  );
}

function districtLabel(zone: Zone, central: boolean): string {
  const name = zone.name ?? (central ? "The town" : "Unnamed district");
  return central && zone.name ? `${name} (the centre)` : name;
}
