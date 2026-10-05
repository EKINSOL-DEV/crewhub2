import assert from "node:assert/strict";
import test from "node:test";
import type { Zone } from "@crewhub/world-model";
import { describeZones, zoneLabel, zoneReason } from "../src/world/zoneText.ts";

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
