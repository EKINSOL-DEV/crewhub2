import assert from "node:assert/strict";
import test from "node:test";
import type { AgentPlacement, Building } from "@crewhub/world-model";
import { readBuildingPlan, planFromSearch, writeBuildingPlan, BUILDING_PLAN_KEY, DEFAULT_BUILDING_PLAN } from "../src/state/buildingPlan.ts";
import { whereWords } from "../src/world/agentCard/sections/now.ts";
import { renderAgentCard } from "../src/world/agentCard/registry.ts";
import { roomName, roomSummary, sameRoom, shortRoomName, signState } from "../src/world/roomWords.ts";
import { agent, building, object } from "./fixtures.ts";

const lane = (a: AgentPlacement) => (a.laneStatus === "unknown" ? "status unknown" : a.laneStatus);

/** A building with a worker on a ticket, an idle design agent, an analyst room nobody is in, two letters and a beacon. */
function house(): Building {
  const b = building(
    "cr",
    [agent("cr-dev-1", "workers", { deskTicketKey: "CR-12" }), agent("cr-design-1", "design", { laneStatus: "idle" })],
    [object("1", "storage"), object("2", "storage"), object("3", "review"), object("12", "workers", { deskOf: "cr-dev-1" })],
    ["analyst"],
  );
  const analyst = b.rooms.find((r) => r.kind === "analyst")!;
  analyst.present = false;
  analyst.emptyLabel = "no analyst agents active";
  b.mailbox = [
    { deliveryId: "d1", recipientId: "cr-dev-1", reason: "planned", state: "pending", flagged: true },
    { deliveryId: "d2", recipientId: "cr-dev-1", reason: "planned", state: "pending", flagged: true },
  ];
  b.archivedCount = 3;
  b.beacons = [{ ticketKey: "CR-9", agent: "cr-lead", text: "CR-9 needs attention" }];
  return b;
}

test("room names and signs: the classic room, or the hall that hosts it", () => {
  const b = house();
  assert.equal(roomName(b, "analyst"), "analyst");
  assert.equal(roomName(b, "analyst", "three-rooms"), "The floor");
  assert.equal(roomName(b, "review", "three-rooms"), "Administration");
  assert.equal(roomName(b, "lead-office", "three-rooms"), "Lead's office");
  assert.deepEqual(["lobby", "design", "lead-office"].map((k) => shortRoomName(k as "lobby", "three-rooms")), ["Admin", "Floor", "Lead"]);
  assert.equal(shortRoomName("design"), "Design");
  assert.ok(sameRoom("design", "meeting", "three-rooms") && !sameRoom("design", "meeting") && sameRoom("review", "review"));
  // An empty role room dims its classic sign; a hall's sign never dims.
  assert.deepEqual(signState(b, "analyst"), { dimmed: true, note: "no analyst agents active" });
  assert.deepEqual(signState(b, "analyst", "three-rooms"), { dimmed: false, note: null });
});

test("the room focus status line sums up a hall the way the text view does", () => {
  const b = house();
  assert.equal(roomSummary(b, "storage", lane, "three-rooms"), "Administration: Backlog 2, Planning 0, Review 1, Done 0; 2 flagged letters; 3 archived.");
  assert.equal(roomSummary(b, "design", lane, "three-rooms"), "The floor: cr-dev-1 at its desk on CR-12 (working), cr-design-1 (idle), the analyst desk empty.");
  assert.equal(roomSummary(b, "lead-office", lane, "three-rooms"), "Lead's office: cr-lead (working); beacon: CR-9 needs attention.");
  // Classic is untouched: the old words, from interiorLayout.
  assert.equal(roomSummary(b, "storage", lane), "storage: 2 tickets.");
  assert.equal(roomSummary(b, "analyst", lane), "analyst: empty and dimmed, no analyst agents active.");
});

test("the agent card's Now line names the hall and the desk in three-rooms wording", () => {
  const b = house();
  const dev = b.agents.find((a) => a.key === "cr-dev-1")!;
  assert.equal(whereWords(dev, b, "classic"), "cr, workers");
  assert.equal(whereWords(dev, b, "three-rooms"), "cr, on the floor at a worker desk");
  assert.equal(whereWords(b.agents[0]!, b, "three-rooms"), "cr, in the lead's office");
  assert.equal(whereWords({ ...dev, building: null, room: null }, null, "three-rooms"), "the town");
  const facts = { key: dev.key, name: dev.name, displayName: dev.displayName, registered: false, agent: dev, building: b, homes: [], work: null, workProject: null, stateWords: "working", progress: null, team: null, loops: null, lane: null, recent: [] };
  const ctx = { now: 0, freshness: { teamTs: null, ageSeconds: 0, stale: false }, loopsUrl: null };
  const row = (rooms?: "three-rooms" | "classic") => renderAgentCard(facts, rooms ? { ...ctx, rooms } : ctx).find((s) => s.id === "now")!.rows[0];
  assert.deepEqual(row("three-rooms"), { kind: "text", label: "Where", text: "cr, on the floor at a worker desk" });
  assert.deepEqual(row(), { kind: "text", label: "Where", text: "cr, workers" });
});

test("the Buildings setting: three rooms by default, kept in storage, and the URL wins", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(DEFAULT_BUILDING_PLAN, "three-rooms");
  assert.equal(readBuildingPlan(storage, ""), DEFAULT_BUILDING_PLAN);
  writeBuildingPlan("classic", storage);
  assert.equal(store.get(BUILDING_PLAN_KEY), "classic");
  assert.equal(readBuildingPlan(storage, ""), "classic");
  assert.equal(readBuildingPlan(storage, "?rooms=three"), "three-rooms");
  assert.equal(readBuildingPlan(null, "?rooms=classic"), "classic");
  assert.equal(planFromSearch("?rooms=four"), null);
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readBuildingPlan(throwing, ""), DEFAULT_BUILDING_PLAN);
  assert.doesNotThrow(() => writeBuildingPlan("classic", throwing));
});
