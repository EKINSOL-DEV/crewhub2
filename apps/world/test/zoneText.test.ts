import assert from "node:assert/strict";
import test from "node:test";
import type { Zone } from "@crewhub/world-model";
import { OFFLINE_ONE_TAB, ZONES_BY_HAND, describeZones, townKeeping, townKeepingWords, zoneLabel, zoneReason, zonesOriginWords } from "../src/world/zoneText.ts";

const zone = (id: string, source: Zone["source"], extra: Partial<Zone> = {}): Zone => ({ id, name: null, order: 0, color: null, emblem: null, look: {}, source, ...extra });

test("a town with only the unnamed default zone says nothing about zones", () => {
  assert.deepEqual(describeZones({ zones: [zone("default", "default")], buildings: [{ slug: "cr", name: "CrewHub", zoneId: "default" }], plots: [], assignments: undefined, lookOf: () => "" }), []);
});

test("one line per zone with its buildings, mark, look and origin; one per building standing in another district", () => {
  const zones = [
    zone("studio", "group", { name: "Studio", color: "mist", emblem: "star" }),
    zone("garden", "town", { name: "Garden", look: { castId: "sprouts" } }),
    zone("default", "default"),
  ];
  const lines = describeZones({
    zones,
    buildings: [
      { slug: "cr", name: "CrewHub", zoneId: "studio" },
      { slug: "ops", name: "Ops", zoneId: "garden" },
      { slug: "lab", name: "Lab", zoneId: "default" },
    ],
    plots: [{ slug: "cr", zoneId: "studio" }, { slug: "ops" }, { slug: "lab" }],
    assignments: { ops: "garden" },
    lookOf: (z) => (z.look.castId ? "Sprouts" : ""),
  });
  assert.deepEqual(
    lines.map((l) => [l.kind, l.text]),
    [
      ["fact", "Studio (a group in crewhub-loops): CrewHub. Mark: colour mist, emblem star."],
      ["cosmetic", "Garden (made in this town): Ops. Look: Sprouts."],
      ["cosmetic", "No zone (buildings without a zone): Lab."],
      ["cosmetic", 'Ops belongs to Garden but stands in the district of No zone; "Tidy the town" or a move in build mode rehouses it.'],
    ],
  );
});

test("labels and reasons", () => {
  assert.equal(zoneLabel(zone("default", "default")), "No zone");
  assert.equal(zoneLabel(zone("z", "town")), "Unnamed zone");
  assert.equal(zoneReason("cr", zone("studio", "group"), {}), "from its group in crewhub-loops");
  assert.equal(zoneReason("cr", zone("studio", "group"), { cr: "studio" }), "by hand");
  assert.equal(zoneReason("cr", zone("default", "default"), undefined), "no zone");
});

test("a live town's hand-made zone is said with the whole truth; a demo's as before; the default-zone case stays silent", () => {
  const zones = [zone("east", "town", { name: "East" }), zone("default", "default")];
  const facts = { zones, buildings: [{ slug: "web", name: "Web", zoneId: "east" }, { slug: "api", name: "API", zoneId: "default" }], plots: [{ slug: "web", zoneId: "east" }, { slug: "api" }], assignments: { web: "east" }, lookOf: () => "" };
  const live = describeZones({ ...facts, mode: "live" }).map((l) => l.text);
  assert.equal(live[0], `East (${ZONES_BY_HAND}): Web.`);
  assert.ok(live[0]!.includes("crewhub-loops has no project groups") && live[0]!.includes("not shared with other browsers"));
  assert.equal(describeZones({ ...facts, mode: "demo" }).map((l) => l.text)[0], "East (made in this town): Web.");
  assert.deepEqual(describeZones({ mode: "live", zones: [zone("default", "default")], buildings: [{ slug: "api", name: "API", zoneId: "default" }], plots: [], assignments: undefined, lookOf: () => "" }), []);
});

test("the Connection panel's Zones line: none yet, or how many were made by hand and where they live", () => {
  const none = zonesOriginWords({ zones: [zone("default", "default")], assignments: undefined });
  assert.ok(none.startsWith("none yet: every building stands in the one district."), none);
  assert.ok(none.includes("crewhub-loops has no project groups") && none.includes("kept in this browser") && none.includes("not shared"));
  const some = zonesOriginWords({ zones: [zone("east", "town"), zone("west", "town"), zone("default", "default")], assignments: { web: "east" } });
  assert.equal(some, `2 zones ${ZONES_BY_HAND} (1 building assigned).`);
  assert.equal(zonesOriginWords({ zones: [zone("east", "town")], assignments: { a: "east", b: "east" } }), `1 zone ${ZONES_BY_HAND} (2 buildings assigned).`);
  // A group zone (the demo's future field) is not hand-made; it never counts here.
  assert.ok(zonesOriginWords({ zones: [zone("studio", "group"), zone("default", "default")], assignments: undefined }).startsWith("none yet"));
});

