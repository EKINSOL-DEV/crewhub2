/* The town document's part of Settings: the style (from the document; one option tonight), the viewer's graphics
   and day-and-night settings, where the town is kept, export and import of the whole town as JSON, and the rules table that switches
   rule props. An invalid import shows its precise error and changes nothing. */
import { useState, type ChangeEvent } from "react";
import { Download } from "lucide-react";
import { exportTownDocument, RULE_IDS, type RuleId } from "@crewhub/world-model";
import type { GraphicsQuality } from "@crewhub/world-style";
import { QUALITY_CHOICES, setQuality, useQuality } from "../state/quality";
import { setCast, useCast } from "../state/cast";
import { castRegistry } from "../world/cast";
import { setDayNight, useDayNight } from "../state/daynight";
import { setOldQuarter, useOldQuarter } from "../state/oldQuarter";
import { BUILDING_PLAN_PARAM, setBuildingPlan, useBuildingPlan } from "../state/buildingPlan";
import type { BuildingPlan } from "../world/buildingTemplate";
import { useWorld } from "../state/world";
import { setFps, useFps } from "../state/fps";
import type { TownState } from "../state/town";
import { townRuntime } from "../state/town";
import { styleRegistry } from "../world/style";
import { downloadText } from "./download";
import { Button, Field } from "./primitives";
import { StyleOptionSettings, ZoneSettings } from "./ZonePanel";

const RULES: Record<RuleId, { name: string; fact: string }> = {
  "milestone-banner": { name: "Milestone banner", fact: "a banner in the lobby per active milestone" },
  "release-crate": { name: "Release crate", fact: "a crate at Dispatch per draft release" },
  "deploy-sticker": { name: "Rocket sticker", fact: "a rocket on tickets labelled awaiting-deploy" },
  "bug-jar": { name: "Bug jar", fact: "a jar on the lead's desk counting open bugs" },
  "release-trophy": { name: "Release trophy", fact: "a trophy on the lead's desk per published release" },
};

const QUALITY_LABELS: Record<GraphicsQuality, string> = { pretty: "Pretty", fast: "Fast" };

