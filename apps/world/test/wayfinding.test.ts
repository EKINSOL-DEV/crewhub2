import assert from "node:assert/strict";
import test from "node:test";
import type { Building, Zone } from "@crewhub/world-model";
import {
  BUILDING_SIGN_PX,
  CLOSE_PX,
  crumbs,
  districtsOf,
  HOME,
  homeName,
  isRegion,
  jumpEntries,
  labelDetail,
  levelOf,
  needsOf,
  needsWords,
  searchJumps,
  stepOut,
  summarise,
  summaryWords,
  type Place,
} from "../src/world/wayfinding.ts";
import { agent, building, object } from "./fixtures.ts";

const zone = (id: string, order: number, extra: Partial<Zone> = {}): Zone => ({ id, name: null, order, color: null, emblem: null, look: {}, source: "group", ...extra });
const inZone = (b: Building, zoneId: string, name = b.slug): Building => ({ ...b, zoneId, name });

const studio = zone("studio", 0, { name: "Studio" }),
  garden = zone("garden", 1, { name: "Garden" }),
  fallback = zone("default", 2, { source: "default" });

const quiet = inZone(building("quiet", [agent("q-dev", "worker")]), "studio", "Quiet Works");
const asking = inZone(
  building(
    "asking",
    [agent("a-dev", "worker", { posture: "raised-hand", displayName: "Ada" })],
    [object("1", "review", { waitingOnHuman: true }), object("2", "worker", { stall: { state: "stalled", quietSince: "", quietMinutes: 20, nudges: 1 } }), object("3", "worker", { stall: { state: "attention", quietSince: "", quietMinutes: 12, nudges: 0 } })],
  ),
  "garden",
  "Asking Yard",
);
const loose = inZone(building("loose"), "default", "Loose End");
const model = { zones: [garden, studio, fallback], buildings: [quiet, asking, loose], townHall: [agent("operator", "lead-office", { displayName: "Operator" })], postOffice: [] };

test("districts follow the zone order, and a plan may say where a building really stands", () => {
  const districts = districtsOf(model);
  assert.deepEqual(districts.map((d) => [d.id, d.name, d.buildings.map((b) => b.slug)]), [
    ["studio", "Studio", ["quiet"]],
    ["garden", "Garden", ["asking"]],
    ["default", "Old town", ["loose"]],
  ]);
  assert.equal(isRegion(districts), true);
  // A regrouped building stays in the district it stands in.
  const stands = districtsOf(model, (slug) => (slug === "loose" ? "garden" : undefined));
  assert.deepEqual(stands.map((d) => d.buildings.map((b) => b.slug)), [["quiet"], ["asking", "loose"]]);
});

test("one settlement has no district level and is called the town", () => {
  const districts = districtsOf({ zones: [fallback], buildings: [loose] });
  assert.equal(isRegion(districts), false);
  assert.equal(districts[0]!.name, "The town");
  assert.equal(homeName(districts), "Town");
  assert.equal(homeName(districtsOf(model)), "Region");
  assert.equal(jumpEntries({ ...model, zones: [fallback], buildings: [loose] }, districts).some((e) => e.kind === "zone"), false);
});

test("the Escape chain runs room, building, district, home", () => {
  let place: Place | null = { district: "garden", building: "asking", room: "review" };
  const levels: string[] = [];
  while (place) {
    levels.push(levelOf(place));
    place = stepOut(place);
  }
  assert.deepEqual(levels, ["room", "building", "district", "region"]);
  // Without districts a building steps straight out to the home view.
  assert.deepEqual(stepOut({ district: null, building: "asking", room: null }), HOME);
  assert.equal(stepOut(HOME), null);
});

test("the breadcrumb names every level and only the last crumb is current", () => {
  const trail = crumbs({ district: "garden", building: "asking", room: "review" }, { home: "Region", district: "Garden", building: "Asking Yard", room: "Review" });
  assert.deepEqual(trail.map((c) => [c.level, c.label, c.to === null]), [
    ["region", "Region", false],
    ["district", "Garden", false],
    ["building", "Asking Yard", false],
    ["room", "Review", true],
  ]);
  assert.deepEqual(trail[1]!.to, { district: "garden", building: null, room: null });
  assert.deepEqual(crumbs(HOME, { home: "Town", district: null, building: null, room: null }).map((c) => [c.label, c.to]), [["Town", null]]);
});

test("a beacon lights for waiting on a person, attention and stalled; an archived building asks for nobody", () => {
  assert.deepEqual(needsOf(asking), { waiting: 1, attention: 1, stalled: 1 });
  assert.deepEqual(needsOf({ ...asking, archived: true }), { waiting: 0, attention: 0, stalled: 0 });
  assert.equal(needsWords(needsOf(asking)), "1 waiting on a person, 1 needs attention, 1 stalled");
  assert.equal(needsWords(needsOf(quiet)), "");
  const summary = summarise([quiet, asking, { ...loose, archived: true }]);
  assert.equal(summary.buildings, 2);
  assert.equal(summary.agents, 4);
  assert.equal(summary.beacon, true);
  assert.equal(summarise([quiet]).beacon, false);
  assert.match(summaryWords(summary), /^2 buildings, 4 agents \(4 working\)\. .*Needs a person: 1 waiting on a person, 1 needs attention, 1 stalled\.$/);
});

test("the jump list finds zones, projects and agents, and puts what needs a person first", () => {
  const entries = jumpEntries(model, districtsOf(model));
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
  // Nothing typed: the district and building with a beacon and the agent with a raised hand lead.
  assert.deepEqual(searchJumps(entries, "").slice(0, 3).map((e) => e.id), ["zone:garden", "building:asking", "agent:a-dev"]);
  assert.deepEqual(searchJumps(entries, "gar").map((e) => e.id)[0], "zone:garden");
  assert.deepEqual(searchJumps(entries, "ada").map((e) => e.id), ["agent:a-dev"]);
  // A project is found by its key, an agent by its building, and several words narrow.
  assert.equal(searchJumps(entries, "ASKING")[0]!.id, "building:asking");
  assert.deepEqual(searchJumps(entries, "quiet lead").map((e) => e.id), ["agent:quiet-lead"]);
  assert.deepEqual(searchJumps(entries, "zzz"), []);
  assert.equal(searchJumps(entries, "town hall")[0]!.civic, "town-hall");
  // An agent's jump lands in its room, inside its district.
  assert.deepEqual(entries.find((e) => e.id === "agent:a-dev")!.place, { district: "garden", building: "asking", room: "worker" });
  assert.equal(searchJumps(entries, "", 2).length, 2);
});

test("labels step back with distance, and only a region steps back to its districts", () => {
  assert.equal(labelDetail(CLOSE_PX * 2, true), "close");
  assert.equal(labelDetail((BUILDING_SIGN_PX + CLOSE_PX) / 2, true), "buildings");
  assert.equal(labelDetail(BUILDING_SIGN_PX / 2, true), "districts");
  assert.equal(labelDetail(BUILDING_SIGN_PX / 2, false), "buildings");
  // At a threshold the last answer holds.
  assert.equal(labelDetail(BUILDING_SIGN_PX, true, "districts"), "districts");
  assert.equal(labelDetail(BUILDING_SIGN_PX, true, "buildings"), "buildings");
});
