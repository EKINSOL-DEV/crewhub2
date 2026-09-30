/* The one seam between the world's data and its presentation. Everything else in apps/world reads the WorldModel
   contract only (packages/world-model). Tonight the body returns the static fixture; the Dev Lead replaces it with
   the scripted source (projection, reducer and text), keeping this signature. */
import { useState } from "react";
import type { PlaybackControls, TextLine, WorldModel } from "@crewhub/world-model";
import { countsLine, laneWords } from "../world/townLayout";
import { fixturePlayback, fixtureWorld, FIXTURE_STALE } from "./fixtureWorld";

export interface WorldState {
  model: WorldModel;
  text: TextLine[];
  playback: PlaybackControls | null;
}

export function useWorld(): WorldState {
  const [state] = useState<WorldState>(() => {
    const stale = FIXTURE_STALE || (typeof location !== "undefined" && new URLSearchParams(location.search).has("stale"));
    const model = fixtureWorld(stale);
    return { model, text: textLines(model), playback: fixturePlayback() };
  });
  return state;
}

/** A trivial text rendering of the model for the first light; the real source brings its own. */
function textLines(model: WorldModel): TextLine[] {
  const lines: TextLine[] = [];
  const town = "Town";
  if (model.mode === "demo") lines.push({ section: town, text: "Demo: scripted data. Nothing here is a running session.", kind: "demo" });
  const buildingName = new Map(model.buildings.map((b) => [b.slug, b.name]));
  lines.push({
    section: town,
    text: model.freshness.stale ? `Team snapshot: ${laneWords("unknown", model.freshness)}; every lane shows as unknown.` : `Team snapshot is ${model.freshness.ageSeconds ?? "?"} s old.`,
    kind: "fact",
  });
  lines.push({ section: town, text: `${model.buildings.length} buildings, ${model.buildings.filter((b) => b.archived).length} archived.`, kind: "fact" });
  const who = (list: WorldModel["townHall"]) => list.map((a) => `${a.displayName} (${laneWords(a.laneStatus, model.freshness)})`).join(", ");
  lines.push({ section: town, text: model.townHall.length ? `Town hall: ${who(model.townHall)}.` : "Town hall: nobody.", kind: "fact" });
  lines.push({ section: town, text: model.postOffice.length ? `Post office: ${who(model.postOffice)}.` : "Post office: the postman is out.", kind: "fact" });
  for (const b of model.buildings) {
    const section = `${b.name} (${b.key})`;
    if (b.archived) lines.push({ section, text: "Archived: the building is boarded up.", kind: "fact" });
    lines.push({ section, text: `Tickets: ${countsLine(b.counts)}.`, kind: "fact" });
    const lead = b.agents.find((a) => a.key === b.lead.id);
    lines.push({ section, text: `Lead: ${b.lead.displayName}${lead ? `, ${laneWords(lead.laneStatus, model.freshness)}` : ", not in the building"}.`, kind: "fact" });
    for (const a of b.agents) {
      if (a.key === b.lead.id) continue;
      if (a.presence === "proxy") {
        const where = a.workingIn ? (buildingName.get(a.workingIn) ?? a.workingIn) : "another building";
        lines.push({ section, text: `${a.displayName}: working in ${where}${a.locationInferred ? " (inferred from recent events)" : ""}.`, kind: a.locationInferred ? "inference" : "fact" });
        continue;
      }
      lines.push({ section, text: `${a.displayName}: ${laneWords(a.laneStatus, model.freshness)}.`, kind: "fact" });
      if (a.roleSource === "name-rule") lines.push({ section, text: `${a.displayName} has the ${a.role} role, from its name.`, kind: "inference" });
    }
  }
  return lines;
}
