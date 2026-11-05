/* The text view's content, as one module: which lines it says, in which order, and where each section lands (the town
   first, every building's sections under its district, then the rest). `TextView` in App.tsx renders the structure.
   Pure: the facts in, lines and sections out; the registry and the clock are passed in. */
import { shownRevision } from "./revisionWords.ts";
import { CIVIC_WORDS, describeTownDocument, describeWorld, type Building, type CivicWords, type RuleProp, type TextLine, type WorldModel } from "@crewhub/world-model";
import type { RoomWording } from "./roomWords.ts";
import type { SaidMap } from "../state/said.ts";
import type { TownState } from "../state/town.ts";
import { describeCasts } from "./castText.ts";
import type { CastRegistry } from "./castRegistry.ts";
import { saidLines } from "./saidText.ts";
import { describePlan, type TownPlan } from "./townPlan.ts";
import type { DistrictPlace } from "./wayfinding.ts";
import { describeZones, townKeeping, townKeepingWords } from "./zoneText.ts";

export interface TextViewFacts {
  model: WorldModel;
  /** The source's own words: they stand in for the description while the civic names and the rooms are the defaults. */
  text: readonly TextLine[];
  civic: CivicWords;
  rooms: RoomWording;
  /** The viewer's cast in Settings, and the default of the town's style. */
  viewerCast: string | null;
  styleCast: string | null | undefined;
  casts: Pick<CastRegistry, "resolve" | "listCasts">;
  town: Pick<TownState, "doc" | "catalogue" | "invalid" | "storage" | "storageNote"> & Partial<Pick<TownState, "hostRev">>;
  rules: readonly RuleProp[];
  plan: TownPlan;
  said: SaidMap;
  nowMs: number;
}

/** Every line of the text view, in its order: the world, what is said, casts, zones, the plan, the town document. */
export function textViewLines(facts: TextViewFacts): TextLine[] {
  const { model, civic, rooms, town, casts } = facts;
  const kept = townKeeping(town.storage, model.mode);
  const keeping = townKeepingWords(kept);
  return [
    ...(civic.hall === CIVIC_WORDS.hall && civic.post === CIVIC_WORDS.post && rooms === "classic" ? facts.text : describeWorld(model, civic, { rooms })),
    ...saidLines(model, facts.said, facts.nowMs, civic, rooms),
    ...describeCasts(casts, {
      viewer: facts.viewerCast,
      town: town.doc.castId,
      plots: town.doc.plots,
      style: facts.styleCast,
      zones: model.zones,
      buildings: model.buildings,
    }),
    ...describeZones({
      mode: model.mode,
      kept,
      zones: model.zones,
      buildings: model.buildings,
      plots: town.doc.plots,
      assignments: town.doc.assignments,
      lookOf: (zone) => [...Object.values(zone.look.styleOptions ?? {}), ...(zone.look.castId ? [casts.listCasts().find((m) => m.id === zone.look.castId)?.name ?? zone.look.castId] : [])].join(", "),
    }),
    ...describePlan(facts.plan, (slug) => model.buildings.find((b) => b.slug === slug)?.name ?? slug),
    ...describeTownDocument(town.doc, town.catalogue, { ruleProps: facts.rules, invalidRequests: town.invalid, rooms, revision: shownRevision({ hostRev: town.hostRev ?? null, doc: town.doc }) }),
    ...(model.mode === "live" ? [{ section: "Town document", text: `The town document is ${keeping.charAt(0).toLowerCase()}${keeping.slice(1)}`, kind: "fact" as const }] : []),
    ...(town.storageNote ? [{ section: "Town document", text: town.storageNote, kind: "fact" as const }] : []),
  ];
}

/** One section of the text view: its heading and its lines, in the order they were said. */
export interface TextSection {
  name: string;
  lines: TextLine[];
}

export interface TextViewSections {
  /** The Town section, above the districts. */
  before: TextSection[];
  districts: { district: DistrictPlace; buildings: { building: Building; sections: TextSection[] }[] }[];
  /** Everything no building owns: casts' and zones' sections, the plan, the town document. */
  after: TextSection[];
}

/** Groups the lines into sections and places them: a section belongs to the building it names, `<name> (<key>)` or under it `<name> (<key>): <room>`. */
export function textViewSections(lines: readonly TextLine[], districts: readonly DistrictPlace[]): TextViewSections {
  const sections = new Map<string, TextSection>();
  for (const line of lines) {
    const section = sections.get(line.section);
    if (section) section.lines.push(line);
    else sections.set(line.section, { name: line.section, lines: [line] });
  }
  const all = [...sections.values()];
  const owned = (b: Building) => all.filter((s) => s.name === `${b.name} (${b.key})` || s.name.startsWith(`${b.name} (${b.key}): `));
  const placed = new Set(districts.flatMap((d) => d.buildings.flatMap(owned)));
  return {
    before: all.filter((s) => !placed.has(s) && s.name === "Town"),
    districts: districts.map((district) => ({ district, buildings: district.buildings.map((building) => ({ building, sections: owned(building) })) })),
    after: all.filter((s) => !placed.has(s) && s.name !== "Town"),
  };
}