export function TownSettings({ town }: { town: TownState }) {
  const quality = useQuality();
  const { model } = useWorld();
  const dayNight = useDayNight(model.mode);
  const fps = useFps();
  const oldQuarter = useOldQuarter();
  const buildingPlan = useBuildingPlan();
  const [importNote, setImportNote] = useState<{ ok: boolean; text: string } | null>(null);
  const style = styleRegistry.getStyle(town.doc.styleId).manifest;
  const cast = useCast();
  const casts = castRegistry.listCasts();
  // What the town wears when the viewer chooses nothing, and what it wears now.
  const followed = castRegistry.resolve({ town: town.doc.castId, style: style.defaultCast }).id;
  const active = casts.find((m) => m.id === castRegistry.resolve({ viewer: cast, town: town.doc.castId, style: style.defaultCast }).id);

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    const result = townRuntime().importText(await file.text());
    setImportNote(result.ok ? { ok: true, text: `Imported ${file.name}. Undo goes back to the town before it.` } : { ok: false, text: `${file.name} was not imported, nothing changed: ${result.error}` });
  };

  return (
    <>
      <fieldset className="town-settings">
        <legend className="label">Town</legend>
        <p className="settings-style">Style: {style.name}</p>
        <p className="hint">The only style tonight; buildings follow the town style unless their plot names another.</p>
        <Field
          control="select"
          size="sm"
          label="Cast"
          className="cast-setting"
          hint={`${active?.description ?? ""} The figures that stand for agents; a zone or a building with a cast of its own keeps it. Kept in this browser.`}
          value={cast && castRegistry.has(cast) ? cast : ""}
          onChange={(e) => setCast(e.currentTarget.value || null)}
        >
          <option value="">Follow the town ({casts.find((m) => m.id === followed)?.name ?? followed})</option>
          {casts.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Field>
        <StyleOptionSettings town={town} />
        <p className="hint">
          <a href="/cast-preview">Open the casting room</a>: every cast in one sample room, in every role and state.
        </p>
        <Field
          control="select"
          size="sm"
          label="Graphics"
          className="quality-setting"
          hint={quality === "pretty" ? "Soft shadows and warm lamp light. Kept in this browser." : "No shadow maps or lamp glow, for slower computers. Kept in this browser."}
          value={quality}
          onChange={(e) => setQuality(e.currentTarget.value as GraphicsQuality)}
        >
          {QUALITY_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {QUALITY_LABELS[choice]}
            </option>
          ))}
        </Field>
        <Field
          control="select"
          size="sm"
          label="Day and night"
          className="daynight-setting"
          hint={
            dayNight
              ? "The light drifts from morning to dusk and evening with the demo clock. Fast graphics and reduced motion keep it still. Kept in this browser."
              : "The light stays at the theme's own time of day. Kept in this browser."
          }
          value={dayNight ? "on" : "off"}
          onChange={(e) => setDayNight(e.currentTarget.value === "on")}
        >
          <option value="on">Drifts</option>
          <option value="off">Still</option>
        </Field>
        <Field
          control="select"
          size="sm"
          label="Archived buildings"
          className="old-quarter-setting"
          hint={
            oldQuarter
              ? "Archived buildings are folded away into the old quarter, a row of their own behind the town. Their plots stay theirs. Only you see this; kept in this browser."
              : "An archived building keeps its plot, boarded up. Kept in this browser."
          }
          value={oldQuarter ? "on" : "off"}
          onChange={(e) => setOldQuarter(e.currentTarget.value === "on")}
        >
          <option value="off">Stay on their plots</option>
          <option value="on">Fold into the old quarter</option>
        </Field>
        <Field
          control="select"
          size="sm"
          label="Buildings"
          className="building-plan-setting"
          hint={
            buildingPlan === "three-rooms"
              ? `Three rooms per building: Administration with the four racks, the open floor with a desk per agent and the huddle, and the lead's office. Only you see this; kept in this browser. ?${BUILDING_PLAN_PARAM}=three in the address bar picks it for a page.`
              : `The classic building: a room per role, a room per ticket status, a lobby, the lead's office and a meeting room. Kept in this browser. ?${BUILDING_PLAN_PARAM}=classic in the address bar picks it for a page.`
          }
          value={buildingPlan}
          onChange={(e) => setBuildingPlan(e.currentTarget.value as BuildingPlan)}
        >
          <option value="three-rooms">Three rooms</option>
          <option value="classic">Classic, ten rooms</option>
        </Field>
        <Field
          control="checkbox"
          label="Frame rate overlay"
          className="fps-setting"
          hint="Frames per second, frame time, draw calls and memory, in a corner of the town. Key F. Kept in this browser."
          checked={fps}
          onChange={(e) => setFps(e.currentTarget.checked)}
        />
        <p className="hint">
          Layout revision {town.doc.revision}.{" "}
          {town.storage === "indexeddb" ? "Kept in this browser (IndexedDB)." : "Kept in memory only: it is lost on reload."}
          {town.storageNote && ` ${town.storageNote}`}
        </p>
        <div className="town-file">
          <Button size="sm" icon={<Download className="icon" aria-hidden="true" />} onClick={() => downloadText(`crewhub-town-r${town.doc.revision}.json`, exportTownDocument(town.doc))}>
            Export the town
          </Button>
          <Field
            control="file"
            size="sm"
            label="Import a town"
            accept="application/json,.json"
            onChange={(e) => void importFile(e)}
            {...(importNote && !importNote.ok ? { error: importNote.text } : importNote ? { hint: importNote.text } : {})}
          />
        </div>
      </fieldset>
      <ZoneSettings model={model} town={town} />
      <fieldset className="rule-settings">
        <legend className="label">Rule props</legend>
        <p className="hint">Props made from loops facts, labelled "rule" in the scene.</p>
        <table className="rules-table">
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">From the fact</th>
            </tr>
          </thead>
          <tbody>
            {RULE_IDS.map((rule) => (
              <tr key={rule}>
                <td>
                  <Field control="checkbox" label={RULES[rule].name} checked={town.doc.rules[rule]} onChange={(e) => townRuntime().edit({ type: "set-rule", rule, on: e.currentTarget.checked })} />
                </td>
                <td className="sign-muted">{RULES[rule].fact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
    </>
  );
}