test("the one-tab rule while the host is away (round 31, question 8): one sentence, wherever the offline keeping words show, and nowhere else", () => {
  assert.equal(OFFLINE_ONE_TAB, "One tab edits while the host is away: two tabs of this browser would mix one local history.");
  assert.equal((OFFLINE_ONE_TAB.match(/\. /g) ?? []).length, 0, "one sentence");
  // Settings > Town, the Connection panel's Town row and the text view: the keeping words.
  assert.equal(townKeepingWords("offline"), `Kept in this browser until the host is back. ${OFFLINE_ONE_TAB}`);
  assert.equal(townKeeping("indexeddb", "live"), "offline", "a live town in IndexedDB is the offline case");
  assert.ok(!townKeepingWords("host").includes("One tab"), "the host keeps the town: the host's history rules, no rule to say");
  assert.ok(!townKeepingWords("browser").includes("One tab"), "the demo's town: no host to be away");
  // Build mode's zones line (the Zone panel's "Zones here"), none yet and some.
  const none = zonesOriginWords({ zones: [zone("default", "default")], assignments: undefined, kept: "offline" });
  assert.ok(none.startsWith("none yet: every building stands in the one district.") && none.endsWith(`in build mode and kept in this browser until the host is back. ${OFFLINE_ONE_TAB}`), none);
  const some = zonesOriginWords({ zones: [zone("east", "town"), zone("default", "default")], assignments: { web: "east" }, kept: "offline" });
  assert.equal(some, `1 zone made by hand, kept in this browser until the host is back; crewhub-loops has no project groups (1 building assigned). ${OFFLINE_ONE_TAB}`);
  assert.ok(!zonesOriginWords({ zones: [zone("east", "town"), zone("default", "default")], assignments: { web: "east" }, kept: "host" }).includes("One tab"));
  assert.ok(!zonesOriginWords({ zones: [zone("default", "default")], assignments: undefined, kept: "browser" }).includes("One tab"));
});

test("the one-tab rule is said once per place (round 39): the Connection panel's Town row carries it, its Zones row does not; the text view's Town document line carries it, its zone lines do not", () => {
  const count = (text: string) => text.split(OFFLINE_ONE_TAB).length - 1;
  const zones = [zone("east", "town", { name: "East" }), zone("default", "default")];
  // Settings > Town: the keeping words alone.
  assert.equal(count(townKeepingWords("offline")), 1);
  // The Connection panel: the Town row (keeping words) then the Zones row (origin words without the rule), none yet and some.
  const panelNone = `${townKeepingWords("offline")} ${zonesOriginWords({ zones: [zone("default", "default")], assignments: undefined, kept: "offline", oneTabRule: false })}`;
  assert.equal(count(panelNone), 1, panelNone);
  const panelSome = `${townKeepingWords("offline")} ${zonesOriginWords({ zones, assignments: { web: "east" }, kept: "offline", oneTabRule: false })}`;
  assert.equal(count(panelSome), 1, panelSome);
  assert.equal(
    zonesOriginWords({ zones, assignments: { web: "east" }, kept: "offline", oneTabRule: false }),
    "1 zone made by hand, kept in this browser until the host is back; crewhub-loops has no project groups (1 building assigned).",
  );
  assert.ok(zonesOriginWords({ zones: [zone("default", "default")], assignments: undefined, kept: "offline", oneTabRule: false }).endsWith("in build mode and kept in this browser until the host is back."));
  // The option changes nothing with the host up or in the demo: there was no rule to drop.
  assert.equal(zonesOriginWords({ zones, assignments: { web: "east" }, kept: "host", oneTabRule: false }), zonesOriginWords({ zones, assignments: { web: "east" }, kept: "host" }));
  assert.equal(zonesOriginWords({ zones, assignments: { web: "east" }, kept: "browser", oneTabRule: false }), zonesOriginWords({ zones, assignments: { web: "east" }, kept: "browser" }));
  // The text view: the Town document line (keeping words) plus every zone line of a live town while the host is away.
  const zoneLines = describeZones({ mode: "live", kept: "offline", zones, buildings: [{ slug: "web", name: "Web", zoneId: "east" }], plots: [{ slug: "web", zoneId: "east" }], assignments: { web: "east" }, lookOf: () => "" });
  assert.equal(count(`${townKeepingWords("offline")} ${zoneLines.map((l) => l.text).join(" ")}`), 1);
  // Build mode's zones line: the only line of its place, so it carries the rule (the default).
  assert.equal(count(zonesOriginWords({ zones, assignments: { web: "east" }, kept: "offline" })), 1);
  assert.equal(count(zonesOriginWords({ zones: [zone("default", "default")], assignments: undefined, kept: "offline" })), 1);
});
