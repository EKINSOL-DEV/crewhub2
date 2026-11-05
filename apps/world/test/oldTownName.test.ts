import assert from "node:assert/strict";
import test from "node:test";
import type { Zone } from "@crewhub/world-model";
import { districtsOf } from "../src/world/wayfinding.ts";
import { describeZones, zoneLabel } from "../src/world/zoneText.ts";
import { building } from "./fixtures.ts";

const zone = (id: string, source: Zone["source"], name: string | null = null): Zone => ({ id, name, order: 0, color: null, emblem: null, look: {}, source });

test("w6-5: the buildings without a zone are called by one name everywhere: the region map's district card, the sheet's zone label and the text view's line", () => {
  const fallback = zone("default", "default");
  const harbour = zone("harbour", "town", "Harbour");
  const map = districtsOf({ zones: [harbour, fallback], buildings: [{ ...building("cr"), zoneId: "harbour" }, { ...building("ops"), zoneId: "default" }] });
  const card = map.find((d) => d.id === "default")!.name;
  assert.equal(card, "Old town");
  assert.equal(zoneLabel(fallback), card);
  const line = describeZones({ zones: [harbour, fallback], buildings: [{ slug: "cr", name: "CrewHub", zoneId: "harbour" }, { slug: "ops", name: "Ops", zoneId: "default" }], plots: [], assignments: undefined, lookOf: () => "" }).find((l) => /without a zone/.test(l.text))!;
  assert.equal(line.text, `${card} (buildings without a zone): Ops.`);
});
